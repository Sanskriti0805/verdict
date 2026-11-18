-- Verdict — Supabase schema.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Security model: anon may INSERT and SELECT. Nothing else, ever.
-- Granting anon UPDATE or DELETE would let any visitor rewrite or wipe
-- another student's row, and this page names real companies. Don't.

-- ---------------------------------------------------------------- entries
create table if not exists public.entries (
  id                 uuid primary key,
  created_at         timestamptz not null default now(),
  client_ts          text,

  company_raw        text not null,
  company_key        text not null,
  company_display    text not null,

  role_family        text not null,
  round              text not null,
  outcome            text not null,
  reason_code        text not null,

  college_raw        text,
  reason_source      text,

  session_id         text not null,
  session_entry_seq  int  not null default 1,
  source             text not null default 'direct',
  device             text not null default 'desktop',
  time_to_submit_ms  int,
  is_test            boolean not null default false,
  status             text not null default 'counted'
);

-- The aggregate only ever reads counted rows, and the ranking sorts by company.
create index if not exists entries_status_company_idx
  on public.entries (status, company_key);

-- ---------------------------------------------------------------- events
-- Telemetry lives in its own table. Mixing it into entries behind a `kind`
-- column means one forgotten filter silently inflates the headline number.
create table if not exists public.events (
  event_id   uuid primary key,
  session_id text not null,
  name       text not null,
  t_server   timestamptz not null default now(),
  t_client   text,
  source     text,
  device     text,
  meta       text,
  is_test    boolean not null default false
);

create index if not exists events_name_session_idx
  on public.events (name, session_id);

-- ---------------------------------------------------------------- followups
-- Optional college / "did they tell you" answers, captured after the entry is
-- already saved. A separate insert-only table rather than an UPDATE on entries.
create table if not exists public.followups (
  id            uuid primary key,
  entry_id      uuid not null,
  company_key   text,
  college_raw   text,
  reason_source text,
  source        text,
  is_test       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists followups_company_idx
  on public.followups (company_key);

-- ---------------------------------------------------------------- RLS
alter table public.entries   enable row level security;
alter table public.events    enable row level security;
alter table public.followups enable row level security;

drop policy if exists "anon can insert entries"   on public.entries;
drop policy if exists "anon can read entries"     on public.entries;
drop policy if exists "anon can insert events"    on public.events;
drop policy if exists "anon can insert followups" on public.followups;
drop policy if exists "anon can read followups"   on public.followups;

create policy "anon can insert entries"
  on public.entries for insert to anon, authenticated with check (true);

create policy "anon can read entries"
  on public.entries for select to anon, authenticated using (true);

-- Write-only by design: nobody needs to read the telemetry from the page.
create policy "anon can insert events"
  on public.events for insert to anon, authenticated with check (true);

create policy "anon can insert followups"
  on public.followups for insert to anon, authenticated with check (true);

create policy "anon can read followups"
  on public.followups for select to anon, authenticated using (true);

-- Deliberately absent: any update or delete policy on any of the three tables.

-- ---------------------------------------------------------------- smoke test
-- Run these after the policies are in. The first two should return rows;
-- the update and delete attempts from the browser console must both fail.
--
-- select count(*) from public.entries;
-- select count(*) from public.events;
