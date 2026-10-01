# 05: Search jobs via LinkedIn live and BrightData

**What to build:** A job-discovery tool that finds fresh postings from LinkedIn-compatible sources, dedupes without owning state, and triage-scores each hit for the shortlist.

**Blocked by:** 01-foundation-evaluate-job.

**Status:** done (commit a9c6661; tsc clean, 277/277 node:test green, eslint clean, golden 26 pass)

- [ ] Accepts explicit filters (keywords, location, remote mode, job type, limit capped at 20) with profile-derived auto-query and per-language function-based categories when args are absent, scoped to the last 14 days with unknown dates flagged rather than dropped
- [ ] Live path preserves the portal contract (required explicit location, keyword query, recency and workplace filters, paged results, JSON output, full detail fetch, structured stderr errors, low-volume backoff behavior)
- [ ] Server path uses the BrightData key when configured and degrades to web search fallback otherwise, never scraping people-search pages and never fabricating postings
- [ ] Keys are a pure deterministic function of company, title, and URL with capped slugs plus hash disambiguation, safe-character alphabet, non-Latin fallback to numeric ID, canonical-shape audit, and duplicate-URL detection
- [ ] Dedupe is caller-passed (seen keys plus applied pairs) with the server returning stability-ready keys, while the host owns all writes to the seen store and tracker
- [ ] Each candidate carries title, company, resolvable non-fragment URL, posted and deadline dates or null, quick-fit plus language-gate override or flag, status including expired ghosts never silently dropped, portal and source tags, mass-posting consolidation note, and referral search links for high and medium fits only
