-- Unshafted Phase 1: Schema + Profiles
-- Run against Supabase SQL editor
-- Date: 2026-04-14

-- Custom schema to keep Unshafted tables separate from public
CREATE SCHEMA IF NOT EXISTS unshafted;

-- Profiles table — auto-populated on Google sign-up via trigger
CREATE TABLE unshafted.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security
ALTER TABLE unshafted.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON unshafted.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON unshafted.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION unshafted.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO unshafted.profiles (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION unshafted.handle_new_user();
