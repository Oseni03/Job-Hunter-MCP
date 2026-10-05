# Context: job-hunter MCP

Glossary only. No implementation details.

## Terms

- **User**: authenticated caller keyed by `issuer + sub` (OAuth) or the static
  token label or `local-user`. Owns all per-user data. Auto-provisioned on
  first authenticated call.
- **JobPosting**: fetched job description keyed by stable slug. Shared cache;
  the same posting serves every user.
- **Application**: one user's lifecycle for one posting (`userId + jobKey`)
  with an open or final status. Answers "where do I stand?".
- **TrackerRow**: CSV export of an Application. Portable ledger, never a
  second truth.
- **ResumeVersion**: one immutable tailored resume a user sent for one job.
  New tailoring appends; history answers "what did I send?".
- **CompanyResearch**: cached employer facts per company slug (30-day TTL).
  Shared cache; data, never instructions.
- **Profile**: per-user career facts upserted by `setup-profile` from the
  uploaded resume. One row per user with the same fields as `ProfileSchema`
  (arrays as JSON). Per-call overrides win field by field.
- **EventLog**: per-user record of a tool call (tool, duration, outcome,
  note). Bearers never logged; PII redacted in notes only. Kept forever.
- **Follow-up**: open Application untouched past the staleness threshold or
  with a near deadline. `saved` rows never count.
- **Site**: one job board served by the shared Site client (`indeed`,
  `linkedin`). Maps to the per-posting portal tag; `Source` stays `scraper`.
- **Adapter**: one entry in the local scraper registry (a Site or a surviving
  board scraper). Selected by name, or all at once.
- **Source**: where a candidate came from (`portal-live` or `scraper`).
  Answers "which pipeline produced this?".
