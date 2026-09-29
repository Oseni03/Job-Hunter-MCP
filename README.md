# Job Hunter MCP Server

Stateless Next.js MCP server (`mcp-handler` 2 + MCP TypeScript SDK v2) implementing the job-application-assistant + scraper workflows: evaluate, tailor, draft, record, prep, search, rank, and research over Streamable HTTP at `/mcp`.

## Tools (10)

| Tool | Purpose |
|------|---------|
| `evaluate-job` | Eligibility + Language gates, 5-dimension weighted score, verdict, `shouldCallEmployer`, `needsConfirmation` |
| `tailor-cv` | Returns `{ tex, filePath: cv/main_<slug>.tex }`, `EMPTY_SLUG` hard error, lualatex / ACTIVE-TEMPLATE |
| `write-cover-letter` | Returns `{ tex, filePath: cover_letters/cover_<slug>.tex }`, 1-page / 250-300w, xelatex / ACTIVE-TEMPLATE |
| `record-application` | Portable `{ row(drafted), archiveFile, archiveText }`, host appends to `job_search_tracker.csv`, never touches `seen_jobs.json` |
| `prep-interview` | Stage pack + STAR map + mock, writes only archive + approved STAR + new facts to profile |
| `career-strategy` | Profile-driven direction advice |
| `draft-application-answers` | Portal free-text fields per `08` (counted, grounded, `.txt` with `NOTE TO SELF`) |
| `search-jobs` | LinkedIn live + BrightData (`BRIGHTDATA_API_KEY` optional, WebSearch fallback), 14d window, max 20/call, canonical keys, caller-passed dedupe |
| `rank-jobs` | Batch triage: weights/vetoes/urgency/sweep/staleness, additive-only state writes |
| `research-company` | Cache-first (`company_research/<slug>.json`, 30d TTL), verified claims only |

Hybrid side-effects: server returns text + paths; host owns file writes and LaTeX compiles (`lualatex` CV exactly 2 pages, `xelatex` letter exactly 1 page) plus `verify_pdf.py` / `verify_layout.py`.

## Resources

`candidate://profile`, `behavioral://profile`, `style://writing`, `framework://evaluation`, `template://cv-master`, `template://cover-example`, `queries://search-queries`, `research://company/{slug}`, `jobs://seen-keys`, CV variant listing/fetch. Private defaults versioned; per-call override wins.

## Prompts

`apply`, `rank`, `interview`, `scrape-health`, `tailor-flow` — step checklists mirroring the manual workflows.

## Usage

```sh
pnpm dev
# connect a client to http://localhost:3000/mcp
pnpm test:client -- http://localhost:3000/mcp
```

Copy `.env.example` to `.env.local` and set `MCP_AUTH_TOKEN` (prod bearer) and optional `BRIGHTDATA_API_KEY`.

## Protocol support

- Native MCP `2026-07-28`, Streamable HTTP compat for 2025 clients.
- Deprecated HTTP+SSE not supported. No Redis. Stateless: dedupe via caller-passed `seenKeys[]`, writes host-side.

## Notes for running on Vercel

- Node 20+, Fluid compute enabled.
- Set `MCP_AUTH_TOKEN` (+ optional `BRIGHTDATA_API_KEY`) in project env.
- Phase B (KV/Postgres/Blob store, OAuth) deferred; record payload is already portable.

## Tickets

See `.scratch/job-hunter-mcp/issues/01-11.md` (11 tickets, `07` integrates).
