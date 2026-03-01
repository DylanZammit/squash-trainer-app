'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const sessionRoutes = require('./routes/sessions');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Global Middleware ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve Frontend Static Files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────────────────────
//   POST /api/signup
//   POST /api/login
app.use('/api', authRoutes);

//   GET  /api/settings
//   POST /api/settings
app.use('/api/settings', settingsRoutes);

//   POST /api/session/start
//   POST /api/session/end
//   GET  /api/session/history
app.use('/api/session', sessionRoutes);

// ── 404 Handler for unknown API routes ───────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── SPA Fallback — all non-API requests serve index.html ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Squash Trainer running at http://localhost:${PORT}`);
});
