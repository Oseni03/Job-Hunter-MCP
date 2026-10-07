# Extend Profile as CareerProfile with Groq extraction

Profile stays the single per-user source of truth and is extended additively (resume-core plus optional supplements) instead of a separate CareerProfile table, because the matchers, gates, and Prisma mirror-first round-trip already key off one Profile row and a split would fork every tool.

## Considered Options

- Separate CareerProfile table with Profile for preferences: rejected, doubles the write path and joins for no query benefit (matching is in-memory phrase coverage, not SQL).
- Replace Profile wholesale: rejected, breaks all gates/matchers and stored rows.
- Multi-provider file parse (17 providers plus testConnection): rejected, leaks full profile JSON to third parties by default and contradicts the sampling-first privacy posture.

## Consequences

- New resume-core fields (headline, summary, experience with Evidence, education, unified skills, projects, certifications, contact email/phone, preferences) are Json columns on the same Profile row; supplements stay optional and score neutral when absent.
- Extraction is sampling-first with Groq fallback (`llama-3.3-70b-versatile`, JSON mode) plus strict-parse with salvage diagnostics; stored contact keeps full text while EventLog notes stay PII-redacted.
