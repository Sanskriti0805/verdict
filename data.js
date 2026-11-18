/* Verdict — enums, labels, company normalisation and the "countable" predicate.
   Reason CODES are what gets stored. Labels live here only, so wording can change
   after watching a user without migrating a single row. */

(function (global) {
  'use strict';

  var ROUNDS = [
    { code: 'resume_shortlist',  label: 'Resume shortlist' },
    { code: 'online_assessment', label: 'Online test / OA' },
    { code: 'group_discussion',  label: 'Group discussion' },
    { code: 'technical_1',       label: 'Technical round 1' },
    { code: 'technical_2',       label: 'Technical round 2' },
    { code: 'managerial',        label: 'Managerial round' },
    { code: 'hr_final',          label: 'HR / final round' },
    { code: 'no_round_silence',  label: 'Never heard back at all' }
  ];

  var ROLE_FAMILIES = [
    { code: 'swe_sde',              label: 'Software / SDE' },
    { code: 'data_ml',              label: 'Data / ML' },
    { code: 'core_non_it',          label: 'Core engineering (non-IT)' },
    { code: 'analyst_consulting',   label: 'Analyst / consulting' },
    { code: 'product_design',       label: 'Product / design' },
    { code: 'marketing_sales_bd',   label: 'Marketing / sales / BD' },
    { code: 'ops_hr_finance',       label: 'Operations / HR / finance' },
    { code: 'internship_generic',   label: 'Internship, role not specified' },
    { code: 'other',                label: 'Something else' }
  ];

  /* Reason lists are keyed by outcome. The adapter validates against these,
     so a hand-crafted payload cannot pair a "selected" reason with a rejection. */
  var REASONS = {
    rejected: [
      { code: 'below_cutoff',    label: 'Below the CGPA or marks cutoff' },
      { code: 'missing_skill',   label: 'Missing a skill they wanted' },
      { code: 'project_depth',   label: 'Could not explain my own project in depth' },
      { code: 'coding_round',    label: 'Did not clear the coding round' },
      { code: 'communication',   label: 'Communication was hard to follow' },
      { code: 'role_filled',     label: 'Role was filled before they reached me' },
      { code: 'applied_late',    label: 'I applied after the shortlist closed' },
      { code: 'seats_capped',    label: 'Strong profile, but they were capped on seats' },
      { code: 'no_reason_given', label: 'No reason was ever given' }
    ],
    selected: [
      { code: 'project_depth_stood_out', label: 'My project depth stood out' },
      { code: 'coding_comfortable',      label: 'Cleared the coding round comfortably' },
      { code: 'relevant_internship',     label: 'Relevant internship or live work' },
      { code: 'clear_thinking',          label: 'Explained my thinking clearly' },
      { code: 'no_reason_given',         label: 'No reason was given, I just moved on' }
    ]
  };

  var OUTCOMES = [
    { code: 'rejected', label: 'Rejected, or never heard back' },
    { code: 'selected', label: 'Moved to the next round' }
  ];

  var REASON_SOURCES = [
    { code: 'told_by_recruiter', label: 'They told me' },
    { code: 'inferred_by_me',    label: 'I worked it out myself' }
  ];

  /* Canonical display names, also the autocomplete list. Keep this near 25 —
     every extra name is maintenance for a two-day test. */
  var COMPANIES = [
    'TCS', 'Infosys', 'Wipro', 'Cognizant', 'Accenture', 'Capgemini', 'LTIMindtree',
    'HCLTech', 'Tech Mahindra', 'Deloitte', 'PwC', 'EY', 'KPMG', 'ZS Associates',
    'Amazon', 'Microsoft', 'Google', 'Oracle', 'SAP', 'Adobe', 'Nvidia', 'Qualcomm',
    'Samsung', 'Goldman Sachs', 'JPMorgan Chase', 'Flipkart', 'Swiggy', 'Zomato',
    'PhonePe', 'Paytm', 'Razorpay', 'Zoho', 'Freshworks', 'Persistent Systems',
    'Mphasis', 'Nagarro', 'Thoughtworks', 'Publicis Sapient', 'Siemens', 'Bosch',
    'L&T', 'BHEL', 'BEL', 'DRDO', 'ISRO', 'ONGC', 'NTPC', 'IOCL',
    'Maruti Suzuki', 'Tata Motors', 'Mahindra', 'Bajaj'
  ];

  /* Alias map runs BEFORE token stripping. Order matters: without this,
     "Tata Consultancy Services" would strip down to "tata". */
  var ALIASES = {
    'tcs': 'tcs', 'tata consultancy': 'tcs', 'tata consultancy services': 'tcs',
    'tcs ninja': 'tcs', 'tcs digital': 'tcs', 'tcs nqt': 'tcs',
    'infy': 'infosys', 'infosys': 'infosys', 'infosys bpm': 'infosys-bpm',
    'cts': 'cognizant', 'cognizant': 'cognizant',
    'lti': 'ltimindtree', 'l and t infotech': 'ltimindtree', 'mindtree': 'ltimindtree',
    'ltimindtree': 'ltimindtree', 'larsen and toubro infotech': 'ltimindtree',
    'hcl': 'hcltech', 'hcl tech': 'hcltech', 'hcltech': 'hcltech',
    'tech mahindra': 'tech-mahindra', 'techm': 'tech-mahindra',
    'ey': 'ey', 'ernst and young': 'ey', 'ey gds': 'ey',
    'pwc': 'pwc', 'price waterhouse coopers': 'pwc',
    'de shaw': 'de-shaw', 'd e shaw': 'de-shaw',
    'zs': 'zs-associates', 'zs associates': 'zs-associates',
    'jpmc': 'jpmorgan-chase', 'jp morgan': 'jpmorgan-chase', 'jpmorgan': 'jpmorgan-chase',
    'gs': 'goldman-sachs', 'goldman': 'goldman-sachs', 'goldman sachs': 'goldman-sachs',
    'srib': 'samsung', 'samsung rnd': 'samsung', 'samsung research': 'samsung',
    'rbei': 'bosch', 'bosch': 'bosch', 'robert bosch': 'bosch',
    'l and t': 'lt', 'larsen and toubro': 'lt',
    'pw': 'physics-wallah', 'physics wallah': 'physics-wallah',
    'amazon': 'amazon', 'aws': 'amazon',
    'ms': 'microsoft', 'microsoft': 'microsoft'
  };

  /* Stripped only when the alias map misses. */
  var FILLER = ['pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'corp', 'co', 'plc',
                'india', 'technologies', 'technology', 'solutions', 'services',
                'systems', 'labs', 'software', 'consultancy', 'consulting',
                'global', 'gcc', 'gds'];

  var BLOCKLIST = ['test', 'asdf', 'qwerty', 'none', 'na', 'xyz', 'abc', 'fuck',
                   'shit', 'dick', 'penis', 'sex', 'porn', 'lol', 'lmao', 'idk',
                   'nothing', 'dunno', 'aaa'];

  function slug(s) {
    return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function clean(raw) {
    return String(raw || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleCase(s) {
    return s.split(' ').map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join(' ');
  }

  /* Returns { key, display, cleaned }. Never throws. */
  function normalizeCompany(raw) {
    var c = clean(raw);
    if (!c) return { key: '', display: '', cleaned: '' };

    if (Object.prototype.hasOwnProperty.call(ALIASES, c)) {
      var key = ALIASES[c];
      return { key: key, display: displayFor(key, c), cleaned: c };
    }

    // Strip trailing filler, but never down to nothing.
    var parts = c.split(' ');
    while (parts.length > 1 && FILLER.indexOf(parts[parts.length - 1]) !== -1) {
      parts.pop();
    }
    var stripped = parts.join(' ');

    if (Object.prototype.hasOwnProperty.call(ALIASES, stripped)) {
      var k2 = ALIASES[stripped];
      return { key: k2, display: displayFor(k2, stripped), cleaned: c };
    }

    return { key: slug(stripped), display: displayFor(null, stripped), cleaned: c };
  }

  var DISPLAY_BY_KEY = (function () {
    var m = {};
    COMPANIES.forEach(function (name) { m[normalizeKeyOnly(name)] = name; });
    return m;
  })();

  function normalizeKeyOnly(name) {
    var c = clean(name);
    return Object.prototype.hasOwnProperty.call(ALIASES, c) ? ALIASES[c] : slug(c);
  }

  function displayFor(key, fallbackCleaned) {
    if (key && DISPLAY_BY_KEY[key]) return DISPLAY_BY_KEY[key];
    return titleCase(fallbackCleaned);
  }

  function labelFor(list, code) {
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i].label;
    return code;
  }

  function reasonLabel(outcome, code) {
    var list = REASONS[outcome] || [];
    return labelFor(list, code);
  }

  function isValidReason(outcome, code) {
    var list = REASONS[outcome];
    if (!list) return false;
    return list.some(function (r) { return r.code === code; });
  }

  function hasCode(list, code) {
    return list.some(function (x) { return x.code === code; });
  }

  var MIN_SUBMIT_MS = 4000;
  var MAX_ENTRIES_PER_SESSION = 10;

  /* Decides the stored `status`. Junk is still written — we want to see the
     attempt — it just never reaches the aggregate. */
  function classify(entry, opts) {
    opts = opts || {};
    if (entry.is_test) return 'excluded_test';

    var key = entry.company_key || '';
    if (key.length < 2 || key.length > 40) return 'excluded_junk';
    if (BLOCKLIST.indexOf(entry.company_raw ? clean(entry.company_raw) : '') !== -1) return 'excluded_junk';
    if (/^[0-9-]+$/.test(key)) return 'excluded_junk';
    if (/^(.)\1+$/.test(key.replace(/-/g, ''))) return 'excluded_junk';

    if (!hasCode(ROUNDS, entry.round)) return 'excluded_junk';
    if (!hasCode(ROLE_FAMILIES, entry.role_family)) return 'excluded_junk';
    if (!hasCode(OUTCOMES, entry.outcome)) return 'excluded_junk';
    if (!isValidReason(entry.outcome, entry.reason_code)) return 'excluded_junk';

    if (typeof entry.time_to_submit_ms === 'number' && entry.time_to_submit_ms < MIN_SUBMIT_MS) {
      return 'excluded_junk';
    }
    if (entry.session_entry_seq > MAX_ENTRIES_PER_SESSION) return 'excluded_junk';
    if (opts.isDuplicate) return 'excluded_dupe';

    return 'counted';
  }

  /* Display floors. One person must not be able to manufacture a published
     claim about a named company — this is the anti-spam and the anti-defamation
     control at the same time. */
  var MIN_N_CELL = 3;
  var MIN_N_COMPANY = 5;

  /* Rows where the student described a round but never named the company.
     They count towards the cross-company picture, which is the core finding,
     but they must never appear in the per-company ranking — attributing an
     unnamed rejection to a named company would be inventing the data. */
  var UNNAMED_KEY = 'not-named';

  global.VerdictData = {
    ROUNDS: ROUNDS,
    ROLE_FAMILIES: ROLE_FAMILIES,
    REASONS: REASONS,
    OUTCOMES: OUTCOMES,
    REASON_SOURCES: REASON_SOURCES,
    COMPANIES: COMPANIES,
    MIN_N_CELL: MIN_N_CELL,
    MIN_N_COMPANY: MIN_N_COMPANY,
    UNNAMED_KEY: UNNAMED_KEY,
    MIN_SUBMIT_MS: MIN_SUBMIT_MS,
    MAX_ENTRIES_PER_SESSION: MAX_ENTRIES_PER_SESSION,
    normalizeCompany: normalizeCompany,
    labelFor: labelFor,
    reasonLabel: reasonLabel,
    isValidReason: isValidReason,
    classify: classify,
    slug: slug
  };
})(window);
