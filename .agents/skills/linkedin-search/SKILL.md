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
allowed-tools: Bash(bun run .agents/skills/linkedin-search/cli/src/cli.ts *)
---

# LinkedIn Search Skill

Search live job listings from LinkedIn's public job board for **any country/region** (and remote). No authentication, no API key, zero runtime dependencies — runs with just `bun`. Location is always passed explicitly.

> Country-agnostic worked example of the repo's job-portal-skill pattern. LinkedIn's `jobs-guest` endpoints are global; only `--location` changes per market.

## Personal use only

Automated access is against LinkedIn's Terms of Service: **keep volume low, no commercial or bulk use.** Run on your own responsibility.

## Commands

### Search job listings

```bash
bun run .agents/skills/linkedin-search/cli/src/cli.ts search --location "<place>" [flags]
```

Flags: `--location/-l` **required** (e.g. `"Berlin, Germany"`, `"Remote"`); `--query/-q` keyword (recommended); `--jobage` 1/7/14/30 days; `--jobage-minutes` sub-day (conflicts with `--jobage`); `--remote` remote/hybrid/onsite; `--page` 1-indexed (10/page); `--limit/-n` cap; `--format json|table|plain` (default json).

### Fetch full job detail

```bash
bun run .agents/skills/linkedin-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Accepts numeric job ID, full `jobs/view/...` URL, or `urn:li:jobPosting:...` URN. Returns description, seniority, employment type, job function, industries.

## Notes

- Public `jobs-guest` endpoints, no credentials. Page size fixed at 10.
- CLI retries 429/5xx with exponential backoff. Errors to stderr as `{ "error": "...", "code": "..." }`, exit 1.
