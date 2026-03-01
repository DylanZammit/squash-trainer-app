'use strict';

/**
 * Settings Routes
 * GET  /api/settings  — fetch current user's A/B/C settings
 * POST /api/settings  — save/update A/B/C settings
 *
 * All intervals are stored and returned in seconds.
 */

const express = require('express');
const router  = express.Router();
const { getDb }            = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ── GET /api/settings ─────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db       = await getDb();
    const settings = await db.get(
      'SELECT min_interval, max_interval, session_duration FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );
    return res.json(settings || { min_interval: 5, max_interval: 15, session_duration: 300 });
  } catch (err) {
    console.error('GET /settings error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/settings ────────────────────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  const { min_interval, max_interval, session_duration } = req.body;

  if (min_interval == null || max_interval == null || session_duration == null) {
    return res.status(400).json({ error: 'min_interval, max_interval, and session_duration are required' });
  }

  const a = parseInt(min_interval, 10);
  const b = parseInt(max_interval, 10);
  const c = parseInt(session_duration, 10);

  if (isNaN(a) || isNaN(b) || isNaN(c)) {
    return res.status(400).json({ error: 'All values must be integers' });
  }
  if (a < 1 || b < 1 || c < 1) {
    return res.status(400).json({ error: 'All values must be positive' });
  }
  if (a >= b) {
    return res.status(400).json({ error: 'min_interval (A) must be less than max_interval (B)' });
  }

  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO user_settings (user_id, min_interval, max_interval, session_duration)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         min_interval     = excluded.min_interval,
         max_interval     = excluded.max_interval,
         session_duration = excluded.session_duration`,
      [req.user.id, a, b, c]
    );
    return res.json({ min_interval: a, max_interval: b, session_duration: c });
  } catch (err) {
    console.error('POST /settings error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
