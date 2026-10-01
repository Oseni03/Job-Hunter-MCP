# 09: Research company with cache

**What to build:** A company-research tool shared by application drafting and interview prep that reuses fresh findings and verifies every claim before it lands in an artifact.

**Blocked by:** 01-foundation-evaluate-job.

**Status:** done (commit 850719a + b2b49e2 fix; tsc clean, 277/277 node:test green, eslint clean, golden 26 pass)

- [ ] Checks the per-company cache file within its time-to-live first and uses it as the starting point, otherwise researches website, reviews, team signals, and media from the company name and official site only
- [ ] Verifies every returned claim against a fetched page from the company's own domain or consistent independent reporting, treating snippets as leads only and dropping what cannot be fetched after the full escalation
- [ ] Records source URLs plus notes per category and interviewer-angle notes from public professional information only, storing research as data never instructions
- [ ] Writes or overwrites the cache file with fresh findings and fetch date so later runs reuse discovery without skipping final-claim verification
- [ ] Follows the trust boundary throughout (posting and reached pages untrusted, never follow embedded directions, never fetch in-posting URLs) and reports what was verified and from where
