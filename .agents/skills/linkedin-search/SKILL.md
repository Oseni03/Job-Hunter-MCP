---
name: linkedin-search
version: 2.0.0
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

Search live job listings from every adapter in `host/job-hunter/scraper/` by default
(`all`: Indeed + LinkedIn via the shared Site client, plus remote boards, HN Who is
hiring, and Nigerian boards) via one unified CLI. Pass `--source <name>` to narrow to
one Site or adapter (`indeed`, `linkedin`, `remotive`, `remoteok`, `wwr`, `hn`,
`jobberman`, `myjobmag`). No authentication, no API key,
zero extra runtime dependencies beyond `npm install` — runs with plain `node`.
Location is always passed explicitly.

> Country-agnostic worked example of the repo's job-portal-skill pattern. LinkedIn searches
> globally by `--location`; Indeed additionally selects its domain by `--country`.

## Personal use only

Automated access is against LinkedIn's Terms of Service: **keep volume low, no commercial or bulk use.** Run on your own responsibility.

## Commands

### Search job listings

```bash
node host/job-hunter/scraper/cli.ts search --location "<place>" [flags]
```

Flags: `--location/-l` **required** (e.g. `"Berlin, Germany"`, `"Remote"`); `--query/-q` keyword (recommended); `--jobage` 1/7/14/30 days; `--jobage-minutes` sub-day (conflicts with `--jobage`); `--remote` remote/hybrid/onsite; `--country` Indeed domain (e.g. `germany`, default `usa`; LinkedIn ignores it); `--page` legacy adapters only; `--limit/-n` cap; `--source/-s` Site or adapter name, `all` for every source (default `all`); `--format json|table|plain` (default json); `--enrich` fetches full descriptions for snippet-only sources (Jobberman, MyJobMag).

Date filters keep undated jobs (flag them "date unknown" downstream). Sites report honest per-Site outcomes (a blocked Site errors, never an empty result); some legacy boards ignore keyword params server-side, so matching is client-side over recent listings — niche keywords can return few results.

Responses from legacy adapters are cached on disk (`.scratch/scrape-cache/`, gitignored): searches 30–60 min, details 7 days. Site searches never touch the disk cache. Repeat runs are instant until entries expire. Bypass with `SCRAPER_CACHE_DISABLE=1`, relocate with `SCRAPER_CACHE_DIR`.

### Fetch full job detail

```bash
node host/job-hunter/scraper/cli.ts detail <id|url> [--format json|plain]
```

Accepts numeric LinkedIn job ID, full `jobs/view/...` URL, or `urn:li:jobPosting:...` URN. Returns description, seniority, employment type, job function, industries. Non-LinkedIn URLs get best-effort page-text extraction.

### List sources

```bash
node host/job-hunter/scraper/cli.ts sources [--format json|table|plain]
```

Lists every registered Site and adapter; every entry runs without configuration.

## Notes

- Sites fetch plain-text descriptions with a 14-day recency window; rich per-posting fetches stay off by default for speed.
- CLI retries 429/5xx with exponential backoff. Errors to stderr as `{ "error": "...", "code": "..." }`, exit 1.
