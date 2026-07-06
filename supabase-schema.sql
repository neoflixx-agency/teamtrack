-- ============================================================
-- TeamTrack — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. EMPLOYEES
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- 2. REPORTS
create table if not exists reports (
  id text primary key,
  name text not null,
  date date not null,
  login_time text,
  logout_time text,
  summary text,
  tasks jsonb default '[]',
  leave_type text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. LEAVES
create table if not exists leaves (
  id text primary key,
  name text not null,
  date date not null,
  type text not null,
  created_at timestamptz default now()
);

-- 4. SETTINGS (for admin PIN etc.)
create table if not exists settings (
  key text primary key,
  value text not null
);

-- Insert default admin PIN
insert into settings (key, value) values ('admin_pin', 'admin123')
on conflict (key) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY — allow all (public team app, no auth)
-- ============================================================
alter table employees enable row level security;
alter table reports enable row level security;
alter table leaves enable row level security;
alter table settings enable row level security;

create policy "Public read employees"  on employees for select using (true);
create policy "Public insert employees" on employees for insert with check (true);
create policy "Public delete employees" on employees for delete using (true);

create policy "Public read reports"  on reports for select using (true);
create policy "Public insert reports" on reports for insert with check (true);
create policy "Public update reports" on reports for update using (true);
create policy "Public delete reports" on reports for delete using (true);

create policy "Public read leaves"  on leaves for select using (true);
create policy "Public insert leaves" on leaves for insert with check (true);
create policy "Public delete leaves" on leaves for delete using (true);

create policy "Public read settings"  on settings for select using (true);
create policy "Public update settings" on settings for update using (true);

-- ============================================================
-- UPDATED_AT trigger for reports
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger reports_updated_at
  before update on reports
  for each row execute function update_updated_at();
