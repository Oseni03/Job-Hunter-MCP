# 13 spike: structured board sources (recorded 2026-10-01)

## Probes from this environment
- `GET api.lever.co/v0/postings/lever` → 200, valid JSON envelope (org has no
  live postings; endpoint answers without a key). Lever: CONFIRMED live, no key.
- `GET boards-api.greenhouse.io/v1/boards/{stripe,airbnb}/jobs` → transport
  error from this sandbox (egress blocked or filtered). Docs confirm no-key
  GETs; treat as docs-confirmed, not live-confirmed.
- `GET api.ashbyhq.com/posting-api/job-board/openai` → transport error, same
  sandbox limitation. Docs confirm no-key GETs; docs-confirmed only.

## Winner: Greenhouse (primary board source)
- `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`
  — no auth for GET (only the apply POST needs a key).
- Real fields: `title`, `absolute_url`, `company_name` (reliably present —
  the only provider of the three that returns one), `location.name`,
  `departments[]`, `offices[]`, `content` (full HTML description),
  `first_published` / `updated_at` (ISO datetimes).
- Quirk: `content` arrives double entity-encoded (`&lt;h2&gt;` as literal
  text) — decode entities twice before stripping HTML.
- No keyword search, no board directory: one call lists one company's open
  jobs. Caller supplies `{provider, slug, company}` refs.

## Second: Lever
- `GET https://api.lever.co/v0/postings/{org}?mode=json` — no auth.
- Real fields: `text` (title), `hostedUrl`, `descriptionPlain` /
  `descriptionBodyPlain`, `categories.{location,commitment,team,department}`,
  `createdAt` (epoch millis), `salaryRange?`. No company field in the payload
  — caller-supplied board label is the company. No keyword search, no
  directory. Accepts `skip/limit/team/location/commitment` params.

## Third: Ashby
- `GET https://api.ashbyhq.com/posting-api/job-board/{BOARD}?includeCompensation=true`
  — no auth for the public posting API.
- Real fields: `title`, `jobUrl`, `descriptionPlain` (+ `descriptionHtml`),
  `publishedAt`, `location`, `employmentType`, `isRemote`/`workplaceType`.
  No company field — caller-supplied label. No keyword search.

## Backups (unchanged)
- Adzuna: keyed API, needs `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` — stays a backup,
  never primary (key requirement + ToS).
- RemoteOK: `https://remoteok.com/api` JSON, no key, returns all postings —
  client-side keyword filter. Backup for broad discovery.
- BrightData + DuckDuckGo/LinkedIn-guest scrapers: demoted to fallback behind
  boards, keeping the people-search guard and the never-invent-postings rule.

## Consequence for planSearch
- Board refs are caller-supplied (no directory exists to discover slugs).
- Board listings fetch once per run, then the active query set filters them
  client-side; `queriesRun` reports the coverage actually bought.
- Board candidates always carry real companies — the "Unknown company"
  placeholder is retired on the board path; remaining unknowns on scraper
  paths are flagged `needsVerification` for the host.
