---
name: scrape
description: >
  Finds new job postings matching your profile via installed portal-search CLIs
  (LinkedIn, local job boards, and any skills added with /add-portal). Deduplicates
  across runs. Triggers on: job scrape, find jobs, search jobs, new jobs, job search,
  scrape jobs, /scrape
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(bun --version), Bash(bun run .agents/skills/*/cli/src/cli.ts *), Bash(python tools/job_key.py:*), Bash(python3 tools/job_key.py:*), WebFetch, WebSearch, Agent, AskUserQuestion
---

# Job Scraper

Searches job portals using the **installed portal-search CLIs** in `.agents/skills/` (plus WebSearch fallback), using queries from the profile. Dedupes against seen jobs + application tracker; presents new matches with quick fit.

Triggers: "Find new jobs", "Scrape for jobs", "Any new positions?", "/scrape". Args: focus area ("/scrape data science"), "broad" (all categories), "health" (portal health only, optionally one portal).

## Step 0: Load State

1. Read `job_scraper/seen_jobs.json` (create as `{"seen": {}}` if missing)
2. Read `job_search_tracker.csv` for applied company+roles
3. Read `search-queries.md` for strategy

## Step 1: Search

Default: top 3 priority categories; "broad": all; focus: that category first. Primary = installed CLIs; fallback = WebSearch for portals without a CLI, failed CLIs, or missing bun.

1a. `bun --version`; on fail use 1c everywhere and note it. 1b. Discover portals via `.agents/skills/*/SKILL.md` (use each portal's documented flags; never guess). Honor `enabled: false` (missing = enabled); record skips. Per portal: translate queries to its flags; scope last 14 days via its recency filter (`--jobage`, `--since`, etc.) or client-side `date` drop (never invent flags; `--order` sort + `--limit` is only an approximation); cap ~20/call; `--format json`; parallel via Agent; tag results by portal; log non-zero exits and continue. 1c. WebSearch with `search-queries.md` site queries for CLI-less/failed/unavailable portals; tag source (portal tag kept when standing in for a failed CLI). Step 4 persists `source`; Step 5 reports fallback portals.

## Step 2: Fetch & Parse

CLI hits carry title/company/location/date/URL; fetch promising ones with the portal's `detail` for requirements/deadline/snippet. `linkedin-search detail` `isActive: false` = "No longer accepting applications" ghost: write to `seen_jobs.json` as `"status": "expired"`, exclude from presentation (absent looks unseen; recorded status self-triages). `isActive: true` is only banner-absence, not proof of open. WebSearch hits: WebFetch posting URL (403 → browser-header curl per `09`); store only resolvable posting URLs (fragment listing-page URLs fail the run — re-search the employer site or drop). Skip URLs already in `seen_jobs.json` (any key), company+title in `seen_jobs.json`, or company+role in tracker.

## Step 2.5: Mass-Posting Detection

≥2 same-company (or same req/ID) results with same description differing only in city/title → one consolidated row noting spread (e.g. "posted identically across 6 cities"). Caution signal only, never an accusation; no fit downgrade or silent exclusion.

## Step 3: Quick Fit Assessment

Triage only (not 04 full): High (core skills), Medium (adjacent), Low (major gaps). Language override first: required-but-undeclared language → Low + named bullets; declared-but-higher-bar → normal score + red-flag bullet quoting posting requirement vs declared level.

## Step 4: Deduplicate & Store

1. Key via `python3 tools/job_key.py --company … --title … --url …` (pure deterministic; `--audit` reports pre-rule keys, never rewrites). 2. Add ALL fetched (new + skipped) to `seen_jobs.json` `{seen: {key: {title, company, url, first_seen, posted_date|null, deadline|null, fit, status: new/skipped/ranked/expired, portal, source: cli/websearch}}}` (portal = producing skill; never backfill missing fields; `/rank` adds `rank_score/rank_verdict/rank_date/location_verdict+language_gate/note/strengths/gaps`, `status: ranked`; legacy `location` verdicts read as verdicts; `deadline`/`posted_date` from detail/CLI date, null = stated-none/portal-none, missing = predates field — never infer/backfill). 3. Present only unseen (URL or company+title) and untracked.

## Step 4.5: Referral Contact Links (High & Medium only)

Per job, two user-browsed LinkedIn people-search links (never fetched/scraped, never fabricated contacts): recruiters/TA (`<Company> recruiter`) and role peers (`<Company> <role keyword from title>`).

## Step 4.75: Portal Health Check

Free pass on this run's Step 1b output (null/empty company/titles, entities/HTML in titles, off-portal URLs; zero-result portals with prior `seen_jobs.json` history suspect). Suspects get one sentinel probe (SKILL.md example query, limit 3, `--format json`), one common-word retry, then **broken**; 429/block = **inconclusive (rate-limited)**, back off. Healthy = silence. Probe-only `/scrape health` skips Steps 1-4: probe every (enabled, or named disabled) portal + one `detail` on each healthy first result; report all.

## Step 5: Present Results

Table sorted by fit (high first) with skipped-disabled / websearch-fallback / per-suspect health lines (healthy silent) + offer to set `enabled: false` on confirmation (only health-check edit allowed); mass-posting/language-level notes in Title cells; per-high highlights (match, requirements, red flags); per-high/med contacts block. Ask "Want me to evaluate any of these in detail? Just give me the number(s)." → picked numbers invoke job-application-assistant (fit first, docs on approval). ~8+ new → suggest `/rank` (`ranked`/`expired` count as seen).

## Step 6: Update Tracker (Optional)

Tracker rows come from job-application-assistant Step 3b — never double-write here. Only for out-of-path applications, add per `/outcome` Step 1 header + match-then-update.

Rules: never fabricate; respect dedup (seen + tracker); configured geography only; open positions only; detail-fetch efficiently; parallel CLIs, WebSearch for gaps; no automated people lookups; bounded honest health checks; flag distribution, never accuse.
