# 12: Search result quality (confidence, matching, ordering, dates, tuning)

**What to build:** Raise `quick-fit` signal quality in `lib/search.ts` / `lib/evaluate.ts` without breaking determinism or testability. Heuristic stays the default cheap path; an LLM acts only as a structured extractor behind a tested seam, mirroring the existing sampling → groq → heuristic refinement pattern in `evaluate-job`.

**Blocked by:** 05-search-jobs, 01-foundation-evaluate-job.

**Status:** ready-for-agent

- [ ] Thin-evidence confidence is deterministic, no LLM needed: emit `lowEvidence: true` plus `textLength` when the probe text is under a threshold, and withhold the band (report "unscored — thin evidence") instead of asserting `low`
- [ ] Language-FAIL → `low` downgrade is kept (deliberate gate, not an evidence problem); confidence and gating stay separate fields so the host can tell them apart
- [ ] Candidates are stable-sorted by `quickFit.score` descending before the `limit` slice, so the cap keeps the best matches; thin-evidence items sort after solid ones at equal score
- [ ] Skill matching uses word-boundary matching with a short-token guard (tokens of length ≤ 2 require exact token match) plus a small tested alias map (K8s/Kubernetes, Postgres/SQL, JS/JavaScript, …); fixture tests pin both the hits and the near-misses so the map cannot become its own false-positive source. "Go" and "R" are the worst cases — and the work covers the tailor matchers too (`matchItem`, `tailorBullets` phrase hits, `postingSurfaceForm` in `lib/tailor.ts` are the same substring family as the scorer).
- [ ] Language-gate keeps its requirement-context + word-boundary behavior; add a small negative-context guard (e.g. "founded", "headquartered") only as a ride-along to the matching work, with fixtures
- [ ] `parseDay` also resolves relative dates ("3 days ago", "yesterday", "last week") against the injected `now`, keeping YYYY-MM-DD priority and unknown-on-unparseable; never guessed, still nullable
- [ ] LLM extraction seam (optional pass, batched): one batched call over the candidates' probe texts returns structured JSON only (mentioned skills with quotes, language requirements with quotes, normalized dates); the deterministic scorer consumes it, heuristic output is the automatic fallback, and the refinement source is recorded per the evaluate-job pattern — scores must cite matched text, never invented qualities
- [ ] Claim wording stops overclaiming: `VerifiedClaim.verified: true` currently means "a sentence from a page we fetched," not "true" — rename to `fetched`/`sourced` across the schema, renderer, and consumers, and let the extraction seam (required-vs-mentioned with evidence quotes) replace first-two-sentences harvesting, where marketing copy otherwise passes as verified fact; `research-company` full pages are the primary beneficiary
- [ ] Score/band tuning is a measurement task first: label 20–30 real postings, check rank-order (not absolute values) of the current weights and the 60/45 bands, then tune from the data; no weight changes without the labeled set
- [ ] Scale comparability is stated, not assumed: quick-fit bands (60/45 on snippets) and rank verdict bands (75/60/45/30 on full text) are different instruments over different text depths — the label-then-tune protocol covers both tools, and until calibrated the docs state the two scores are not comparable
- [ ] Word-boundary and alias fixes live in `lib/evaluate.ts`, so they propagate to `rank-jobs` automatically; the required-vs-nice-to-have extraction (with evidence quotes) names `rank-jobs` full-text inflation as its primary beneficiary. Same substring family covers `groundingFor` in `lib/strategy.ts` (either-direction containment) — whole-word overlap with a generic-term guard there.
