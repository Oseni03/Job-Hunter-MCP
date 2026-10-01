# 08: Rank jobs triage shortlist

**What to build:** A batch triage tool that turns a backlog of found postings into a ranked shortlist with vetoes and urgency, without the depth of a full evaluation.

**Blocked by:** 01-foundation-evaluate-job.

**Status:** done (commit cd4749c + b2b49e2 fix; tsc clean, 277/277 node:test green, eslint clean, golden 26 pass)

- [ ] Accepts focus text, limit bounding expensive work, top bounding shortlist size, and all-flag for re-rank, reporting eligible, deferred, and tracker-excluded counts before scoring
- [ ] Scores from fetched posting text only against the five-dimension weights and verdict bands, with no company research, salary lookup, or reviewer, and never scores from title alone or fabricates content
- [ ] Applies location and language-gate vetoes (FAIL excluded with quoted reason, FLAG stays with visible marker and note), urgency tiebreak for deadlines within 7 days, past-deadline to expired, and staleness flag for old posted dates without veto
- [ ] Persists additive-only rank fields (score, verdict band, date, location and language verdicts with note, refreshed deadline, verbatim strengths and gaps) and sweeps stored deadlines for newly expired and closing-soon entries without guessing absent or unparseable dates
- [ ] Presents shortlist plus why-each-ranked, closing-soon, below-threshold, and excluded sections with posting links, states triage limits, and routes picks back to full evaluation which always re-runs
