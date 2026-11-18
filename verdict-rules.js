/* Verdict — the rule engine.

   Produces the verdict a company should have sent, from what the student
   actually reported. No model, so it can never invent a question, a reaction
   or a number: every branch below fires on a fact the student ticked or typed.

   Two rules shape everything:

   1. STRUCTURAL OUTRANKS PERFORMANCE. If the account reports a cutoff, a seat
      cap, a filled role or a closed form, that decided it — before any answer
      mattered. Students systematically read structural rejection as personal
      failure, and correcting that is the most useful thing this page does.
   2. WHEN STRUCTURAL, NO ADVICE. Telling someone what to improve right after
      telling them it wasn't about them undoes the whole point. */

(function (global) {
  'use strict';

  var D = global.VerdictData;

  function has(facts, code) { return (facts || []).indexOf(code) !== -1; }

  function roundLabel(round) {
    return D.labelFor(D.ROUNDS, round).toLowerCase();
  }

  /* ---------- structural branches ---------- */
  function structural(input) {
    var s = input.structural;
    var r = roundLabel(input.round);

    if (s === 'role_filled') return {
      reason: 'role_filled',
      headline: 'The seat was gone before you spoke.',
      verdict: 'By your account they told you the role was already filled or on hold. ' +
        'That decision was made before your ' + r + ' started. There is no version of ' +
        'that round you win, and nothing you said in it changed anything.',
      confidence: 'high',
      because: 'You said they told you this outright.'
    };

    if (s === 'seats_capped') return {
      reason: 'seats_capped',
      headline: 'You were competing for a number, not a bar.',
      verdict: 'By your account they said there were only a few seats. That means you were ' +
        'not measured against a standard you could meet, but against everyone else who ' +
        'showed up. Clearing the bar and still missing out are the same outcome here.',
      confidence: 'high',
      because: 'You said the seat count came up.'
    };

    if (s === 'applied_late') return {
      reason: 'applied_late',
      headline: 'The form had closed. Nobody read it.',
      verdict: 'By your account you applied after the deadline or after the form had shut. ' +
        'In most campus processes that means the application was never opened by a person. ' +
        'This one was a calendar problem, not a you problem.',
      confidence: 'high',
      because: 'You said the deadline had already passed.'
    };

    if (s === 'ineligible') return {
      reason: 'below_cutoff',
      headline: 'A rule cut this, not an answer.',
      verdict: 'By your account you were told you did not meet an eligibility rule. ' +
        'Those are applied by a filter before anyone reads what you wrote or hears what ' +
        'you say. Nothing in your ' + r + ' could have moved it.',
      confidence: 'high',
      because: 'You said you were told about the rule directly.'
    };

    /* Not reported outright, but the shape is unmistakable: an early round,
       academics raised, and a band below the common cutoff. */
    var earlyRound = ['resume_shortlist', 'online_assessment', 'no_round_silence']
      .indexOf(input.round) !== -1;
    var lowBand = input.cgpa_band === 'below_6' || input.cgpa_band === '6_to_7';

    if (earlyRound && lowBand && has(input.facts, 'asked_academics')) return {
      reason: 'below_cutoff',
      headline: 'This looks like a cutoff, not a judgement.',
      verdict: 'They asked about your academics at the ' + r + ' stage, and your band sits ' +
        'where most campus cutoffs are drawn. That points at a filter rather than anything ' +
        'you did. Worth confirming with them, because if it is the cutoff, no amount of ' +
        'preparation changes this particular outcome.',
      confidence: 'medium',
      because: 'Academics came up early, and your band is near the usual line.'
    };

    return null;
  }

  /* ---------- performance branches ---------- */
  function performance(input) {
    var f = input.facts || [];
    var r = roundLabel(input.round);

    if (has(f, 'deep_project')) {
      var alsoStuck = has(f, 'never_heard') || has(f, 'ran_out');
      return {
        reason: 'project_depth',
        second: alsoStuck ? 'missing_skill' : null,
        headline: 'They went at your project, and it moved.',
        verdict: 'You said they went deep into one of your own projects. That is the round ' +
          'where most people get cut, and almost never because they did not build the thing. ' +
          'It is because nobody had asked them to defend a decision out loud before. ' +
          'Knowing what it does is not the same as knowing why you chose it.',
        confidence: alsoStuck ? 'high' : 'medium',
        because: alsoStuck
          ? 'You said they went deep and that you got stuck in there.'
          : 'You said the project was where the round went.',
        actions: [
          { action: 'Pick your two strongest projects and write down why you chose each tool.',
            because: 'The why is what they push on, not the what.' },
          { action: 'Say each answer out loud once. Not in your head.',
            because: 'You said it came apart when you had to explain it.' }
        ]
      };
    }

    if (has(f, 'live_code')) {
      var ranOut = has(f, 'ran_out');
      return {
        reason: 'coding_round',
        headline: ranOut ? 'You ran out of clock, not ability.' : 'It came down to the coding round.',
        verdict: ranOut
          ? 'You said they had you write code live and that you did not finish. Unfinished ' +
            'usually reads the same as wrong to whoever scores it, even when your approach ' +
            'was right. That is a pacing problem, and it is a different fix from a knowledge one.'
          : 'You said they had you write code live. That is the filter at this stage, and it ' +
            'is scored on what runs, not on what you were going for.',
        confidence: ranOut ? 'high' : 'medium',
        because: ranOut ? 'You said you ran out of time in there.' : 'You said live code was part of it.',
        actions: ranOut
          ? [{ action: 'Practise with a timer running and stop dead when it ends.',
               because: 'Your problem was the clock, so train against the clock.' },
             { action: 'Get something working and ugly before making it good.',
               because: 'A partial answer that runs beats an elegant one that never finished.' }]
          : [{ action: 'Write the brute force first, then improve it out loud.',
               because: 'It shows a working answer early and your thinking after.' }]
      };
    }

    if (has(f, 'never_heard')) return {
      reason: 'missing_skill',
      headline: 'They tested something you had not met.',
      verdict: 'You said they asked about something you had never come across. That is a gap ' +
        'with a name, which makes it the most fixable thing on this page. It is worth finding ' +
        'out exactly what it was, because it is likely to appear again at this company.',
      confidence: 'medium',
      because: 'You said the topic was new to you.',
      actions: [
        { action: 'Write down the exact thing they asked, today, before you forget the words.',
          because: 'You can only close a gap you can name.' }
      ]
    };

    if (has(f, 'very_short')) return {
      reason: 'no_reason_given',
      headline: 'A round that short was decided before it started.',
      verdict: 'You said it was over in under ten minutes. Rounds that short are almost never ' +
        'where the decision gets made — they are where a decision already taken gets confirmed. ' +
        'That points away from your answers and towards something on paper.',
      confidence: 'medium',
      because: 'You said the whole thing lasted under ten minutes.',
      actions: [
        { action: 'Ask them what the shortlist criteria were.',
          because: 'If it was decided on paper, that is the only thing worth knowing.' }
      ]
    };

    return null;
  }

  /* ---------- silence ---------- */
  function silence(input) {
    var f = input.facts || [];
    if (!has(f, 'ghosted') && !has(f, 'bare_rejection') && input.round !== 'no_round_silence') {
      return null;
    }
    return {
      reason: 'no_reason_given',
      headline: 'Nothing here points anywhere. That is the honest answer.',
      verdict: 'You described a round that gave you nothing to work with, and we are not going ' +
        'to invent a reason to feel useful. Nobody can close this one from the outside, ' +
        'including us. What you can do is ask them directly — people do answer, more often ' +
        'than students expect.',
      confidence: 'low',
      because: 'Your account describes silence, not a moment that decided it.',
      actions: []
    };
  }

  /* ---------- the message they can actually send ---------- */
  function askThem(input) {
    var r = D.labelFor(D.ROUNDS, input.round);
    return 'Hello, I interviewed for the ' + (input.role_label || 'role') +
      ' and was not selected after the ' + r.toLowerCase() + '. ' +
      'If you have a moment, could you tell me the main reason? ' +
      'I am not asking you to reconsider — I just want to know what to work on. Thank you.';
  }

  var NOT_SHOWN = {
    structural: 'Whether anything else also counted against you. A reported rule explains the outcome, not every part of it.',
    performance: 'What the people in the room actually wrote down. This reads your account, not their notes.',
    unknown: 'Why they went quiet. Nothing you gave us points at a cause, and we will not guess at one.'
  };

  /* Returns the same shape the UI renders either way. */
  function decide(input) {
    var gate = D.signalScore(input);
    if (!gate.enough) {
      return {
        verdict_available: false,
        confidence: 'insufficient',
        missing: D.missingPrompts(input),
        signal: gate
      };
    }

    var hit = structural(input);
    var attribution = 'structural';

    /* Silence is checked BEFORE performance when nothing in the account reports
       a failure. A student who says the round went fine and then heard nothing
       must not be handed a manufactured weakness — that it was "the coding
       round" is precisely the fiction this engine exists to refuse. A ticked
       "they made me write code" is not evidence the code was why. */
    var reportedFailure = has(input.facts, 'ran_out') ||
                          has(input.facts, 'never_heard') ||
                          has(input.facts, 'deep_project');
    var wentQuiet = has(input.facts, 'ghosted') || has(input.facts, 'bare_rejection');

    if (!hit && wentQuiet && !reportedFailure) { hit = silence(input); attribution = 'unknown'; }
    if (!hit) { hit = performance(input); attribution = 'performance'; }
    if (!hit) { hit = silence(input); attribution = 'unknown'; }

    if (!hit) {
      return {
        verdict_available: false,
        confidence: 'insufficient',
        missing: D.missingPrompts(input),
        signal: gate
      };
    }

    return {
      verdict_available: true,
      primary_reason: hit.reason,
      second_possible: hit.second || null,
      attribution: attribution,
      headline: hit.headline,
      verdict: hit.verdict,
      confidence: hit.confidence,
      confidence_because: hit.because,
      not_shown: NOT_SHOWN[attribution],
      // Never advise someone you have just told it was not about them.
      next_round_actions: attribution === 'structural' ? [] : (hit.actions || []),
      ask_them: askThem(input),
      signal: gate
    };
  }

  global.VerdictRules = { decide: decide };
})(window);
