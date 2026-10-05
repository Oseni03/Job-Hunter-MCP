# 03: Honest errors, country, and strict isolation

**What to build:** An end-to-end search behavior where every Site outcome is reported honestly so a dead or partial board never reads as "no jobs found" and never discards the healthy Site's jobs.

**Blocked by:** 02-linkedin-cutover-filter-parity.

**Status:** ready-for-agent

- [ ] Full and genuinely empty Site runs note honestly, while interrupted or failed Site runs error with the board's reason, dropped filters are noted rather than silent, and invalid input errors with zero invented postings
- [ ] The Indeed country derives from the active profile with a safe fallback, failure isolation keeps the healthy Site's candidates when the other Site fails, and dedupe stays caller-owned
