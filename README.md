# CruzDesk API

Backend para el Hub Central CruzDesk-1989.  
Node.js + Express + PostgreSQL.

## Variables de entorno (Railway)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de conexión PostgreSQL (Railway la pone automáticamente) |
| `JWT_SECRET` | Secreto para firmar tokens JWT (pon uno largo y aleatorio) |
| `PORT` | Puerto (Railway lo maneja) |

## Endpoints

### Públicos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/projects` | Proyectos activos (para pantalla principal) |
| POST | `/api/track` | Registrar visita `{ page, user_agent }` |
| POST | `/api/auth/login` | Login `{ username, password }` → `{ token }` |

### Admin (requieren `Authorization: Bearer <token>`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/users` | Listar usuarios |
| POST | `/api/admin/users` | Crear usuario |
| PATCH | `/api/admin/users/:id` | Editar usuario |
| DELETE | `/api/admin/users/:id` | Eliminar usuario |
| GET | `/api/admin/visitors` | Listar visitantes |
| GET | `/api/admin/visitors/stats` | Estadísticas de visitas |
| GET | `/api/admin/projects` | Listar todos los proyectos |
| POST | `/api/admin/projects` | Crear proyecto |
| PATCH | `/api/admin/projects/:id` | Editar proyecto |
| DELETE | `/api/admin/projects/:id` | Eliminar proyecto |
