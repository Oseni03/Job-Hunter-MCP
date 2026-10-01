# 13: Search source strategy (structured boards first, merged queries)

**What to build:** Replace scraping as the primary discovery path with public structured job-board JSON, and make multi-query coverage explicit instead of silently single-query. No LLM involved: this is a sources-and-plumbing change, and an LLM cannot fix ToS exposure or fetch what was never queried.

**Blocked by:** 05-search-jobs.

**Status:** ready-for-agent

- [ ] Spike first: confirm Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co`), and Ashby (`api.ashbyhq.com/posting-api`) answer without keys and note their real company/date/description fields; Adzuna (keyed) and RemoteOK (JSON) stay backups, recorded in the spike note
- [ ] Add a board source built on the spike winner(s) and insert it ahead of BrightData in the `planSearch` source chain; BrightData and the DuckDuckGo/LinkedIn-guest scrapers are demoted to fallback, keeping the people-search guard and the never-invent-postings rule on every path
- [ ] Board results carry real companies, so the `"Unknown company"` placeholder path is retired for board-sourced candidates; any remaining unknown-company candidate is flagged for host verification before evaluating
- [ ] End first-match-wins silence: run the query set (explicit query, or each auto-query up to a documented per-run cap) across the active source, merge and dedupe across queries, and report `queriesRun` so the caller can see what coverage was actually bought; low-volume politeness caps stay, but they are now visible
- [ ] Keep the per-source error-into-`errors[]` behavior: a dead board degrades to the next source with zero invented postings, exactly as today
