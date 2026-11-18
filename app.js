/* Verdict — UI and routing.
   #/describe  the six steps   #/verdict  the answer
   #/thin      not enough to say anything true   #/data  the cohort view, ungated */

(function (global) {
  'use strict';

  var D = global.VerdictData;
  var S = global.VerdictStore;
  var RULES = global.VerdictRules;
  var CFG = global.VerdictConfig;

  var app = document.getElementById('app');

  var draft = blank();
  var step = 0;
  var startedAt = null;
  var current = null;      // last verdict produced
  var aggCache = null;

  function blank() {
    return { company_raw: '', role_family: '', round: '', account_text: '',
             facts: [], structural: '', cgpa_band: '', quoted_line: '' };
  }

  var STEPS = ['company', 'role_family', 'round', 'account_text', 'facts', 'structural'];

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function render(html) { app.innerHTML = html; global.scrollTo(0, 0); }
  function go(h) { if (global.location.hash === h) route(); else global.location.hash = h; }
  function markStarted() {
    if (startedAt) return;
    startedAt = Date.now();
    S.logEvent('form_started');
  }
  function labelOf(list, code) { return D.labelFor(list, code); }

  /* Strip anything that looks like contact detail before it is stored.
     Students paste phone numbers into these boxes without thinking. */
  function scrub(s) {
    return String(s || '')
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, '[removed]')
      .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, '[removed]');
  }

  /* ---------- the six steps ---------- */
  function renderStep() {
    var name = STEPS[step];
    var head = '<p class="step-count">Step ' + (step + 1) + ' of ' + STEPS.length + '</p>';
    var back = step > 0 ? '<button class="back" data-back>&larr; Back</button>' : '';

    if (name === 'company') return stepCompany(head, back);
    if (name === 'account_text') return stepAccount(head, back);
    if (name === 'facts') return stepFacts(head, back);
    if (name === 'structural') return stepStructural(head, back);

    var opts = name === 'role_family' ? D.ROLE_FAMILIES : D.ROUNDS;
    var q = name === 'role_family' ? 'What were you going for?' : 'Which round was this?';

    render(head + '<h2 class="q">' + q + '</h2><div class="choices">' +
      opts.map(function (o) {
        return '<button class="choice" data-pick="' + esc(o.code) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>' + back);
  }

  function stepCompany(head, back) {
    render(head +
      '<h2 class="q">Which company was this round for?</h2>' +
      '<input type="text" id="co" autocomplete="off" autocapitalize="words" spellcheck="false" ' +
      'placeholder="Start typing…" value="' + esc(draft.company_raw) + '">' +
      '<div class="suggestions" id="sugg"></div>' +
      '<div class="row-actions"><button class="btn" id="next" disabled>Next</button>' +
      '<button class="btn btn-ghost" data-unnamed>I’d rather not name them</button></div>' + back);

    var input = document.getElementById('co');
    var next = document.getElementById('next');
    var sugg = document.getElementById('sugg');

    function refresh() {
      var v = input.value.trim();
      next.disabled = v.length < 2;
      var q = v.toLowerCase();
      var m = !q ? D.COMPANIES.slice(0, 6)
        : D.COMPANIES.filter(function (c) { return c.toLowerCase().indexOf(q) !== -1; }).slice(0, 6);
      sugg.innerHTML = m.map(function (c) {
        return '<button class="chip" data-chip="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
    }
    input.addEventListener('input', function () { markStarted(); refresh(); });
    sugg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chip]');
      if (!b) return;
      markStarted(); input.value = b.getAttribute('data-chip'); refresh();
    });
    next.addEventListener('click', function () {
      draft.company_raw = input.value.trim();
      S.logEvent('field_completed', 'company');
      step++; renderStep();
    });
    refresh();
  }

  function stepAccount(head, back) {
    render(head +
      '<h2 class="q">What happened in that round?</h2>' +
      '<p class="muted">Talk, don’t type — the mic is faster. Thirty seconds of talking is plenty.</p>' +
      '<textarea id="acct" rows="7" placeholder="Start anywhere. What did they ask you first? ' +
      'Where did it start going wrong? How did it end?">' + esc(draft.account_text) + '</textarea>' +
      '<p class="faint" id="gauge"></p>' +
      '<div class="row-actions"><button class="btn" id="next">Next</button></div>' + back);

    var ta = document.getElementById('acct');
    var gauge = document.getElementById('gauge');

    function tick() {
      var w = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      gauge.textContent = w === 0 ? '' : (w < 20 ? 'A bit more.' : 'That’s enough to work with.');
    }
    ta.addEventListener('input', function () { markStarted(); tick(); });
    document.getElementById('next').addEventListener('click', function () {
      draft.account_text = ta.value.trim().slice(0, 1200);
      S.logEvent('field_completed', 'account');
      step++; renderStep();
    });
    tick();
    ta.focus();
  }

  function stepFacts(head, back) {
    render(head +
      '<h2 class="q">Tick anything that actually happened.</h2>' +
      '<p class="muted">Skip what didn’t. These are what the verdict gets built from.</p>' +
      '<div class="choices">' + D.FACTS.map(function (f) {
        var on = draft.facts.indexOf(f.code) !== -1;
        return '<button class="choice' + (on ? ' on' : '') + '" data-fact="' + esc(f.code) + '">' +
          esc(f.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="row-actions"><button class="btn" data-next="facts">Next</button></div>' + back);
  }

  function stepStructural(head, back) {
    var early = ['resume_shortlist', 'online_assessment', 'no_round_silence']
      .indexOf(draft.round) !== -1;

    render(head +
      '<h2 class="q">Did any of this come up?</h2>' +
      '<div class="choices">' + D.STRUCTURAL.map(function (o) {
        return '<button class="choice" data-str="' + esc(o.code) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>' +
      (early
        ? '<h2>Your CGPA, roughly</h2><div class="suggestions">' +
          [['below_6', 'Below 6'], ['6_to_7', '6 – 6.9'], ['7_to_8', '7 – 7.9'],
           ['above_8', '8 and above'], ['skip', 'Rather not say']].map(function (b) {
            return '<button class="chip" data-cgpa="' + b[0] + '">' + b[1] + '</button>';
          }).join('') + '</div>'
        : '') + back);
  }

  /* One delegated handler for every tap-driven step.

     These used to be registered per render, which meant a student who went
     Back and forward stacked a listener each time and the next tap fired
     several steps at once. One listener, keyed off the current step, cannot
     accumulate. */
  app.addEventListener('click', function (e) {
    var fact = e.target.closest('[data-fact]');
    if (fact) {
      markStarted();
      var c = fact.getAttribute('data-fact');
      var i = draft.facts.indexOf(c);
      if (i === -1) draft.facts.push(c); else draft.facts.splice(i, 1);
      fact.classList.toggle('on');
      return;
    }

    if (e.target.closest('[data-next="facts"]')) {
      S.logEvent('field_completed', 'facts');
      step++; renderStep();
      return;
    }

    var cg = e.target.closest('[data-cgpa]');
    if (cg) {
      draft.cgpa_band = cg.getAttribute('data-cgpa');
      Array.prototype.forEach.call(app.querySelectorAll('[data-cgpa]'), function (x) {
        x.style.borderColor = x === cg ? 'var(--accent)' : '';
      });
      return;
    }

    var str = e.target.closest('[data-str]');
    if (str) {
      markStarted();
      draft.structural = str.getAttribute('data-str');
      S.logEvent('field_completed', 'structural');
      submit();
      return;
    }

    var b = e.target.closest('[data-pick]');
    if (b) {
      markStarted();
      draft[STEPS[step]] = b.getAttribute('data-pick');
      S.logEvent('field_completed', STEPS[step]);
      step++; renderStep();
    }
    if (e.target.closest('[data-unnamed]')) {
      markStarted();
      draft.company_raw = 'Not named';
      S.logEvent('field_completed', 'company_unnamed');
      step++; renderStep();
    }
    if (e.target.closest('[data-back]')) { step = Math.max(0, step - 1); renderStep(); }
  });

  /* ---------- decide ---------- */
  function submit() {
    draft.role_label = labelOf(D.ROLE_FAMILIES, draft.role_family);
    current = RULES.decide(draft);

    var ms = startedAt ? Date.now() - startedAt : null;
    S.saveVerdict(draft, current, ms);   // fire and forget

    if (!current.verdict_available) {
      S.logEvent('verdict_refused', 'score_' + current.signal.score);
      go('#/thin');
    } else {
      S.logEvent('verdict_shown', current.primary_reason);
      go('#/verdict');
    }
  }

  /* ---------- the verdict ---------- */
  var CONF = {
    high:   { chip: 'Grounded in what you described',
              line: 'This is what your own account points at, read back to you.' },
    medium: { chip: 'A likely read',
              line: 'Likely, not certain. Built from what you described, not from anything they wrote down.' },
    low:    { chip: 'A hypothesis, not an answer',
              line: 'Your account is thin in places. Treat this as something to check, not something to believe.' }
  };

  function renderVerdict() {
    if (!current || !current.verdict_available) { go('#/describe'); return; }
    var v = current;
    var conf = CONF[v.confidence] || CONF.low;
    var structural = v.attribution === 'structural';

    var ticked = draft.facts.map(function (c) { return labelOf(D.FACTS, c); });
    if (draft.structural && draft.structural !== 'none' && draft.structural !== 'dont_recall') {
      ticked.push(labelOf(D.STRUCTURAL, draft.structural));
    }

    render(
      '<p class="step-count">' + esc(draft.company_raw) + ' · ' +
        esc(labelOf(D.ROUNDS, draft.round)) + '</p>' +

      (structural ? '<p class="banner">This one wasn’t about you.</p>' : '') +
      '<h1>' + esc(v.headline) + '</h1>' +
      '<p>' + esc(v.verdict) + '</p>' +

      '<div class="conf"><span class="chip-static">' + esc(conf.chip) + '</span>' +
      '<p class="faint">' + esc(conf.line) + ' ' + esc(v.confidence_because) + '</p></div>' +

      (ticked.length
        ? '<h2>What you told us</h2><ul class="plain">' +
          ticked.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
        : '') +

      (v.next_round_actions.length
        ? '<h2>Next round</h2>' + v.next_round_actions.map(function (a) {
            return '<div class="card"><p style="margin:0 0 4px"><strong>' + esc(a.action) +
              '</strong></p><p class="faint" style="margin:0">' + esc(a.because) + '</p></div>';
          }).join('')
        : '') +

      '<h2>What this can’t tell you</h2><p class="muted">' + esc(v.not_shown) + '</p>' +

      '<h2>Ask them for the real reason</h2>' +
      '<div class="card"><p class="muted" style="margin:0">' + esc(v.ask_them) + '</p></div>' +
      '<div class="row-actions">' +
        '<button class="btn" data-copy="' + esc(v.ask_them) + '">Copy that message</button>' +
        '<button class="btn btn-ghost" data-data>See what happens to everyone else</button>' +
        '<button class="btn btn-ghost" data-again>Log another round</button>' +
      '</div>');
  }

  /* ---------- not enough to say anything true ---------- */
  function renderThin() {
    var asks = (current && current.missing) || D.missingPrompts(draft);

    render('<h1>Not enough here to say anything true about your round.</h1>' +
      '<p>We’d rather tell you that than make something up. You’d act on it.</p>' +

      '<h2>Three things that would unlock it</h2>' +
      '<ul class="plain">' + asks.map(function (a) {
        return '<li>' + esc(a) + '</li>';
      }).join('') + '</ul>' +
      '<div class="row-actions"><button class="btn" data-addmore>Add this and get the verdict</button></div>' +

      '<h2>Meanwhile, here is what actually happens at this round</h2>' +
      '<div id="cohort"><p class="muted">Loading…</p></div>' +

      '<h2>The one thing you can always do</h2>' +
      '<div class="card"><p class="muted" style="margin:0">' + esc(askTemplate()) + '</p></div>' +
      '<div class="row-actions">' +
        '<button class="btn btn-ghost" data-copy="' + esc(askTemplate()) + '">Copy that message</button>' +
      '</div>');

    loadAggregate().then(function (agg) {
      var node = document.getElementById('cohort');
      if (!node) return;
      var mine = (agg.overall || []).filter(function (b) {
        return b.round === draft.round && b.outcome === 'rejected' && b.n >= D.MIN_N_CELL;
      })[0];
      node.innerHTML = mine
        ? '<div class="card">' + bucketBlock(mine) + '</div>'
        : '<p class="thin">Not enough rounds logged at this stage yet to show a pattern.</p>';
    });
  }

  function askTemplate() {
    return 'Hello, I interviewed for the ' + (labelOf(D.ROLE_FAMILIES, draft.role_family) || 'role') +
      ' and was not selected after the ' + labelOf(D.ROUNDS, draft.round).toLowerCase() + '. ' +
      'If you have a moment, could you tell me the main reason? ' +
      'I am not asking you to reconsider — I just want to know what to work on. Thank you.';
  }

  /* ---------- the cohort view, open to everyone ---------- */
  function loadAggregate() {
    if (aggCache) return Promise.resolve(aggCache);
    return S.getAggregate().then(function (a) { aggCache = a; return a; });
  }

  function reasonBars(b) {
    return b.reasons.map(function (r) {
      var pct = Math.round((r.n / b.n) * 100);
      return '<div class="reason-row"><div class="reason-top">' +
        '<span class="reason-label">' + esc(D.reasonLabel(b.outcome, r.reason_code)) + '</span>' +
        '<span class="reason-n">' + pct + '% &middot; n=' + r.n + '</span></div>' +
        '<div class="bar' + (b.outcome === 'selected' ? ' is-good' : '') + '">' +
        '<span style="width:' + Math.max(pct, 2) + '%"></span></div></div>';
    }).join('');
  }

  function bucketBlock(b) {
    var label = labelOf(D.ROUNDS, b.round);
    if (b.n < D.MIN_N_CELL) {
      return '<p class="round-name">' + esc(label) + '</p>' +
             '<p class="thin">Too few logged yet (n=' + b.n + ').</p>';
    }
    return '<p class="round-name">' + esc(label) + ' — students who were cut (n=' + b.n + ')</p>' +
      reasonBars(b);
  }

  function renderData() {
    render('<p class="muted">Loading…</p>');
    loadAggregate().then(function (agg) {
      if (agg.error) {
        render('<div class="err">Could not load the data.</div>');
        return;
      }
      var listed = (agg.companies || []).filter(function (c) {
        return c.total >= D.MIN_N_COMPANY && c.company_key !== D.UNNAMED_KEY;
      });
      render('<h1>What is actually getting people cut</h1>' +
        '<p class="muted">Across ' + agg.total_rows + ' rounds students have logged. ' +
        'Every number shows its n. Nothing is hidden behind a form.</p>' +
        '<div class="card">' + (agg.overall || []).map(bucketBlock).join('') + '</div>' +
        (listed.length
          ? '<h2>By company</h2>' + listed.map(function (c) {
              return '<div class="card"><div class="card-head">' +
                '<span class="card-title">' + esc(c.company_display) + '</span>' +
                '<span class="reason-n">' + c.total + ' rounds</span></div></div>';
            }).join('')
          : '<p class="thin">No company has ' + D.MIN_N_COMPANY + ' logged rounds yet. ' +
            'That floor exists so one person cannot create a claim about a company.</p>') +
        '<div class="sticky-cta"><button class="btn" data-again>Get a verdict on your round</button></div>');
    });
  }

  /* ---------- home ---------- */
  function renderHome() {
    render('<h1>Nobody tells you why you were cut.</h1>' +
      '<p>Describe one round you were rejected from. Ninety seconds. You get back the ' +
      'verdict the company never sent — or an honest answer that your account ' +
      'isn’t enough to call it.</p>' +
      '<div class="row-actions">' +
        '<button class="btn" data-again>Describe a round</button>' +
        '<button class="btn btn-ghost" data-data>See what happens to everyone else</button>' +
      '</div>' +
      '<p class="faint" style="margin-top:18px">No login. No email. Nothing about you is stored ' +
      'beyond the round you describe.</p>');
  }

  /* ---------- delegated ---------- */
  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-again]')) {
      draft = blank(); step = 0; startedAt = null; current = null;
      go('#/describe');
    }
    if (e.target.closest('[data-data]')) go('#/data');
    if (e.target.closest('[data-addmore]')) {
      step = 3;                         // back to the account, answers intact
      go('#/describe');
    }
    var c = e.target.closest('[data-copy]');
    if (c) {
      var text = c.getAttribute('data-copy');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          c.textContent = 'Copied';
        }).catch(function () {});
      }
    }
  });

  /* ---------- router ---------- */
  function route() {
    var h = (global.location.hash || '').replace(/^#/, '');
    if (h === '/describe') { renderStep(); return; }
    if (h === '/verdict') { renderVerdict(); return; }
    if (h === '/thin') { renderThin(); return; }
    if (h === '/data') { renderData(); return; }
    renderHome();
  }

  function boot() {
    S.init(CFG);
    var contact = document.getElementById('contact');
    if (contact && CFG.CONTACT_EMAIL) {
      contact.href = 'mailto:' + CFG.CONTACT_EMAIL;
      contact.textContent = CFG.CONTACT_EMAIL;
    }
    S.getSession();
    S.logEvent('page_view');
    S.flushEvents();
    global.addEventListener('hashchange', route);
    route();
  }

  global.VerdictApp = { scrub: scrub };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
