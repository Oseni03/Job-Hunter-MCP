# 02: Persist ResumeVersion tex markdown verification

**What to build:** Tailoring appends an immutable stored version so history answers what was sent and any version recompiles to the same source.

**Blocked by:** 01-slug-fail-loud

**Status:** done (record builder + graceful save/fetch, type-check clean, 5/5 node:test green)

- [ ] New tailoring appends a new immutable ResumeVersion for the user and posting, never overwrites
- [ ] Stored version holds recompilable source plus review text plus verification payload (Profile stays the single source of truth)
- [ ] Every factual claim traces to Profile Evidence with zero invented metrics, skills, or employers
- [ ] Re-fetch by user and posting returns the stored source byte-identical
