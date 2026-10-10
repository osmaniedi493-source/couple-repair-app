-- Run this once against your Postgres database (e.g. via the Neon/Vercel
-- Postgres dashboard's SQL editor, or `psql "$POSTGRES_URL" -f sql/schema.sql`)
-- before the app can read/write real data.

create table if not exists users (
  id text primary key,
  phone text unique not null,
  name text not null,
  avatar_key text not null,
  couple_id text,
  created_at timestamptz not null default now()
);

create table if not exists couples (
  id text primary key,
  member_ids text[] not null,
  created_at timestamptz not null default now()
);

create index if not exists users_couple_idx on users (couple_id);

create table if not exists pair_codes (
  code text primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists pair_codes_user_idx on pair_codes (user_id);

create table if not exists timeline_entries (
  id text primary key,
  couple_id text not null,
  author_user_id text not null,
  title text not null,
  scene text not null,
  emotions text[] not null default '{}',
  time timestamptz not null,
  what_happened text,
  why_it_matters text,
  created_at timestamptz not null default now()
);

create index if not exists timeline_entries_couple_idx on timeline_entries (couple_id);

-- One row per (couple, timeline entry): the *current* mediation session for
-- that conflict. Complex nested shape (messages, control state, analysis)
-- kept as JSONB rather than normalized further.
create table if not exists mediation_sessions (
  couple_id text not null,
  entry_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, entry_id)
);

-- Archived sessions (from "reset"), used for /patterns history + profiles.
create table if not exists mediation_history (
  id bigserial primary key,
  couple_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists mediation_history_couple_idx on mediation_history (couple_id);

create table if not exists forgive_items (
  id text primary key,
  couple_id text not null,
  kind text not null,
  author_user_id text not null,
  timeline_entry_id text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists forgive_items_couple_idx on forgive_items (couple_id);

create table if not exists pattern_profiles (
  couple_id text not null,
  user_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);
