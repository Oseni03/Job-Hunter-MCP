# 01: Site adapter tracer bullet (Indeed via ts-jobspy)

**What to build:** An end-to-end job-discovery path where requesting the Indeed Site returns scored, deduped candidates with honest source reporting, without changing any other Source or Adapter behavior.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Requesting only the Indeed Site returns candidates carrying title, company, resolvable URL, dates or unknown-date flag, quick-fit band, portal tag, and scraper Source through the existing limit, paging, and caller-dedupe behavior
- [ ] Per-Site fetch sizing respects the total result cap when merged across Sites, descriptions arrive as plain text for scoring, and invalid input yields errors with zero invented postings
