-- Unshafted v0.9: profile-backed Drive backup preference
-- Run against Supabase SQL editor after 001_schema_and_profiles.sql

ALTER TABLE unshafted.profiles
  ADD COLUMN IF NOT EXISTS drive_backup_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (drive_backup_enabled)
  ON unshafted.profiles TO authenticated;

GRANT UPDATE (drive_backup_enabled, updated_at)
  ON unshafted.profiles TO authenticated;
