/*
# Create schedule database tables (single-tenant, no auth)

This migration creates the database schema for a student schedule / homework
tracker app. The app has no sign-in screen, so all tables are single-tenant
and intentionally public/shared: any visitor using the anon key can read and
write all data.

## New Tables

1. `app_settings` — stores the group name and any app-level configuration.
   - `id` (int, primary key, always 1 — singleton row)
   - `group_name` (text, not null)
   - `updated_at` (timestamptz)

2. `lessons` — one row per scheduled class (пара).
   - `id` (uuid, primary key)
   - `date` (date, not null) — YYYY-MM-DD
   - `start_time` (text) — HH:MM
   - `end_time` (text) — HH:MM
   - `number` (int) — pair number 1..N
   - `subject` (text, not null)
   - `subgroup` (text, nullable) — e.g. "п/г 1"
   - `type` (text, not null) — lecture | practice | lab | exam | credit
   - `teacher` (text)
   - `room` (text)
   - `note` (text, nullable) — personal note for this lesson
   - `is_window` (boolean, default false) — "Окно" free slot
   - `created_at` (timestamptz)

3. `homework` — homework items attached to a lesson (many per lesson).
   - `id` (uuid, primary key)
   - `lesson_id` (uuid, foreign key → lessons.id ON DELETE CASCADE)
   - `text` (text, not null)
   - `done` (boolean, default false)
   - `created_at` (timestamptz)
   - `attachments` (jsonb, default '[]') — array of { name, dataUrl }

4. `undated_homework` — homework saved with no matching future lesson, tied to
   the calendar week it was created in.
   - `id` (uuid, primary key)
   - `week_key` (date, not null) — Monday of the creation week
   - `subject` (text, not null)
   - `type` (text, not null default '') — lesson type or '' for "any"
   - `text` (text, not null)
   - `done` (boolean, default false)
   - `created_at` (timestamptz)
   - `attachments` (jsonb, default '[]')

## Security

- RLS enabled on all tables.
- All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because this is a single-tenant app with no sign-in — all data is intentionally
  public and shared.
- Grants: SELECT, INSERT, UPDATE, DELETE on all tables to anon + authenticated.

## Important Notes

1. The `homework` table is separate from `lessons` (not a jsonb column) so each
   homework item has its own id, done flag, and can be individually toggled/deleted.
2. `attachments` is jsonb to store file name + data URL pairs without a separate table.
3. Foreign key from `homework.lesson_id` to `lessons.id` uses ON DELETE CASCADE so
   deleting a lesson removes its homework automatically.
*/

-- ── app_settings (singleton) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  group_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app_settings TO anon, authenticated;

DROP POLICY IF EXISTS "settings_select" ON app_settings;
CREATE POLICY "settings_select" ON app_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "settings_insert" ON app_settings;
CREATE POLICY "settings_insert" ON app_settings
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "settings_update" ON app_settings;
CREATE POLICY "settings_update" ON app_settings
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "settings_delete" ON app_settings;
CREATE POLICY "settings_delete" ON app_settings
  FOR DELETE TO anon, authenticated USING (true);

-- ── lessons ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  number int NOT NULL DEFAULT 1,
  subject text NOT NULL,
  subgroup text,
  type text NOT NULL DEFAULT 'practice',
  teacher text NOT NULL DEFAULT '',
  room text NOT NULL DEFAULT '',
  note text,
  is_window boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons (date);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON lessons TO anon, authenticated;

DROP POLICY IF EXISTS "lessons_select" ON lessons;
CREATE POLICY "lessons_select" ON lessons
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "lessons_insert" ON lessons;
CREATE POLICY "lessons_insert" ON lessons
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "lessons_update" ON lessons;
CREATE POLICY "lessons_update" ON lessons
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lessons_delete" ON lessons;
CREATE POLICY "lessons_delete" ON lessons
  FOR DELETE TO anon, authenticated USING (true);

-- ── homework (many per lesson) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_homework_lesson_id ON homework (lesson_id);

ALTER TABLE homework ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON homework TO anon, authenticated;

DROP POLICY IF EXISTS "homework_select" ON homework;
CREATE POLICY "homework_select" ON homework
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "homework_insert" ON homework;
CREATE POLICY "homework_insert" ON homework
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "homework_update" ON homework;
CREATE POLICY "homework_update" ON homework
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "homework_delete" ON homework;
CREATE POLICY "homework_delete" ON homework
  FOR DELETE TO anon, authenticated USING (true);

-- ── undated_homework ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS undated_homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key date NOT NULL,
  subject text NOT NULL,
  type text NOT NULL DEFAULT '',
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_undated_hw_week_key ON undated_homework (week_key);

ALTER TABLE undated_homework ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON undated_homework TO anon, authenticated;

DROP POLICY IF EXISTS "undated_select" ON undated_homework;
CREATE POLICY "undated_select" ON undated_homework
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "undated_insert" ON undated_homework;
CREATE POLICY "undated_insert" ON undated_homework
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "undated_update" ON undated_homework;
CREATE POLICY "undated_update" ON undated_homework
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "undated_delete" ON undated_homework;
CREATE POLICY "undated_delete" ON undated_homework
  FOR DELETE TO anon, authenticated USING (true);