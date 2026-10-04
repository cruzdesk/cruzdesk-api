'use strict';

const express   = require('express');
const cors      = require('cors');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { Pool }  = require('pg');
const fs        = require('fs');
const path      = require('path');

// ── Config ──────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cruzdesk_secret_2026_change_in_prod';
const DB_URL     = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('❌  DATABASE_URL no está definida. Configúrala en Railway.');
  process.exit(1);
}

// ── Base de datos ────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

// ── App ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────
function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Init DB: schema + seed usuario inicial ───────────────────────────────
async function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Insertar javier.cruz si no existe
  const exists = await pool.query(
    "SELECT id FROM users WHERE username = $1", ['javier.cruz']
  );
  if (exists.rows.length === 0) {
    const hash = await bcrypt.hash('Javy4471', 12);
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')",
      ['javier.cruz', hash]
    );
    console.log('✅  Usuario javier.cruz creado');
  }

  console.log('✅  Base de datos lista');
}

// ════════════════════════════════════════════════════════════════════════
//  RUTAS PÚBLICAS
// ════════════════════════════════════════════════════════════════════════

// Health check
app.get('/', (req, res) => res.json({ status: 'CruzDesk API v1.0 — online' }));

// ── GET /api/projects  → proyectos activos (para la pantalla principal) ──
app.get('/api/projects', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, description, url, icon, tag, language, lang_color, sort_order
       FROM projects
       WHERE active = true
       ORDER BY sort_order ASC, id ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/track  → registrar visita ──────────────────────────────────
app.post('/api/track', async (req, res) => {
  try {
    const ip         = getIP(req);
    const { page, user_agent } = req.body;
    await pool.query(
      `INSERT INTO visitors (ip_address, user_agent, page)
       VALUES ($1, $2, $3)`,
      [ip, user_agent || req.headers['user-agent'] || '', page || '/']
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Faltan credenciales' });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND active = true",
      [username]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    await pool.query(
      "UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
//  RUTAS PROTEGIDAS (requieren JWT)
// ════════════════════════════════════════════════════════════════════════

// ── Usuarios ─────────────────────────────────────────────────────────────
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, role, active, created_at, last_login FROM users ORDER BY id"
  );
  res.json(rows);
});

app.post('/api/admin/users', authMiddleware, async (req, res) => {
  const { username, password, role = 'admin' } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username y password requeridos' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at",
      [username, hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:id', authMiddleware, async (req, res) => {
  const { active, password, role } = req.body;
  const { id } = req.params;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, id]);
    }
    if (active !== undefined)
      await pool.query("UPDATE users SET active = $1 WHERE id = $2", [active, id]);
    if (role)
      await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
  // No borrar al usuario 1 (javier.cruz)
  if (req.params.id === '1')
    return res.status(403).json({ error: 'No se puede eliminar el usuario principal' });
  await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// ── Visitantes ────────────────────────────────────────────────────────────
app.get('/api/admin/visitors', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { rows } = await pool.query(
    `SELECT id, ip_address, user_agent, page, visited_at
     FROM visitors
     ORDER BY visited_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

app.get('/api/admin/visitors/stats', authMiddleware, async (req, res) => {
  const [total, today, unique, topPages] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM visitors"),
    pool.query("SELECT COUNT(*) FROM visitors WHERE visited_at >= CURRENT_DATE"),
    pool.query("SELECT COUNT(DISTINCT ip_address) FROM visitors"),
    pool.query(
      `SELECT page, COUNT(*) as visits
       FROM visitors GROUP BY page ORDER BY visits DESC LIMIT 5`
    )
  ]);
  res.json({
    total:    parseInt(total.rows[0].count),
    today:    parseInt(today.rows[0].count),
    unique:   parseInt(unique.rows[0].count),
    topPages: topPages.rows
  });
});

// ── Proyectos ─────────────────────────────────────────────────────────────
app.get('/api/admin/projects', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM projects ORDER BY sort_order ASC, id ASC"
  );
  res.json(rows);
});

app.post('/api/admin/projects', authMiddleware, async (req, res) => {
  const { title, description, url, icon, tag, language, lang_color, sort_order } = req.body;
  if (!title || !description)
    return res.status(400).json({ error: 'title y description requeridos' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (title, description, url, icon, tag, language, lang_color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, description, url||'', icon||'🚀', tag||'', language||'', lang_color||'#00f0ff', sort_order||0]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/projects/:id', authMiddleware, async (req, res) => {
  const fields = ['title','description','url','icon','tag','language','lang_color','active','sort_order'];
  const updates = [];
  const vals    = [];
  let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      vals.push(req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  updates.push(`updated_at = NOW()`);
  await pool.query(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = $${i}`,
    vals
  );
  res.json({ ok: true });
});

app.delete('/api/admin/projects/:id', authMiddleware, async (req, res) => {
  await pool.query("DELETE FROM projects WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// ── Arranque ──────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀  CruzDesk API corriendo en puerto ${PORT}`));
}).catch(err => {
  console.error('❌  Error inicializando DB:', err.message);
  process.exit(1);
});
