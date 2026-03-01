-- ============================================================
-- Squash Trainer — SQLite Schema
-- DBA Agent Deliverable
-- ============================================================

-- ERD (text description):
--   users ──< user_settings  (one-to-one, user_id UNIQUE in user_settings)
--   users ──< session_history (one-to-many, user_id FK)

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── user_settings ────────────────────────────────────────────
-- Stores A (min_interval), B (max_interval), C (session_duration)
-- All intervals are stored in seconds.
-- UNIQUE on user_id enforces the one-to-one relationship.
CREATE TABLE IF NOT EXISTS user_settings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL UNIQUE,
    min_interval     INTEGER NOT NULL DEFAULT 5,    -- A (seconds)
    max_interval     INTEGER NOT NULL DEFAULT 15,   -- B (seconds)
    session_duration INTEGER NOT NULL DEFAULT 300,  -- C (seconds)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── session_history ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_history (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    session_start    DATETIME NOT NULL,
    session_end      DATETIME,
    duration_seconds INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_history_user_id
    ON session_history(user_id);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
    ON user_settings(user_id);
