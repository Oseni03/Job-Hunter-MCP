# 03: Record application

**What to build:** One recording tool that turns two finished documents plus posting metadata into a tracker row and a verbatim posting archive, with the same match-then-update guarantees as the manual workflow.

**Blocked by:** 02-tailor-cv-cover-letter.

**Status:** ready-for-agent

- [ ] Creates the tracker with the standard header ending in deadline when missing, and appends the deadline column to a legacy header without touching data rows
- [ ] Matches existing rows case-insensitively on company and role, appending on no match or when every match is final, otherwise updating the open row without moving status backwards and refreshing only files, score, source, and deadline
- [ ] New rows carry today, drafted status, bare numeric fit score, both file paths, posting URL or empty for pasted text, channel derived from origin, and deadline as YYYY-MM-DD or empty, never guessed
- [ ] Updating an open row appends an undated redrafted marker to notes, leaves a stored deadline alone when the run extracted none, and moves date forward only while still drafted
- [ ] Never restructures the tracker, reorders rows, touches other rows, or modifies the seen-jobs dedup store
- [ ] Archives the held posting text verbatim under the application folder for the final company and role, leaving an existing archive in place and writing nothing with an explicit report when the text is no longer held
