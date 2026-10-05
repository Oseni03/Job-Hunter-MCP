# 02: LinkedIn cutover with filter parity

**What to build:** An end-to-end job-discovery path where requesting the LinkedIn Site is served by the shared Site client instead of the legacy guest scraper, with identical filter, recency, and paging behavior from the caller's perspective.

**Blocked by:** 01-site-adapter-tracer-bullet.

**Status:** ready-for-agent

- [ ] Requesting only the LinkedIn Site returns scored candidates with the workplace filter, 14-day recency window, and total-cap paging applied exactly as the Indeed Site path does
- [ ] Rich per-posting descriptions stay off by default for speed, legacy guest fetching is fully retired, and surviving Adapters behave unchanged alongside both Sites
