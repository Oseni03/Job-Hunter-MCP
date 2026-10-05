# 05: CLI, skill docs, glossary, and verification

**What to build:** A host-visible search surface where the command line, skill guide, and glossary all describe the Site-backed behavior truthfully and the whole verification suite passes.

**Blocked by:** 04-board-path-contract-removal.

**Status:** ready-for-agent

- [ ] Host search keeps stable location, query, age, workplace, limit, and format flags plus a country passthrough, source filtering spans Sites and surviving Adapters, full detail fetch is retained, and legacy-only caching never fronts Site results
- [ ] Skill guide, portal table, and glossary define Site versus Adapter versus Source versus portal tag consistently, the scraper replacement decision is recorded, and typecheck, lint, focused suites, full suite, and golden checks are all green
