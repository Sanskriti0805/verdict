-- Verdict migration 003 — the verdict tables.
-- Paste into the Supabase SQL editor and run.
--
-- Two tables on purpose:
--
--   verdicts   the codes. Readable, because they feed the public cohort view.
--   accounts   what the student actually typed. INSERT only, with NO select
--              policy, so nothing can read it back out — not the page, not
--              anyone holding the publishable key.
--
-- That split is what lets the aggregate be open to everyone while the words
-- people typed about being rejected stay private.

create table if not exists public.verdicts (
  id                uuid primary key,
  created_at        timestamptz not null default now(),
  client_ts         text,

  company_key       text not null,
  company_display   text not null,
  role_family       text,
  round             text,

  facts             text,          -- comma-separated codes they ticked
  structural        text,
  cgpa_band         text,

  verdict_available boolean not null default true,
  reason_code       text,
  attribution       text,          -- performance | structural | unknown
  confidence        text,          -- high | medium | low | insufficient
  signal_score      int,

  session_id        text not null,
  source            text not null default 'direct',
  device            text not null default 'desktop',
  is_test           boolean not null default false,
  took_ms           int
);

create index if not exists verdicts_company_idx
  on public.verdicts (company_key, round);

create table if not exists public.accounts (
  id           uuid primary key,
  verdict_id   uuid not null,
  account_text text not null,
  is_test      boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.verdicts enable row level security;
alter table public.accounts enable row level security;

drop policy if exists "anon can insert verdicts" on public.verdicts;
drop policy if exists "anon can read verdicts"   on public.verdicts;
drop policy if exists "anon can insert accounts" on public.accounts;

create policy "anon can insert verdicts"
  on public.verdicts for insert to anon, authenticated with check (true);

create policy "anon can read verdicts"
  on public.verdicts for select to anon, authenticated using (true);

create policy "anon can insert accounts"
  on public.accounts for insert to anon, authenticated with check (true);

-- Deliberately absent, and it must stay absent:
--   * any select policy on accounts  (free text is write-only)
--   * any update or delete policy on either table
--
-- To read accounts for your own analysis, use the Supabase dashboard, which
-- runs as the service role. The page must never be able to.
