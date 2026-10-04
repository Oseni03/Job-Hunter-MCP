---
name: linkedin-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in any location or
  market, find job listings, or look up a specific job posting — in any country,
  city, or remotely. Trigger phrases: find a job, job search, search for jobs,
  job openings, vacancies, hiring, positions open, remote jobs.
context: fork
enabled: true
allowed-tools: Bash(node host/job-hunter/scraper/cli.ts *)
---

# LinkedIn Search Skill

Search live job listings from LinkedIn's public job board (default) plus every
adapter in `host/job-hunter/scraper/` (remote boards, HN Who is hiring, Greenhouse company
boards, Nigerian boards) via one unified CLI. No authentication, no API key,
zero extra runtime dependencies — runs with plain `node`. Location is always passed explicitly.

> Country-agnostic worked example of the repo's job-portal-skill pattern. LinkedIn's `jobs-guest` endpoints are global; only `--location` changes per market.

## Personal use only

Automated access is against LinkedIn's Terms of Service: **keep volume low, no commercial or bulk use.** Run on your own responsibility.

## Commands

### Search job listings

```bash
node host/job-hunter/scraper/cli.ts search --location "<place>" [flags]
```

Flags: `--location/-l` **required** (e.g. `"Berlin, Germany"`, `"Remote"`); `--query/-q` keyword (recommended); `--jobage` 1/7/14/30 days; `--jobage-minutes` sub-day (conflicts with `--jobage`); `--remote` remote/hybrid/onsite; `--page` 1-indexed (10/page, LinkedIn only); `--limit/-n` cap; `--source/-s` adapter name, `all` for every source (default `linkedin`); `--format json|table|plain` (default json); `--enrich` fetches full descriptions for snippet-only sources (LinkedIn, Jobberman, MyJobMag).

Date filters keep undated jobs (flag them "date unknown" downstream). Some boards ignore keyword params server-side, so matching is client-side over recent listings — niche keywords can return few results.

Responses are cached on disk (`.scratch/scrape-cache/`, gitignored): searches 30–60 min, details 7 days. Repeat runs are instant until entries expire. Bypass with `SCRAPER_CACHE_DISABLE=1`, relocate with `SCRAPER_CACHE_DIR`.

### Fetch full job detail

```bash
node host/job-hunter/scraper/cli.ts detail <id|url> [--format json|plain]
```

Accepts numeric LinkedIn job ID, full `jobs/view/...` URL, or `urn:li:jobPosting:...` URN. Returns description, seniority, employment type, job function, industries. Non-LinkedIn URLs get best-effort page-text extraction.

### List sources

```bash
node host/job-hunter/scraper/cli.ts sources [--format json|table|plain]
```

Lists every registered adapter; flags ones needing configuration (e.g. Greenhouse board tokens in `host/job-hunter/scraper/config/boards.ts`).

### Manual fallback queries

```bash
node host/job-hunter/scraper/cli.ts queries --query "ML Engineer" [--format json|plain]
```

When structured adapters miss: prints Google-hacking operators (site:-scoped board/jobs pages, quoted terms, OR groups, exact phrase) to paste into a search engine. Plain (default) prints one per line, paste-ready. Nothing is fetched — the host runs the searches and feeds resolvable posting URLs back through `detail` or WebFetch.

## Notes

- LinkedIn uses public `jobs-guest` endpoints, no credentials. Page size fixed at 10.
- CLI retries 429/5xx with exponential backoff. Errors to stderr as `{ "error": "...", "code": "..." }`, exit 1.
