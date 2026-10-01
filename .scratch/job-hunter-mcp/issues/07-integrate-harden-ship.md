# 07: Integrate harden and ship

**What to build:** A verified, deployable MCP where all ten tools plus resources and prompts pass type, lint, client, and golden checks behind auth, with the future store and login paths explicitly deferred.

**Blocked by:** 02-tailor-cv-cover-letter, 03-record-application, 04-prep-strategy-form-fields, 05-search-jobs, 06-resources-overrides-verify, 08-rank-jobs, 09-research-company, 10-resources, 11-prompts.

**Status:** done (commit a3726b1; tsc clean, 277/277 node:test green, eslint clean, golden 26 pass)

- [ ] Type check, lint, and client run green across all ten tools plus resources and prompts on fixture postings, including the cover example compiling to exactly one page
- [ ] Golden checks prove tailored TeX contains posting keywords, honors writing bans, matches the tracker header exactly, respects recency and result caps, keeps canonical keys stable, and preserves ASCII dates and translated headings
- [ ] Deployed endpoint verifies behind the bearer token with local open and prod closed, and the shipped client config points at the correct route
- [ ] Record payload stays portable for a later key-value, relational, or blob store with no schema churn, and full login-based auth is recorded as a later phase
- [ ] No tool writes outside its contract, touches the dedup store from the record path, or invents postings, claims, keys, or deadlines
