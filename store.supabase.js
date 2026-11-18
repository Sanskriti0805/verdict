/* Verdict — Supabase implementation of the store adapter.
   Reads raw `counted` rows and aggregates in JS, so there are no SQL views to
   port if this ever has to be swapped for another backend. */

(function (global) {
  'use strict';

  var cfg = null;

  function headers(extra) {
    var h = {
      'apikey': cfg.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  function rest(path) {
    return String(cfg.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/' + path;
  }

  function configured() {
    return cfg && cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf('PASTE_') !== 0;
  }

  function init(config) {
    cfg = config;
  }

  function addEntry(entry) {
    if (!configured()) return Promise.resolve({ ok: false, code: 'not_configured' });

    return fetch(rest('entries'), {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(entry)
    }).then(function (res) {
      if (res.ok) return { ok: true, id: entry.id };
      return res.text().then(function (t) {
        return { ok: false, code: 'http_' + res.status, detail: t.slice(0, 300) };
      });
    }).catch(function (err) {
      return { ok: false, code: 'network', detail: String(err && err.message || err) };
    });
  }

  /* Optional follow-ups from the thanks screen go into their OWN insert-only
     table. Updating the entry row instead would mean granting anon UPDATE,
     which would let anyone rewrite any company's data. Never do that. */
  function addFollowUp(row) {
    if (!configured()) return Promise.resolve({ ok: false, code: 'not_configured' });
    return fetch(rest('followups'), {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(row)
    }).then(function (res) {
      return { ok: res.ok, code: res.ok ? null : 'http_' + res.status };
    }).catch(function () {
      return { ok: false, code: 'network' };
    });
  }

  var SELECT = 'company_key,company_display,round,outcome,reason_code';

  function getAggregate() {
    if (!configured()) return Promise.resolve(emptyAggregate('not_configured'));

    var entriesUrl = rest('entries?status=eq.counted&select=' + SELECT + '&limit=5000');
    var followUrl = rest('followups?is_test=is.false&select=company_key,reason_source&limit=5000');

    return Promise.all([
      fetch(entriesUrl, { headers: headers() }).then(function (res) {
        if (!res.ok) throw new Error('http_' + res.status);
        return res.json();
      }),
      // Follow-ups are a bonus stat: never fail the whole view over them.
      fetch(followUrl, { headers: headers() })
        .then(function (res) { return res.ok ? res.json() : []; })
        .catch(function () { return []; })
    ])
      .then(function (both) { return aggregate(both[0], both[1]); })
      .catch(function (err) {
        return emptyAggregate(String(err && err.message || err));
      });
  }

  function emptyAggregate(errCode) {
    return {
      companies: [], overall: [], total_rows: 0,
      generated_at: new Date().toISOString(), error: errCode || null
    };
  }

  /* Shape:
     { companies: [{ company_key, company_display, total,
                     rounds: [{ round, outcome, reasons: [{reason_code, n}], n }] }],
       overall:   [{ round, outcome, reasons: [...], n }],
       total_rows, generated_at } */
  function aggregate(rows, followups) {
    var byCompany = {};
    var overall = {};

    rows.forEach(function (r) {
      if (!r.company_key) return;
      var c = byCompany[r.company_key] || (byCompany[r.company_key] = {
        company_key: r.company_key,
        company_display: r.company_display || r.company_key,
        total: 0,
        _rounds: {},
        told: 0,
        told_total: 0
      });
      c.total++;
      bump(c._rounds, r);
      bump(overall, r);
    });

    (followups || []).forEach(function (f) {
      var c = byCompany[f.company_key];
      if (!c || !f.reason_source) return;
      c.told_total++;
      if (f.reason_source === 'told_by_recruiter') c.told++;
    });

    var companies = Object.keys(byCompany).map(function (k) {
      var c = byCompany[k];
      c.rounds = finish(c._rounds);
      delete c._rounds;
      return c;
    }).sort(function (a, b) {
      return b.total - a.total || a.company_display.localeCompare(b.company_display);
    });

    return {
      companies: companies,
      overall: finish(overall),
      total_rows: rows.length,
      generated_at: new Date().toISOString(),
      error: null
    };
  }

  function bump(bucket, r) {
    var key = r.round + '|' + r.outcome;
    var b = bucket[key] || (bucket[key] = {
      round: r.round, outcome: r.outcome, n: 0, _reasons: {}
    });
    b.n++;
    b._reasons[r.reason_code] = (b._reasons[r.reason_code] || 0) + 1;
  }

  function finish(bucket) {
    return Object.keys(bucket).map(function (k) {
      var b = bucket[k];
      b.reasons = Object.keys(b._reasons).map(function (rc) {
        return { reason_code: rc, n: b._reasons[rc] };
      }).sort(function (x, y) { return y.n - x.n; });
      delete b._reasons;
      return b;
    }).sort(function (a, b) { return b.n - a.n; });
  }

  /* Fire and forget. A dropped event must never block the UI, and a retry must
     never double-count — the caller reuses the same event_id. */
  function logEvent(evt) {
    if (!configured()) return Promise.resolve();
    return fetch(rest('events'), {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(evt)
    }).then(function (res) {
      return res.ok ? null : Promise.reject(new Error('http_' + res.status));
    });
  }

  global.VerdictStoreSupabase = {
    init: init,
    addEntry: addEntry,
    addFollowUp: addFollowUp,
    getAggregate: getAggregate,
    logEvent: logEvent,
    configured: configured
  };
})(window);
