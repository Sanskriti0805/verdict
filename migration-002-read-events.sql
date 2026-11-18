-- Verdict migration 002 — let the funnel be read.
-- Paste into the Supabase SQL editor and run.
--
-- Why: `events` was created write-only, which was right for the page but means
-- nothing can read the funnel back out. Beep's submission needs started and
-- finished counts, so this adds a SELECT policy.
--
-- What's in there: a random session id, an event name, device, channel tag.
-- No names, no emails, nothing that identifies a student. Still INSERT and
-- SELECT only — no update, no delete, same as the other tables.

drop policy if exists "anon can read events" on public.events;

create policy "anon can read events"
  on public.events for select to anon, authenticated using (true);

-- Sanity check after running — the funnel, counted as distinct people:
--
-- select name, count(distinct session_id) as people, count(*) as fired
-- from public.events
-- where is_test = false
-- group by name
-- order by people desc;
