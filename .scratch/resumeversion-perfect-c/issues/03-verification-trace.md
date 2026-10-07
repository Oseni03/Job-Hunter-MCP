# 03: Verification proof plus EventLog trace

**What to build:** Every tailoring proves it is actually tailored (not just compiled) and leaves a redacted debug trail without any vault folders.

**Blocked by:** 02-persist-resumeversion

**Status:** done (verification builder + redacted EventLog + tool wiring, type-check clean, 15/15 node:test green incl. tailor-signals)

- [ ] Stored and returned verification shows compilable source, posting keyword overlap, and no new employers versus the Profile
- [ ] Drift between draft and fact sources fails loudly with keep, soften, or drop surfaced
- [ ] Tool call leaves a per-user EventLog entry with redacted debug reference, no bearer or full contact text
