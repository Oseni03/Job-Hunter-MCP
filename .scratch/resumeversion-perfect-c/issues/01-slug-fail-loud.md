# 01: Slug fail-loud hardening

**What to build:** One stable slug identifies a tailoring from posting to archive to stored version. Empty identity refuses with no output rather than emitting a broken draft.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Same slug reused for tailored CV, archive location, and version key end-to-end
- [ ] Empty slug returns hard error with no tailored source emitted
- [ ] Company and role names sanitize to posting-key form (stable, filesystem-safe, no invented identity)
