# 21: Prep input safety (slug, TeX inputs, tag matching, stage names, pack path)

**What to build:** Make `prep-interview` distrust its inputs the way the drafting tools do. Five input-handling fixes in `lib/prep.ts`, all small. (Proposed as 20, but `20-record-tracker-safety.md` exists — hence 21. Stage aliases ride here too: name normalization is input handling, same family as slug handling.)

**Blocked by:** 04-prep-strategy-form-fields.

**Status:** ready-for-agent

- [ ] Empty-slug hard error: every drafting tool refuses on `EMPTY_SLUG`, but `planInterviewPrep` builds `documents/applications//<stage>-prep.md` from an empty slug without complaint (`lib/prep.ts:207-208`). Add the same hard error when neither company nor role identifies the interview.
- [ ] TeX-aware probeable claims: `cvText`/`coverText` are usually the generated `.tex`, so the probeable pass (`lib/prep.ts:291-309`) splits `\cventry{…}` markup lines and flags them for digits and skill words alike. Strip TeX commands (reuse the command-stripping shape from `countTexWords` in `lib/verify.ts`) before line-splitting — or accept plain text only and say so. Fixture: run the pass over a real generated CV and assert no emitted claim contains markup.
- [ ] Real STAR coverage: `tagWords` keeps every 3+ character token with no stopwords (`lib/prep.ts:172-180`), so "and", "the", "for" inside a `useFor` tag count as coverage and the uncovered list lies. Add the shared stopword list (coordinate with issue 12's matching work — one list, both consumers) or require whole-tag matches; fixture with filler-heavy tags asserting genuinely uncovered questions surface.
- [ ] Stage aliases: "phone screen", "HR round", "system design", "final round" all fall into `other` today (`normalizeStage`, `lib/prep.ts:135-145`). Map the common aliases onto the five banks (documented table, first-match with a fallback note on ambiguity) so packs stop going generic on ordinary stage names.
- [ ] Pack-path fixture: `packFile` embeds posting-derived slug text like the record archive path — mirror the issue-20 path-safety fixture (`../` company name, charset assertion) for the prep pack path.
