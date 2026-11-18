/* Verdict — storage facade: safe localStorage, session identity, funnel events,
   and validation before anything is written.

   Swap backends by changing IMPL. Both implementations return raw `counted`
   rows and aggregate in JS, so the return shape is identical either way. */

(function (global) {
  'use strict';

  var D = global.VerdictData;
  var IMPL = global.VerdictStoreSupabase;

  /* ---------- safe localStorage ----------
     iOS Safari in private mode throws on write. An unguarded call white-screens
     the app, so every access goes through here with an in-memory fallback. */
  var mem = {};
  var LS = {
    get: function (k) {
      try { var v = global.localStorage.getItem(k); return v === null ? mem[k] : v; }
      catch (e) { return mem[k]; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { global.localStorage.setItem(k, v); } catch (e) { /* in-memory only */ }
    },
    getJSON: function (k, dflt) {
      var raw = LS.get(k);
      if (!raw) return dflt;
      try { return JSON.parse(raw); } catch (e) { return dflt; }
    },
    setJSON: function (k, v) { LS.set(k, JSON.stringify(v)); }
  };

  /* ---------- session identity ---------- */
  function randId(bytes) {
    var a = new Uint8Array(bytes);
    (global.crypto || global.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    var h = randId(16).split('');
    h[12] = '4';
    h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
    var s = h.join('');
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' +
           s.slice(16, 20) + '-' + s.slice(20, 32);
  }

  var VALID_SOURCES = ['wa1', 'wa2', 'rd1', 'lnk', 'direct', 'seed', 'test'];

  function readSource() {
    var m = /[?&]s=([a-z0-9_-]{1,12})/i.exec(global.location.search);
    var s = m ? m[1].toLowerCase() : null;
    if (s && VALID_SOURCES.indexOf(s) !== -1) {
      LS.set('vd_source', s);
      return s;
    }
    return LS.get('vd_source') || 'direct';
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(global.navigator.userAgent);
  }

  var session = null;
  function getSession() {
    if (session) return session;

    // Once per device: tags every row from this machine as test data, by
    // construction rather than by remembering to filter later.
    if (/[?&]builder=1/.test(global.location.search)) LS.set('vd_is_builder', '1');

    var sid = LS.get('vd_sid');
    if (!sid) { sid = randId(8); LS.set('vd_sid', sid); }
    if (!LS.get('vd_first_seen')) LS.set('vd_first_seen', new Date().toISOString());

    session = {
      sid: sid,
      source: readSource(),
      device: isMobile() ? 'mobile' : 'desktop',
      is_test: LS.get('vd_is_builder') === '1',
      first_seen: LS.get('vd_first_seen')
    };
    return session;
  }

  /* ---------- funnel events ---------- */
  var ONCE_PER_SESSION = ['page_view', 'form_started', 'aggregate_unlocked', 'funnel_ineligible'];

  function sent() { return LS.getJSON('vd_funnel', {}); }
  function markSent(name, id) { var s = sent(); s[name] = id; LS.setJSON('vd_funnel', s); }

  function queue() { return LS.getJSON('vd_pending_events', []); }
  function setQueue(q) { LS.setJSON('vd_pending_events', q.slice(-40)); }

  function logEvent(name, meta) {
    var s = getSession();
    var already = sent();

    if (ONCE_PER_SESSION.indexOf(name) !== -1 && already[name]) return Promise.resolve();

    var evt = {
      event_id: uuid(),
      session_id: s.sid,
      name: name,
      t_client: new Date().toISOString(),
      source: s.source,
      device: s.device,
      meta: meta == null ? null : String(meta).slice(0, 120),
      is_test: s.is_test
    };

    if (ONCE_PER_SESSION.indexOf(name) !== -1) markSent(name, evt.event_id);

    return IMPL.logEvent(evt).catch(function () {
      var q = queue(); q.push(evt); setQueue(q);
    });
  }

  /* Retries carry the original event_id, so a retry can never inflate a count. */
  function flushEvents() {
    var q = queue();
    if (!q.length) return Promise.resolve();
    setQueue([]);
    return Promise.all(q.map(function (evt) {
      return IMPL.logEvent(evt).catch(function () {
        var cur = queue(); cur.push(evt); setQueue(cur);
      });
    }));
  }

  /* ---------- entries ---------- */
  function myEntries() { return LS.getJSON('vd_entries', []); }

  function isDuplicate(draft) {
    var sig = [draft.company_key, draft.role_family, draft.round, draft.outcome].join('|');
    return myEntries().some(function (e) { return e.sig === sig; });
  }

  function rateLimited() {
    var mine = myEntries();
    if (mine.length >= D.MAX_ENTRIES_PER_SESSION) return 'session_cap';
    var fiveMinAgo = Date.now() - 5 * 60 * 1000;
    var recent = mine.filter(function (e) { return new Date(e.at).getTime() > fiveMinAgo; });
    if (recent.length >= 3) return 'rate';
    return null;
  }

  /* Builds the row, classifies it, writes it. Junk is still written with the
     matching excluded_* status — we want to see the attempt, it just never
     reaches the aggregate. */
  function addEntry(draft, timing) {
    var s = getSession();
    var norm = D.normalizeCompany(draft.company_raw);
    var mine = myEntries();

    var entry = {
      id: uuid(),
      client_ts: new Date().toISOString(),
      company_raw: String(draft.company_raw || '').trim().slice(0, 80),
      company_key: norm.key,
      company_display: norm.display,
      role_family: draft.role_family,
      round: draft.round,
      outcome: draft.outcome,
      reason_code: draft.reason_code,
      college_raw: null,
      reason_source: null,
      session_id: s.sid,
      session_entry_seq: mine.length + 1,
      source: s.source,
      device: s.device,
      time_to_submit_ms: timing || null,
      is_test: s.is_test
    };

    var dupe = isDuplicate({
      company_key: entry.company_key, role_family: entry.role_family,
      round: entry.round, outcome: entry.outcome
    });

    entry.status = D.classify(entry, { isDuplicate: dupe });

    return IMPL.addEntry(entry).then(function (res) {
      if (res.ok) {
        mine.push({
          id: entry.id,
          sig: [entry.company_key, entry.role_family, entry.round, entry.outcome].join('|'),
          company_key: entry.company_key,
          at: entry.client_ts
        });
        LS.setJSON('vd_entries', mine);
      }
      return Object.assign({}, res, { status: entry.status, company_key: entry.company_key });
    });
  }

  /* Own row in its own insert-only table — see store.supabase.js for why. */
  function addFollowUp(entryId, patch) {
    var s = getSession();
    var college = patch.college_raw ? String(patch.college_raw).trim().slice(0, 80) : null;
    if (!college && !patch.reason_source) return Promise.resolve({ ok: true });

    var mine = myEntries();
    var match = mine.filter(function (e) { return e.id === entryId; })[0];

    return IMPL.addFollowUp({
      id: uuid(),
      entry_id: entryId,
      company_key: match ? match.company_key : null,
      college_raw: college,
      reason_source: patch.reason_source || null,
      source: s.source,
      is_test: s.is_test
    });
  }

  /* ---------- unlock state ----------
     Set only from a confirmed write. Never optimistically. */
  function isUnlocked() { return LS.get('vd_unlocked') === '1'; }
  function unlock() { LS.set('vd_unlocked', '1'); }

  global.VerdictStore = {
    LS: LS,
    uuid: uuid,
    getSession: getSession,
    logEvent: logEvent,
    flushEvents: flushEvents,
    addEntry: addEntry,
    addFollowUp: addFollowUp,
    getAggregate: function () { return IMPL.getAggregate(); },
    myEntries: myEntries,
    rateLimited: rateLimited,
    isDuplicate: isDuplicate,
    isUnlocked: isUnlocked,
    unlock: unlock,
    configured: function () { return IMPL.configured(); },
    init: function (cfg) { IMPL.init(cfg); }
  };
})(window);
