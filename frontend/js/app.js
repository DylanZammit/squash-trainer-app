'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   Squash Trainer — Frontend Application
   ──────────────────────────────────────────────────────────────────────────
   Supports two modes, selected automatically:

   LOCAL_MODE  (Supabase URL is still a placeholder)
     → Uses the Express REST API at /api/* with a JWT stored in localStorage.
       Works with the Docker or bare-Node local dev setup — no Supabase needed.

   SUPABASE_MODE  (real Supabase URL + anon key in supabase-config.js)
     → Uses the Supabase JS SDK for auth and database access.
       This is the production mode used by the Android app.
══════════════════════════════════════════════════════════════════════════ */

// ── Mode detection ────────────────────────────────────────────────────────
// SUPABASE_URL and SUPABASE_ANON_KEY come from supabase-config.js
const LOCAL_MODE = !SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT_ID');

// Supabase client (created even in local mode, but never used)
const sb = supabase.createClient(
  LOCAL_MODE ? 'https://placeholder.supabase.co' : SUPABASE_URL,
  LOCAL_MODE ? 'placeholder'                      : SUPABASE_ANON_KEY
);

// ── Local-API helpers (used only in LOCAL_MODE) ───────────────────────────
function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

async function localFetch(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token   = localStorage.getItem('local_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res  = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ── Shot list ─────────────────────────────────────────────────────────────
const SHOTS = [
  'Right Front Drop',  'Left Front Drop',
  'Right Front Lob',   'Left Front Lob',
  'Right Back Drive',  'Left Back Drive',
  'Right Back Boast',  'Left Back Boast',
  'Cross Court Drive', 'Straight Drive',
  'Trickle Boast',     'Reverse Angle',
  'Volley Drop',       'Volley Drive',
];

// Enabled subset — persisted in localStorage, defaults to all shots
const SHOTS_KEY = 'squash_enabled_shots';
let enabledShots = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SHOTS_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      // Filter out any shots that no longer exist in SHOTS
      const valid = saved.filter(s => SHOTS.includes(s));
      if (valid.length > 0) return valid;
    }
  } catch (_) {}
  return [...SHOTS]; // default: all enabled
})();

// ── App state ─────────────────────────────────────────────────────────────
let currentUser = null;
let settings    = { min_interval: 5, max_interval: 15, session_duration: 300 };

let sessionActive   = false;
let sessionRowId    = null;
let sessionElapsed  = 0;
let nextShotIn      = 0;
let sessionTickerId = null;
let shotCountdownId = null;
let shotTimeoutId   = null;

// ── DOM shorthand ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utilities ─────────────────────────────────────────────────────────────
function fmtTime(totalSeconds) {
  const s   = Math.max(0, Math.floor(totalSeconds));
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtDate(isoString) {
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomShot() {
  const pool = enabledShots.length > 0 ? enabledShots : SHOTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Speech ────────────────────────────────────────────────────────────────

// Android Chrome loads voices asynchronously — pre-fetch them.
let _voices = [];
function loadVoices() {
  _voices = window.speechSynthesis?.getVoices() ?? [];
}
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

// Android Chrome requires the FIRST speak() call to happen synchronously
// inside the user-gesture handler (i.e. before any await). Call this as
// the very first line of startSession() — before loadSettings() or any
// network call — to unlock speech for the whole session.
// An empty string is ignored by some Android builds; use a zero-width
// space so the engine treats it as a real (but silent) utterance.
function unlockSpeech() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance('\u200B'); // zero-width space
  utt.volume = 0;
  utt.rate   = 10; // play at max speed so it ends instantly
  window.speechSynthesis.speak(utt);
}

// Chrome/Android silently pauses speechSynthesis after ~15 s of no speech.
// A pause→resume heartbeat prevents it. Only fire when no utterance is
// currently playing to avoid cutting off a shot call mid-word.
let _speechKeepAliveId = null;
function startSpeechKeepAlive() {
  if (!window.speechSynthesis) return;
  stopSpeechKeepAlive();
  _speechKeepAliveId = setInterval(() => {
    if (window.speechSynthesis.speaking) return; // don't interrupt active speech
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);
}
function stopSpeechKeepAlive() {
  clearInterval(_speechKeepAliveId);
  _speechKeepAliveId = null;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  // cancel() then immediate speak() has a race on Android — give the engine
  // one tick to finish cancelling before queuing the new utterance.
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = 0.9;
  utt.pitch = 1.0;
  // Prefer an English voice; avoids wrong-language default on Android.
  const english = _voices.find(v => /en[-_]/i.test(v.lang));
  if (english) utt.voice = english;
  setTimeout(() => window.speechSynthesis.speak(utt), 50);
}

// ── Auth helpers ──────────────────────────────────────────────────────────
function setAuthMessage(msg, type = '') {
  const el  = $('auth-message');
  el.textContent = msg;
  el.className   = `message ${type}`;
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;

  try {
    if (LOCAL_MODE) {
      const data = await localFetch('/api/login', 'POST', { email, password });
      localStorage.setItem('local_token', data.token);
      currentUser = { id: parseJwt(data.token).id, email: data.email };
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      currentUser = data.user;
    }
    showApp();
  } catch (err) {
    setAuthMessage(err.message, 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email    = $('signup-email').value.trim();
  const password = $('signup-password').value;

  try {
    if (LOCAL_MODE) {
      const data = await localFetch('/api/signup', 'POST', { email, password });
      localStorage.setItem('local_token', data.token);
      currentUser = { id: parseJwt(data.token).id, email: data.email };
      showApp();
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw new Error(error.message);

      if (data.user) {
        currentUser = data.user;
        await sb.from('user_settings').upsert(
          { user_id: currentUser.id, min_interval: 5, max_interval: 15, session_duration: 300 },
          { onConflict: 'user_id' }
        );
        showApp();
      } else {
        setAuthMessage('Check your email to confirm your account, then log in.', 'success');
      }
    }
  } catch (err) {
    setAuthMessage(err.message, 'error');
  }
}

async function handleLogout() {
  stopSession(false);
  if (LOCAL_MODE) {
    localStorage.removeItem('local_token');
  } else {
    await sb.auth.signOut();
  }
  currentUser = null;
  showAuth();
}

// ── Navigation ────────────────────────────────────────────────────────────
function showAuth() {
  $('auth-section').classList.remove('hidden');
  $('app-section').classList.add('hidden');
}

function showApp() {
  $('auth-section').classList.add('hidden');
  $('app-section').classList.remove('hidden');
  $('user-email').textContent = currentUser.email;
  loadSettings();
  showView('settings');
}

function showView(name) {
  ['settings', 'session', 'history'].forEach(v => {
    $(`${v}-view`).classList.add('hidden');
    const tab = $(`tab-${v}`);
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });
  $(`${name}-view`).classList.remove('hidden');
  const activeTab = $(`tab-${name}`);
  activeTab.classList.add('active');
  activeTab.setAttribute('aria-selected', 'true');

  if (name === 'history') loadHistory();
}

// ── Settings ──────────────────────────────────────────────────────────────

// Build the shot-chip grid once on first load
function buildShotChips() {
  const grid = $('shots-grid');
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = '1';

  SHOTS.forEach(shot => {
    const id      = 'shot-' + shot.replace(/\s+/g, '-').toLowerCase();
    const wrapper = document.createElement('div');
    wrapper.className = 'shot-chip';

    const cb  = document.createElement('input');
    cb.type   = 'checkbox';
    cb.id     = id;
    cb.value  = shot;
    cb.checked = enabledShots.includes(shot);

    const lbl = document.createElement('label');
    lbl.htmlFor     = id;
    lbl.textContent = shot;

    wrapper.appendChild(cb);
    wrapper.appendChild(lbl);
    grid.appendChild(wrapper);
  });

  $('shots-all').addEventListener('click', () => {
    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  $('shots-none').addEventListener('click', () => {
    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });
}

async function loadSettings() {
  buildShotChips();
  try {
    let data;
    if (LOCAL_MODE) {
      data = await localFetch('/api/settings');
    } else {
      const res = await sb
        .from('user_settings')
        .select('min_interval, max_interval, session_duration')
        .eq('user_id', currentUser.id)
        .single();
      if (res.error) throw new Error(res.error.message);
      data = res.data;
    }
    if (data) {
      settings = data;
      $('setting-a').value = data.min_interval;
      $('setting-b').value = data.max_interval;
      $('setting-c').value = data.session_duration;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const a   = parseInt($('setting-a').value, 10);
  const b   = parseInt($('setting-b').value, 10);
  const c   = parseInt($('setting-c').value, 10);
  const msg = $('settings-message');

  if (a >= b) {
    msg.textContent = 'Min interval (A) must be less than max interval (B)';
    msg.className   = 'message error';
    return;
  }

  // Read shot selection
  const selected = Array.from(
    $('shots-grid').querySelectorAll('input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (selected.length === 0) {
    msg.textContent = 'Select at least one shot';
    msg.className   = 'message error';
    return;
  }

  try {
    if (LOCAL_MODE) {
      await localFetch('/api/settings', 'POST', { min_interval: a, max_interval: b, session_duration: c });
    } else {
      const { error } = await sb.from('user_settings').upsert(
        { user_id: currentUser.id, min_interval: a, max_interval: b, session_duration: c },
        { onConflict: 'user_id' }
      );
      if (error) throw new Error(error.message);
    }
    settings      = { min_interval: a, max_interval: b, session_duration: c };
    enabledShots  = selected;
    localStorage.setItem(SHOTS_KEY, JSON.stringify(selected));

    msg.textContent = 'Settings saved!';
    msg.className   = 'message success';
    setTimeout(() => { msg.textContent = ''; msg.className = 'message'; }, 2500);
  } catch (err) {
    msg.textContent = err.message;
    msg.className   = 'message error';
  }
}

// ── Session — start ───────────────────────────────────────────────────────
async function startSession() {
  if (sessionActive) return;

  // *** MUST be synchronous — before any await — so Android Chrome still
  //     considers this call to be inside the user-gesture handler. ***
  unlockSpeech();
  startSpeechKeepAlive();

  await loadSettings();

  try {
    if (LOCAL_MODE) {
      const data   = await localFetch('/api/session/start', 'POST');
      sessionRowId = data.session_id;
    } else {
      const now = new Date().toISOString();
      const { data, error } = await sb
        .from('session_history')
        .insert({ user_id: currentUser.id, session_start: now })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      sessionRowId = data.id;
    }

    sessionActive  = true;
    sessionElapsed = 0;

    $('start-btn').classList.add('hidden');
    $('stop-btn').classList.remove('hidden');
    $('session-display').classList.remove('hidden');
    $('shot-display').classList.remove('hidden');
    $('session-elapsed').textContent   = '00:00';
    $('session-remaining').textContent = fmtTime(settings.session_duration);

    sessionTickerId = setInterval(tickSession, 1000);
    scheduleNextShot();
  } catch (err) {
    stopSpeechKeepAlive(); // clean up if session failed to start
    alert('Failed to start session: ' + err.message);
  }
}

// ── Session — per-second tick ─────────────────────────────────────────────
function tickSession() {
  sessionElapsed++;
  const remaining = settings.session_duration - sessionElapsed;
  $('session-elapsed').textContent   = fmtTime(sessionElapsed);
  $('session-remaining').textContent = fmtTime(Math.max(0, remaining));
  if (remaining <= 0) stopSession(true);
}

// ── Session — shot scheduler ──────────────────────────────────────────────
function scheduleNextShot() {
  if (!sessionActive) return;

  const interval = randInt(settings.min_interval, settings.max_interval);
  nextShotIn     = interval;
  updateCountdown();

  shotCountdownId = setInterval(() => {
    if (!sessionActive) { clearInterval(shotCountdownId); return; }
    nextShotIn = Math.max(0, nextShotIn - 1);
    updateCountdown();
    if (nextShotIn <= 0) clearInterval(shotCountdownId);
  }, 1000);

  shotTimeoutId = setTimeout(() => {
    if (!sessionActive) return;
    const shot = randomShot();
    displayShot(shot);
    speak(shot);
    scheduleNextShot();
  }, interval * 1000);
}

function updateCountdown() {
  $('next-shot-countdown').textContent = nextShotIn > 0 ? String(nextShotIn) : '-';
}

function displayShot(shot) {
  const el = $('current-shot');
  el.textContent = shot;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ── Session — stop ────────────────────────────────────────────────────────
async function stopSession(save = true) {
  if (!sessionActive) return;

  sessionActive = false;
  clearInterval(sessionTickerId);
  clearInterval(shotCountdownId);
  clearTimeout(shotTimeoutId);
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  stopSpeechKeepAlive();

  $('start-btn').classList.remove('hidden');
  $('stop-btn').classList.add('hidden');
  $('session-display').classList.add('hidden');
  $('shot-display').classList.add('hidden');
  $('current-shot').textContent        = '-';
  $('next-shot-countdown').textContent = '-';

  if (save && sessionRowId) {
    try {
      if (LOCAL_MODE) {
        await localFetch('/api/session/end', 'POST', { session_id: sessionRowId });
      } else {
        const now = new Date().toISOString();
        await sb.from('session_history').update({
          session_end:      now,
          duration_seconds: sessionElapsed,
        }).eq('id', sessionRowId);
      }
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }

  sessionRowId = null;
}

// ── History ───────────────────────────────────────────────────────────────
async function loadHistory() {
  const list = $('history-list');
  list.innerHTML = '<p class="loading-msg">Loading&hellip;</p>';

  try {
    let sessions;
    if (LOCAL_MODE) {
      sessions = await localFetch('/api/session/history');
    } else {
      const { data, error } = await sb
        .from('session_history')
        .select('id, session_start, session_end, duration_seconds')
        .eq('user_id', currentUser.id)
        .order('session_start', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      sessions = data;
    }

    if (!sessions || sessions.length === 0) {
      list.innerHTML = '<p class="empty">No sessions yet — start training!</p>';
      return;
    }

    list.innerHTML = sessions.map(s => {
      const durEl = s.duration_seconds != null
        ? `<div class="history-duration">${fmtTime(s.duration_seconds)}</div>`
        : `<div class="history-duration incomplete">Incomplete</div>`;
      return `
        <div class="history-item">
          <div class="history-date">${fmtDate(s.session_start)}</div>
          ${durEl}
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<p class="empty" style="color:var(--danger)">${err.message}</p>`;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Auth forms
  $('login-form').addEventListener('submit', handleLogin);
  $('signup-form').addEventListener('submit', handleSignup);

  // Panel switching
  $('show-signup').addEventListener('click', e => {
    e.preventDefault();
    $('login-panel').classList.add('hidden');
    $('signup-panel').classList.remove('hidden');
    setAuthMessage('');
  });
  $('show-login').addEventListener('click', e => {
    e.preventDefault();
    $('signup-panel').classList.add('hidden');
    $('login-panel').classList.remove('hidden');
    setAuthMessage('');
  });

  $('logout-btn').addEventListener('click', handleLogout);

  // Tab navigation
  $('tab-settings').addEventListener('click', () => showView('settings'));
  $('tab-session').addEventListener('click',  () => showView('session'));
  $('tab-history').addEventListener('click',  () => showView('history'));

  // Settings form
  $('settings-form').addEventListener('submit', handleSaveSettings);

  // Session buttons
  $('start-btn').addEventListener('click', startSession);
  $('stop-btn').addEventListener('click',  () => stopSession(true));

  // Restore existing session
  if (LOCAL_MODE) {
    const token = localStorage.getItem('local_token');
    if (token) {
      try {
        const payload = parseJwt(token);
        if (payload.exp * 1000 > Date.now()) {
          currentUser = { id: payload.id, email: payload.email };
          showApp();
        } else {
          localStorage.removeItem('local_token');
          showAuth();
        }
      } catch {
        localStorage.removeItem('local_token');
        showAuth();
      }
    } else {
      showAuth();
    }
  } else {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      showApp();
    } else {
      showAuth();
    }
    sb.auth.onAuthStateChange((_event, session) => {
      if (session) currentUser = session.user;
    });
  }
})();

// Register service worker (enables offline use + PWA install on HTTPS)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {/* silently ignore on HTTP */});
  });
}
