create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  owner_phone text,
  partner_phone text,
  created_at timestamptz not null default now()
);

create table if not exists conflict_records (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) on delete cascade,
  title text not null,
  happened_at timestamptz,
  scene text,
  emotions text[] default '{}',
  mediation jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists repair_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references couples(id) on delete cascade,
  record_id uuid references conflict_records(id) on delete set null,
  type text not null check (type in ('letter', 'todo', 'deal')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
