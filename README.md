# Job Hunter MCP Server

Stateless Next.js MCP server (`mcp-handler` 2 + MCP TypeScript SDK v2) implementing the job-application-assistant + scraper workflows: evaluate, tailor, draft, record, prep, search, rank, and research over Streamable HTTP at `/mcp`.

## Tools (10)

| Tool | Purpose |
|------|---------|
| `analyze-job` | Eligibility + Language gates, 5-dimension weighted score, verdict, `shouldCallEmployer`, `needsConfirmation` |
| `tailor-resume` | Returns `{ tex, filePath: cv/main_<slug>.tex }`, `EMPTY_SLUG` hard error, lualatex / ACTIVE-TEMPLATE |
| `generate-cover-letter` | Returns `{ tex, filePath: cover_letters/cover_<slug>.tex }`, 1-page / 250-300w, xelatex / ACTIVE-TEMPLATE |
| `track-application` | Portable `{ row(drafted), archiveFile, archiveText }`, host appends to `job_search_tracker.csv`, never touches `seen_jobs.json` |
| `prepare-interview` | Stage pack + STAR map + mock, writes only archive + approved STAR + new facts to profile |
| `career-strategy` | Profile-driven direction advice |
| `draft-application-answers` | Portal free-text fields per `08` (counted, grounded, `.txt` with `NOTE TO SELF`) |
| `search-jobs` | Portal live + Site clients (Indeed/LinkedIn) + local scrapers, 14d window, max 20/call, canonical keys, caller-passed dedupe |
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

Copy `.env.example` to `.env.local` and set `MCP_AUTH_TOKEN` (prod bearer).

## Auth (local open / token-only / OAuth)

Three deployment shapes, one precedence point (`verifyMcpAuth` in `lib/oauth.ts`).
Follows the MCP authorization guide: this server is a pure OAuth 2.1 resource
server — it validates bearer access tokens with the off-the-shelf `jose`
library, serves RFC 9728 discovery, and relies on `withMcpAuth` for the
`WWW-Authenticate: Bearer ... resource_metadata="...oauth-protected-resource"`
challenge on every 401. It never mints tokens, never hosts authorize/DCR
endpoints (those live on the authorization server), and never stores tokens or
sessions.

1. **Local open** — neither `MCP_AUTH_TOKEN` nor `OAUTH_ISSUER` set: every request passes.
2. **Token-only** — `MCP_AUTH_TOKEN` set: the bearer must match exactly (byte-for-byte legacy behavior).
3. **OAuth** — `OAUTH_ISSUER` set (plus optional `MCP_AUTH_TOKEN`, which keeps working): a JWT access token verified via `jose` (signature, `iss`, `aud`, `exp`/`nbf` with a 60s leeway). Precedence: exact static-bearer match wins, then JWT, then closed. No server sessions, no stored tokens — stateless; auth never touches `Mcp-Session-Id`.

Env contract (provider-agnostic: Auth0, Clerk, WorkOS, Stytch, Keycloak — any standard OIDC issuer):

| Var | Meaning |
|-----|---------|
| `OAUTH_ISSUER` | Issuer URL, e.g. `https://login.example.com` (trailing slash stripped). Enables OAuth. HTTPS required except loopback dev (`localhost`/`127.0.0.1`). Single issuer pinned — tokens from other realms fail even if signed by the same host. |
| `OAUTH_AUDIENCE` | Expected `aud`, e.g. `https://mcp.example.com/mcp`. Recommended — when unset, `MCP_PUBLIC_URL` is expected instead, so tokens minted for another API never pass. Generic audiences (`api`) must not be used. |
| `OAUTH_JWKS_URI` | Key set URL. Defaults to `<issuer>/.well-known/jwks.json` (OIDC discovery). HTTPS required except loopback. |
| `OAUTH_REQUIRED_SCOPES` | Space-separated scopes that must all be present (default `mcp:tools`). Set to empty string to explicitly opt into validity-only mode. Also enforced at the middleware layer via `withMcpAuth({ requiredScopes })`. |
| `MCP_PUBLIC_URL` | Public MCP endpoint, e.g. `https://mcp.example.com/mcp`. Feeds the RFC 9728 resource identifier, the 401 `resource_metadata` challenge (derived from the request when unset — set it behind proxies), and the audience fallback. |

Worked example (Auth0): create an API with identifier `https://mcp.example.com/mcp`, set `OAUTH_ISSUER=https://<tenant>.auth0.com`, `OAUTH_AUDIENCE=https://mcp.example.com/mcp`, `MCP_PUBLIC_URL=https://mcp.example.com/mcp`. Keycloak-style local dev works the same with `http://localhost:8080/realms/master` (loopback HTTP allowed). Key rotation needs no restart: JWKS refetches every 5 minutes (`JWKS_CACHE_TTL_MS`), plus one forced refetch on an unknown `kid`. Mint short-lived access tokens at the AS (5–15 min recommended); the server enforces `exp` and caches only JWKS keys, never tokens.

Claude's remote connector mapping: option 2 (register automatically / DCR) is correct against the issuer; option 3 works with a client registered in the same issuer (audience = the MCP resource identifier); option 1 (Claude's published identity) is unsupported — this server only trusts tokens from the configured issuer. If the AS gates DCR, vet registrations and pin trusted hosts there; this server has nothing to configure for DCR beyond advertising its issuer and scopes.

Scope decision: least-privilege by default. Every OAuth token must carry `mcp:tools` (override with `OAUTH_REQUIRED_SCOPES`); static-bearer and local-open paths are unchanged. The PRM advertises `scopes_supported: ["mcp:tools"]` and `resource_name`.

Security posture: no custom token crypto (all signature/claim checks via `jose`); credentials are never logged and 401s carry only the generic challenge (specific `error` codes stay server-side for logs, never serialized); no client secret lives on this server (JWT-only — nothing to reuse across app vs. user flows, all configuration via env, never source); error detail never leaks to clients.

Rotate the bearer without downtime: set the new token alongside OAuth (both accepted), roll clients over, then unset the old token. JWKS outages fail closed (401, never open).

Curl matrix (against a deployment with `MCP_AUTH_TOKEN=secret`, `OAUTH_ISSUER` set, `MCP_PUBLIC_URL=https://mcp.example.com/job-hunter/mcp`). Each MCP lives at its own explicit path (`/job-hunter/mcp` today; later servers get their own the same way):

```sh
BASE=https://mcp.example.com
curl -s -o /dev/null -w "%{http_code}\n" $BASE/.well-known/oauth-protected-resource  # 200: {resource, authorization_servers}
curl -s -D - -o /dev/null -X POST $BASE/job-hunter/mcp                                            # 401 + WWW-Authenticate: Bearer ... resource_metadata="...oauth-protected-resource"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer secret" $BASE/job-hunter/mcp            # 200 (static bearer)
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer wrong" $BASE/job-hunter/mcp             # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $JWT" $BASE/job-hunter/mcp               # 200 (valid JWT) / 401 (wrong iss/aud/expired)
```

## Protocol support

- Native MCP `2026-07-28`, Streamable HTTP compat for 2025 clients.
- Deprecated HTTP+SSE not supported. No Redis. Stateless: dedupe via caller-passed `seenKeys[]`, writes host-side.

## Notes for running on Vercel

- Node 20+, Fluid compute enabled.
- Set `MCP_AUTH_TOKEN` in project env.
- Phase B (KV/Postgres/Blob store) deferred; record payload is already portable. OAuth resource-server auth ships (see Auth above).

## Tickets

See `.scratch/job-hunter-mcp/issues/01-11.md` (11 tickets, `07` integrates).
