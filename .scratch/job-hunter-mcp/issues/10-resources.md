# 10: Full resource catalog

**What to build:** A complete read-only resource layer exposing profiles, rules, templates, queries, research, and state pointers so tools and clients share one source of truth.

**Blocked by:** 06-resources-overrides-verify.

**Status:** done (commit 6a61ed2 + b2b49e2 fix; tsc clean, 277/277 node:test green, eslint clean, golden 26 pass)

- [ ] Exposes candidate profile, behavioral profile, writing rules, evaluation framework, CV master reference, cover example, and search-query strategy as versioned resources with private server defaults
- [ ] Exposes per-company research entries and base CV variant listing plus single-variant fetch, with caller-supplied content fallback so generation never depends on server disk
- [ ] Exposes seen-keys pointer and tracker pointer as identifiers and counts only, never full backlog contents, preserving the state-through-tool invariant
- [ ] Marks template and framework versions on every resource and honors per-call override winning over embedded defaults
- [ ] Lists all resources from the client with stable URIs and verifies stale or missing entries degrade to explicit messages rather than guesses
