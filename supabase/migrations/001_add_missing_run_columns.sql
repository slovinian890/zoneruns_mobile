-- Migration: add columns that were missing from the initial runs table creation
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

ALTER TABLE runs ADD COLUMN IF NOT EXISTS run_time      TIME;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS calories      INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS elevation_m   INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS avg_heart_rate INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER;
