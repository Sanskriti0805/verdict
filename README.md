# Verdict

Students are never told why they were cut, so nobody can see what actually clears a round.
Verdict lets a student log one round outcome in about 30 seconds — picking the reason from a
fixed list rather than typing it — and because every reason is a code, the entries add up into
what nobody has: per company, what share of people were cut at each round, and for what.

Built for the Beep Founder's Office task, November 2026.

## Running it

Static files. No build step, no dependencies.

```bash
python -m http.server 8765
```

## Setup (one time)

### 1. Supabase

Create a free project. Then **SQL Editor → New query**, paste all of `schema.sql`, run it.

That creates three tables and the row-level security policies. The security model is one line
long: **anon may INSERT and SELECT, and nothing else.** There is deliberately no update or
delete policy anywhere. Granting either would let any visitor rewrite or wipe another student's
row, on a page that names real companies.

Then **Project Settings → API** and copy two values into `config.js`:

```js
SUPABASE_URL:      'https://xxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbG...'
```

The publishable (anon) key is public by design — it ships in the page source. It is safe
because the tables are protected by RLS, not by hiding the key.

### 2. Vercel

Import the repo and deploy. No framework preset, no build command, output directory `.`.
Every push redeploys.

## Before sharing the link

- Visit `/?builder=1` **once on every device you own**. It sets a flag so every row and event
  from that device is written with `is_test = true`. This is how your own ~15 test submissions
  stay out of the reported numbers — by construction, not by remembering to filter later.
- Log one entry on a real phone and confirm the row appears in the Supabase table editor.
- Open the URL in a private window: it must land on the gate, not the aggregate.
- From the console on the live page, try an `update` and a `delete` with the anon key.
  **Both must fail.** This is the check that RLS is actually doing its job.
- Send the link to yourself on WhatsApp and look at the preview card.

## The funnel

Six events, in `events`. The two that matter:

| | |
|---|---|
| **STARTED** | `form_started` — the first field *commit*, not the page view. Crawlers and thumb-scrolls produce page views; this makes the completion rate look worse, which is the point. |
| **FINISHED** | `aggregate_unlocked` — not `entry_submitted`. Under give-to-get the submit is the price and the verdict is the job. The gap between the two counts is the error rate, measured for free. |

Count **distinct `session_id`** per event, and report page views separately so all three
numbers are visible.

Channel attribution is the `?s=` parameter, never `document.referrer` — WhatsApp on Android
strips referrers. Suggested codes: `?s=wa1` first batch, `?s=wa2` after the change ships,
`?s=rd1` cold Reddit DMs (strangers), `?s=lnk` anywhere else.

## Display floors

A cell needs **n ≥ 3** to show a percentage; a company needs **n ≥ 5** to appear in the ranking.
This is the anti-spam control and the anti-defamation control at the same time — one person
cannot manufacture a published claim about a named company.

Every string attributes to students ("Students logged: below the CGPA cutoff"), never to the
company. No individual row is ever published, and nothing in the schema identifies a student.

## Files

| | |
|---|---|
| `data.js` | Enums, reason lists keyed by outcome, company alias map, `normalizeCompany()`, the `classify()` predicate that decides `counted` vs `excluded_*` |
| `store.js` | Safe localStorage, session identity, funnel events with retry, validation before any write |
| `store.supabase.js` | The backend. Reads raw `counted` rows and aggregates in JS, so there are no SQL views to port if it ever has to be swapped |
| `app.js` | Routing, the form, give-to-get, the gate and the aggregate views |
| `schema.sql` | Tables, indexes and the RLS policies |
