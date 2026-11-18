/* Verdict — UI, routing and the give-to-get flow.
   Routes: #/log  #/thanks  #/verdict  #/verdict?c=key  #/ineligible */

(function (global) {
  'use strict';

  var D = global.VerdictData;
  var S = global.VerdictStore;
  var CFG = global.VerdictConfig;

  var app = document.getElementById('app');

  var draft = {};
  var step = 0;
  var startedAt = null;
  var lastEntryId = null;
  var aggCache = null;
  var submitting = false;

  var STEPS = ['company', 'role_family', 'round', 'outcome', 'reason_code'];

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function render(html) {
    app.innerHTML = html;
    global.scrollTo(0, 0);
  }

  function go(hash) {
    if (global.location.hash === hash) route();
    else global.location.hash = hash;
  }

  function routeParts() {
    var h = global.location.hash.replace(/^#/, '') || '/verdict';
    var qi = h.indexOf('?');
    var path = qi === -1 ? h : h.slice(0, qi);
    var params = {};
    if (qi !== -1) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { path: path, params: params };
  }

  function markStarted() {
    if (startedAt) return;
    startedAt = Date.now();
    S.logEvent('form_started');
  }

  function updateCount() {
    var n = S.myEntries().length;
    var node = document.getElementById('entry-count');
    if (!node) return;
    if (n > 0) { node.textContent = n === 1 ? '1 round logged' : n + ' rounds logged'; node.hidden = false; }
    else node.hidden = true;
  }

  /* ---------- the form ---------- */
  function renderStep() {
    var name = STEPS[step];
    var head = '<p class="step-count">Step ' + (step + 1) + ' of ' + STEPS.length + '</p>';
    var back = step > 0 ? '<button class="back" data-back>&larr; Back</button>' : '';

    if (name === 'company') {
      render(head +
        '<h2 class="q">Which company was it?</h2>' +
        '<input type="text" id="company" autocomplete="off" autocapitalize="words" ' +
        'spellcheck="false" placeholder="Start typing…" value="' + esc(draft.company_raw || '') + '">' +
        '<div class="suggestions" id="sugg"></div>' +
        '<div class="row-actions"><button class="btn" id="next" disabled>Next</button></div>' + back);

      var input = document.getElementById('company');
      var next = document.getElementById('next');
      var sugg = document.getElementById('sugg');

      function refresh() {
        var v = input.value.trim();
        next.disabled = v.length < 2;
        var q = v.toLowerCase();
        var matches = !q ? D.COMPANIES.slice(0, 6)
          : D.COMPANIES.filter(function (c) { return c.toLowerCase().indexOf(q) !== -1; }).slice(0, 6);
        sugg.innerHTML = matches.map(function (c) {
          return '<button class="chip" data-pick="' + esc(c) + '">' + esc(c) + '</button>';
        }).join('');
      }

      input.addEventListener('input', function () { markStarted(); refresh(); });
      sugg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pick]');
        if (!b) return;
        markStarted();
        input.value = b.getAttribute('data-pick');
        refresh();
        input.focus();
      });
      next.addEventListener('click', function () {
        draft.company_raw = input.value.trim();
        S.logEvent('field_completed', 'company');
        step++; renderStep();
      });
      refresh();
      return;
    }

    var opts, question;
    if (name === 'role_family') { opts = D.ROLE_FAMILIES; question = 'What was the role?'; }
    else if (name === 'round')  { opts = D.ROUNDS;        question = 'Which round was this?'; }
    else if (name === 'outcome'){ opts = D.OUTCOMES;      question = 'What happened?'; }
    else {
      opts = D.REASONS[draft.outcome] || D.REASONS.rejected;
      question = draft.outcome === 'selected'
        ? 'Why do you think you moved on?'
        : 'Why were you cut?';
    }

    render(head +
      '<h2 class="q">' + esc(question) + '</h2>' +
      '<div class="choices">' + opts.map(function (o) {
        return '<button class="choice" data-code="' + esc(o.code) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>' + back);

    app.addEventListener('click', onChoice);
  }

  function onChoice(e) {
    var b = e.target.closest('[data-code]');
    if (!b) return;
    app.removeEventListener('click', onChoice);
    markStarted();
    var name = STEPS[step];
    draft[name] = b.getAttribute('data-code');
    S.logEvent('field_completed', name);

    if (name === 'reason_code') { submit(); return; }
    step++; renderStep();
  }

  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-back]')) {
      app.removeEventListener('click', onChoice);
      step = Math.max(0, step - 1);
      renderStep();
    }
  });

  function submit() {
    if (submitting) return;
    submitting = true;

    render('<p class="step-count">Step ' + STEPS.length + ' of ' + STEPS.length + '</p>' +
           '<h2 class="q">Saving…</h2>' +
           '<button class="btn" disabled><span class="spinner"></span>One moment</button>');

    var limited = S.rateLimited();
    if (limited) {
      submitting = false;
      render('<h1>That is plenty, thank you.</h1>' +
        '<p class="muted">You have logged ' + S.myEntries().length + ' rounds. ' +
        'That is more than enough to make the numbers useful.</p>' +
        '<div class="row-actions"><button class="btn" data-goverdict>See the verdict</button></div>');
      return;
    }

    var timing = startedAt ? (Date.now() - startedAt) : null;

    S.addEntry(draft, timing).then(function (res) {
      submitting = false;
      if (!res.ok) {
        render('<div class="err">Could not save that — ' + esc(res.code) + '. ' +
               'Your answers are still here, try again.</div>' +
               '<div class="row-actions">' +
               '<button class="btn" data-retry>Try again</button></div>');
        return;
      }
      lastEntryId = res.id;
      S.unlock();
      S.logEvent('entry_submitted', res.id);
      updateCount();
      go('#/thanks');
    });
  }

  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-retry]')) { submit(); }
    if (e.target.closest('[data-goverdict]')) { go('#/verdict'); }
  });

  /* ---------- thanks: optional extras, never gates the unlock ---------- */
  function renderThanks() {
    render('<h1>Logged. Thank you.</h1>' +
      '<p class="muted">Two optional taps, then the full breakdown opens. Skip either.</p>' +

      '<h2>Which college are you at?</h2>' +
      '<input type="text" id="college" autocomplete="off" placeholder="Optional">' +

      '<h2>' + (draft.outcome === 'selected' ? 'Did they tell you that?' : 'Did they tell you the reason?') + '</h2>' +
      '<div class="choices">' + D.REASON_SOURCES.map(function (o) {
        return '<button class="choice" data-src="' + esc(o.code) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>' +

      '<div class="sticky-cta"><button class="btn" data-finish>See the verdict</button></div>');

    var chosen = null;
    app.addEventListener('click', function handler(e) {
      var s = e.target.closest('[data-src]');
      if (s) {
        chosen = s.getAttribute('data-src');
        Array.prototype.forEach.call(app.querySelectorAll('[data-src]'), function (b) {
          b.style.borderColor = b === s ? 'var(--accent)' : '';
        });
      }
      if (e.target.closest('[data-finish]')) {
        app.removeEventListener('click', handler);
        var college = (document.getElementById('college') || {}).value || '';
        if (lastEntryId && (college.trim() || chosen)) {
          S.addFollowUp(lastEntryId, { college_raw: college, reason_source: chosen });
        }
        go('#/verdict');
      }
    });
  }

  /* ---------- aggregate ---------- */
  function loadAggregate() {
    if (aggCache) return Promise.resolve(aggCache);
    return S.getAggregate().then(function (a) { aggCache = a; return a; });
  }

  function reasonBars(bucket, max) {
    return bucket.reasons.map(function (r) {
      var pct = Math.round((r.n / bucket.n) * 100);
      return '<div class="reason-row">' +
        '<div class="reason-top">' +
          '<span class="reason-label">' + esc(D.reasonLabel(bucket.outcome, r.reason_code)) + '</span>' +
          '<span class="reason-n">' + pct + '% &middot; n=' + r.n + '</span>' +
        '</div>' +
        '<div class="bar' + (bucket.outcome === 'selected' ? ' is-good' : '') + '">' +
          '<span style="width:' + Math.max(pct, 2) + '%"></span>' +
        '</div></div>';
    }).join('');
  }

  function bucketBlock(bucket) {
    var roundLabel = D.labelFor(D.ROUNDS, bucket.round);
    var verb = bucket.outcome === 'selected' ? 'moved on' : 'were cut';
    if (bucket.n < D.MIN_N_CELL) {
      return '<p class="round-name">' + esc(roundLabel) + '</p>' +
             '<p class="thin">Too few logs yet (n=' + bucket.n + '). Needs ' + D.MIN_N_CELL + '.</p>';
    }
    return '<p class="round-name">' + esc(roundLabel) + ' — students who ' + verb +
           ' (n=' + bucket.n + ')</p>' + reasonBars(bucket);
  }

  function renderVerdict(params) {
    render('<p class="muted">Loading…</p>');

    loadAggregate().then(function (agg) {
      S.logEvent('aggregate_unlocked');

      if (agg.error === 'not_configured') {
        render('<div class="err">Not connected to the database yet. ' +
               'Add your Supabase URL and key to <code>config.js</code>.</div>');
        return;
      }
      if (agg.error) {
        render('<div class="err">Could not load the data (' + esc(agg.error) + ').</div>' +
               '<div class="row-actions"><button class="btn" data-reload>Try again</button></div>');
        return;
      }

      var key = params.c;
      if (key) {
        var c = agg.companies.filter(function (x) { return x.company_key === key; })[0];
        if (c && c.total >= D.MIN_N_COMPANY) { renderCompany(c, agg); return; }
        renderOverall(agg, key);
        return;
      }
      renderOverall(agg, null);
    });
  }

  function renderOverall(agg, missingKey) {
    var listed = agg.companies.filter(function (c) {
      return c.total >= D.MIN_N_COMPANY && c.company_key !== D.UNNAMED_KEY;
    });

    var note = '';
    if (missingKey) {
      note = '<div class="card"><p class="muted" style="margin:0">Not enough logged for that ' +
        'company yet, so here is everything across all companies instead.</p></div>';
    }

    render('<h1>What is actually getting people cut</h1>' +
      '<p class="muted">Across ' + agg.total_rows + ' rounds logged by students. ' +
      'Every number shows its n.</p>' + note +
      '<div class="card">' + agg.overall.map(bucketBlock).join('') + '</div>' +
      (listed.length
        ? '<h2>By company</h2>' + listed.map(function (c) {
            return '<div class="card"><div class="card-head">' +
              '<span class="card-title">' + esc(c.company_display) + '</span>' +
              '<span class="reason-n">' + c.total + ' rounds</span></div>' +
              '<button class="choice" data-open="' + esc(c.company_key) + '" ' +
              'style="margin-top:10px">See the breakdown</button></div>';
          }).join('')
        : '<p class="thin">No company has ' + D.MIN_N_COMPANY + ' logged rounds yet. ' +
          'That floor exists so one person cannot create a claim about a company.</p>') +
      '<div class="sticky-cta"><button class="btn btn-ghost" data-another>Log another round</button></div>');
  }

  function renderCompany(c, agg) {
    var told = c.told_total
      ? '<p class="faint">Of these, ' + c.told + ' of ' + c.told_total +
        ' were what the recruiter actually said. The rest are the student’s own read.</p>'
      : '';

    render('<h1>' + esc(c.company_display) + '</h1>' +
      '<p class="muted">' + c.total + ' rounds logged by students.</p>' + told +
      '<div class="card">' + c.rounds.map(bucketBlock).join('') + '</div>' +
      '<div class="sticky-cta">' +
        '<button class="btn btn-ghost" data-allcompanies>All companies</button>' +
      '</div>');
  }

  /* ---------- the gate ----------
     Every WhatsApp forward lands here, so it shows real data rather than a wall. */
  function renderGate(params) {
    render('<p class="muted">Loading…</p>');

    loadAggregate().then(function (agg) {
      var target = params.c
        ? agg.companies.filter(function (x) { return x.company_key === params.c; })[0]
        : null;

      var proof = '';
      var scope = target ? target : { company_display: null, rounds: agg.overall, total: agg.total_rows };
      var best = (scope.rounds || []).filter(function (b) {
        return b.outcome === 'rejected' && b.n >= D.MIN_N_CELL;
      })[0];

      if (best && best.reasons.length) {
        var top = best.reasons[0];
        proof = '<div class="gate-proof">' +
          '<p style="margin:0 0 4px"><strong>' +
            esc(D.reasonLabel('rejected', top.reason_code)) + '</strong></p>' +
          '<p class="faint" style="margin:0">Most common reason at ' +
            esc(D.labelFor(D.ROUNDS, best.round).toLowerCase()) +
            (target ? ' at ' + esc(target.company_display) : ' across all companies') +
            ' — ' + Math.round((top.n / best.n) * 100) + '% of n=' + best.n + '.</p>' +
        '</div>';
      }

      var blurred = '<div class="card blur" aria-hidden="true">' +
        (scope.rounds || []).slice(0, 3).map(bucketBlock).join('') + '</div>';

      render('<h1>' + (target ? esc(target.company_display) : 'Why students get cut') + '</h1>' +
        '<p class="muted">' + (agg.total_rows || 0) + ' rounds logged by students so far.</p>' +
        proof + blurred +
        '<div class="sticky-cta">' +
          '<button class="btn" data-startlog>Log one round (30 sec)</button>' +
          '<button class="btn btn-ghost" data-ineligible style="margin-top:10px">' +
            'I haven’t been through any round yet</button>' +
        '</div>' +
        '<p class="faint" style="margin-top:14px">Built from rounds students actually logged. ' +
        'Log one you have been through and the full breakdown opens.</p>');
    });
  }

  function renderIneligible() {
    S.logEvent('funnel_ineligible');
    render('<h1>Fair enough.</h1>' +
      '<p>Verdict only works if everything in it came from someone who actually sat the round. ' +
      'Nothing to log yet is a perfectly good answer.</p>' +
      '<p class="muted">If you know someone mid-placement, sending them this link is the single ' +
      'most useful thing you can do with this page.</p>' +
      '<div class="row-actions">' +
        '<button class="btn" data-share>Copy the link</button>' +
        '<button class="btn btn-ghost" data-startlog>Actually, I have one to log</button>' +
      '</div>');
  }

  /* ---------- delegated actions ---------- */
  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-open]')) {
      var k = e.target.closest('[data-open]').getAttribute('data-open');
      S.logEvent('company_opened', k);
      go('#/verdict?c=' + encodeURIComponent(k));
    }
    if (e.target.closest('[data-allcompanies]')) go('#/verdict');
    if (e.target.closest('[data-another]') || e.target.closest('[data-startlog]')) {
      draft = {}; step = 0; startedAt = null;
      go('#/log');
    }
    if (e.target.closest('[data-ineligible]')) go('#/ineligible');
    if (e.target.closest('[data-reload]')) { aggCache = null; route(); }
    if (e.target.closest('[data-share]')) {
      var url = global.location.origin + global.location.pathname;
      if (navigator.share) { navigator.share({ title: 'Verdict', url: url }).catch(function () {}); }
      else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          e.target.textContent = 'Copied';
        }).catch(function () {});
      }
    }
  });

  /* ---------- router ---------- */
  function route() {
    var r = routeParts();
    app.removeEventListener('click', onChoice);

    if (r.path === '/log') { renderStep(); return; }
    if (r.path === '/thanks') { renderThanks(); return; }
    if (r.path === '/ineligible') { renderIneligible(); return; }

    if (!S.isUnlocked()) { renderGate(r.params); return; }
    renderVerdict(r.params);
  }

  /* ---------- boot ---------- */
  function boot() {
    S.init(CFG);

    var contact = document.getElementById('contact');
    if (contact && CFG.CONTACT_EMAIL) {
      contact.href = 'mailto:' + CFG.CONTACT_EMAIL;
      contact.textContent = CFG.CONTACT_EMAIL;
    }
    if (CFG.SEEDED_NOTE) {
      var sn = document.getElementById('seed-note');
      sn.textContent = 'Includes rounds logged from our own student interviews and from public ' +
                       'Reddit threads, marked as seed data.';
      sn.hidden = false;
    }

    S.getSession();
    S.logEvent('page_view');
    S.flushEvents();
    updateCount();

    global.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
