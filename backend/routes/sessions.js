'use strict';

/**
 * Session Routes
 * POST /api/session/start    — open a new session row, return session_id
 * POST /api/session/end      — close session, compute + store duration
 * GET  /api/session/history  — list last 50 sessions for the user
 */

const express = require('express');
const router  = express.Router();
const { getDb }            = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ── POST /api/session/start ───────────────────────────────────────────────
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const db     = await getDb();
    const now    = new Date().toISOString();
    const result = await db.run(
      'INSERT INTO session_history (user_id, session_start) VALUES (?, ?)',
      [req.user.id, now]
    );
    return res.status(201).json({ session_id: result.lastID, session_start: now });
  } catch (err) {
    console.error('POST /session/start error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/session/end ─────────────────────────────────────────────────
router.post('/end', authenticateToken, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const db      = await getDb();
    const session = await db.get(
      'SELECT * FROM session_history WHERE id = ? AND user_id = ?',
      [session_id, req.user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.session_end) {
      return res.status(409).json({ error: 'Session already ended' });
    }

    const now             = new Date();
    const durationSeconds = Math.round((now - new Date(session.session_start)) / 1000);

    await db.run(
      'UPDATE session_history SET session_end = ?, duration_seconds = ? WHERE id = ?',
      [now.toISOString(), durationSeconds, session_id]
    );

    return res.json({ session_id, session_end: now.toISOString(), duration_seconds: durationSeconds });
  } catch (err) {
    console.error('POST /session/end error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/session/history ──────────────────────────────────────────────
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const db       = await getDb();
    const sessions = await db.all(
      `SELECT id, session_start, session_end, duration_seconds
       FROM session_history
       WHERE user_id = ?
       ORDER BY session_start DESC
       LIMIT 50`,
      [req.user.id]
    );
    return res.json(sessions);
  } catch (err) {
    console.error('GET /session/history error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
