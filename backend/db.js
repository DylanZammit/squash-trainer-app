'use strict';

const path   = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Singleton promise — all modules await this to get the db handle.
let _db = null;

async function getDb() {
  if (_db) return _db;

  _db = await open({
    filename: process.env.DB_PATH || path.join(__dirname, 'squash.db'),
    driver: sqlite3.Database,
  });

  await _db.exec('PRAGMA journal_mode = WAL;');
  await _db.exec('PRAGMA foreign_keys = ON;');

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT    UNIQUE NOT NULL,
        password_hash TEXT    NOT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          INTEGER NOT NULL UNIQUE,
        min_interval     INTEGER NOT NULL DEFAULT 5,
        max_interval     INTEGER NOT NULL DEFAULT 15,
        session_duration INTEGER NOT NULL DEFAULT 300,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_history (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          INTEGER NOT NULL,
        session_start    DATETIME NOT NULL,
        session_end      DATETIME,
        duration_seconds INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_history_user_id
        ON session_history(user_id);
  `);

  return _db;
}

module.exports = { getDb };
