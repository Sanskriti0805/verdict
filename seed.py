# -*- coding: utf-8 -*-
"""Seed Verdict with rounds the three interviewed students actually described.

Every row below traces to something a named student said on a recording. Where
the student described a round but never named the company, company_key is
'not-named' — those rows count towards the cross-company picture but are kept
out of the per-company ranking. Inventing a company attribution would mean
fabricating the finding this whole thing is supposed to prove.

Rows are source='seed' and status='counted': they belong in the aggregate (the
gate has nothing to show otherwise) but are excluded from the reported funnel
by filtering source, not by the is_test flag.

Run: python seed.py
"""
import json
import urllib.request
import uuid
from datetime import datetime, timezone

URL = "https://kllaeanltszvsgbludns.supabase.co/rest/v1/entries"
KEY = "sb_publishable_A1GcgrjpU7XBXDQfico1xA_-RQ2OR2d"

UNNAMED = ("not-named", "Not named by the student")

# (who, company_key, company_display, role, round, outcome, reason, what they said)
ROWS = [
    # --- S1 Siddharth. 70 applications, zero interviews, rejected after online
    #     assessments with no reason ever given. He never named which companies.
    ("S1", UNNAMED[0], UNNAMED[1], "swe_sde", "online_assessment", "rejected",
     "no_reason_given", "Rejections after sitting OAs, no reason given"),
    ("S1", UNNAMED[0], UNNAMED[1], "swe_sde", "online_assessment", "rejected",
     "no_reason_given", "Second described OA, same outcome"),
    ("S1", UNNAMED[0], UNNAMED[1], "swe_sde", "resume_shortlist", "rejected",
     "no_reason_given", "Bulk of 70 applications never got past the resume stage"),
    ("S1", UNNAMED[0], UNNAMED[1], "swe_sde", "no_round_silence", "rejected",
     "no_reason_given", "No lead anywhere across the whole window"),

    # --- S2 Manasvi. A backlog and lower 12th marks blocked her from several
    #     companies; she did not say which. Most companies allowed zero backlogs.
    ("S2", UNNAMED[0], UNNAMED[1], "swe_sde", "resume_shortlist", "rejected",
     "below_cutoff", "Backlog and 12th marks blocked her before applying"),
    ("S2", UNNAMED[0], UNNAMED[1], "swe_sde", "resume_shortlist", "rejected",
     "below_cutoff", "Second company with a zero-backlog rule"),
    ("S2", UNNAMED[0], UNNAMED[1], "swe_sde", "online_assessment", "rejected",
     "no_reason_given", "First OA is her chokepoint, criteria never shared"),
    ("S2", UNNAMED[0], UNNAMED[1], "ops_hr_finance", "technical_1", "rejected",
     "no_reason_given", "Customer Success interview, nothing from her curriculum applied"),

    # --- S3 Aditya. Curiflow offer through on-campus; DSA is where he falls out.
    ("S3", "curiflow", "Curiflow", "swe_sde", "technical_1", "selected",
     "clear_thinking", "Cleared CS fundamentals, cloud, Docker, HLD/LLD and got the offer"),
    ("S3", UNNAMED[0], UNNAMED[1], "swe_sde", "online_assessment", "rejected",
     "coding_round", "DSA is the toughest round and where he drops out most"),
    ("S3", UNNAMED[0], UNNAMED[1], "swe_sde", "resume_shortlist", "rejected",
     "applied_late", "Companies announced with two or three days of notice"),
]


def build(row):
    who, key, display, role, rnd, outcome, reason, note = row
    return {
        "id": str(uuid.uuid4()),
        "client_ts": datetime.now(timezone.utc).isoformat(),
        "company_raw": display,
        "company_key": key,
        "company_display": display,
        "role_family": role,
        "round": rnd,
        "outcome": outcome,
        "reason_code": reason,
        "session_id": "seed-" + who.lower(),
        "session_entry_seq": 1,
        "source": "seed",
        "device": "desktop",
        "time_to_submit_ms": None,
        "is_test": False,       # seeds belong in the aggregate
        "status": "counted",
    }


payload = [build(r) for r in ROWS]

req = urllib.request.Request(
    URL,
    data=json.dumps(payload).encode(),
    headers={
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    },
    method="POST",
)

with urllib.request.urlopen(req, timeout=30) as res:
    print("HTTP", res.status, "— inserted", len(payload), "seed rows")

named = sum(1 for r in ROWS if r[1] != UNNAMED[0])
print("  %d traced to a named company, %d from rounds where the student named none"
      % (named, len(ROWS) - named))
