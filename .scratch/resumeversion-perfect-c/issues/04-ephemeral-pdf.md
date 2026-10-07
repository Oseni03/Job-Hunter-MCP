# 04: Ephemeral PDF recompile cache

**What to build:** Any stored version recompiles to a PDF on demand without ever storing PDF bytes in the database.

**Blocked by:** 02-persist-resumeversion

**Status:** ready-for-agent

- [ ] Request by version recompiles the stored source to PDF and caches it under generated keyed by version
- [ ] No PDF bytes stored in the database; source remains the single truth for recompile
- [ ] Empty source or failed compile fails loudly with no PDF emitted, no Obsidian dependency
