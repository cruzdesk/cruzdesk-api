-- ═══════════════════════════════════════════
--  CruzDesk-1989  |  Database Schema
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(50)  UNIQUE NOT NULL,
  password    TEXT         NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'admin',
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS visitors (
  id          SERIAL PRIMARY KEY,
  ip_address  VARCHAR(45)  NOT NULL,
  user_agent  TEXT,
  page        VARCHAR(255) NOT NULL DEFAULT '/',
  country     VARCHAR(100),
  city        VARCHAR(100),
  visited_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(100) NOT NULL,
  description TEXT         NOT NULL,
  url         VARCHAR(500),
  icon        VARCHAR(10)  DEFAULT '🚀',
  tag         VARCHAR(50),
  language    VARCHAR(50),
  lang_color  VARCHAR(10)  DEFAULT '#00f0ff',
  active      BOOLEAN      NOT NULL DEFAULT true,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitors_ip       ON visitors(ip_address);
CREATE INDEX IF NOT EXISTS idx_visitors_date     ON visitors(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_active   ON projects(active, sort_order);
