'use strict';

/**
 * Auth Routes
 * POST /api/signup  — create account, return JWT
 * POST /api/login   — verify credentials, return JWT
 */

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb }       = require('../db');
const { JWT_SECRET }  = require('../middleware/auth');

// ── POST /api/signup ──────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const db           = await getDb();
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.run(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );
    const userId = result.lastID;

    // Provision default settings for the new user
    await db.run(
      `INSERT INTO user_settings (user_id, min_interval, max_interval, session_duration)
       VALUES (?, 5, 15, 300)`,
      [userId]
    );

    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, email });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/login ───────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const db   = await getDb();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
