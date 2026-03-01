-- ============================================================
-- Squash Trainer — Supabase (PostgreSQL) Schema
-- Run this entire file in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → Paste → Run
-- ============================================================

-- ── user_settings ────────────────────────────────────────────
-- user_id references Supabase's built-in auth.users table.
-- UNIQUE ensures one settings row per user (upsert-safe).

CREATE TABLE IF NOT EXISTS public.user_settings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    min_interval     INT  NOT NULL DEFAULT 5,    -- A (seconds)
    max_interval     INT  NOT NULL DEFAULT 15,   -- B (seconds)
    session_duration INT  NOT NULL DEFAULT 300,  -- C (seconds)
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Each user can only see and modify their own row
CREATE POLICY "user_settings: owner full access"
    ON public.user_settings
    FOR ALL
    TO authenticated
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── session_history ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end      TIMESTAMPTZ,
    duration_seconds INT
);

ALTER TABLE public.session_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_history: owner full access"
    ON public.session_history
    FOR ALL
    TO authenticated
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_session_history_user_start
    ON public.session_history(user_id, session_start DESC);
