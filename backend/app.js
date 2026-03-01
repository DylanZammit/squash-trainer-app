'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes     = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const sessionRoutes  = require('./routes/sessions');

const app = express();

// ── Global Middleware ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve Frontend Static Files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/session', sessionRoutes);

// ── 404 Handler for unknown API routes ───────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── SPA Fallback ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

module.exports = app;
