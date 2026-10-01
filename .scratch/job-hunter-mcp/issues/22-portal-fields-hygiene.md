# 22: Portal-fields hygiene (paste boundary, pitch honesty, silent drops, budgets, dates)

**What to build:** Five small portal-fields fixes in `lib/fields.ts`, one short issue. (Numbering note: 20 is record-tracker safety and 21 is prep-input safety, so neither suggested home fits — hence a short 22 keeping one tool per issue.) A sixth checkbox covers the fixed-path ephemerality in the tool description.

**Blocked by:** 04-prep-strategy-form-fields.

**Status:** done (commit: feat issue-22; full suite 450/450 green, golden 26 pass)

- [ ] Paste boundary by construction: the "internal — do not paste" scope notes ship inside `copyPasteText` under a heading convention (`renderCopyPaste`, `lib/fields.ts:373-374`), so one select-all pastes them into an employer's form. Return internal notes in a separate structured field (already present as `scopeNotes` — stop rendering it into the copy text), or a file section the host never renders as copy text. The safe path must be the default, not a heading the user has to notice.
- [ ] Pitch honesty: combinatorial candidates (`lib/fields.ts:244-259`: `"Python for fintech."`) pass the word-audit but read as keyword stubs, and the list pads toward six. Mark pitches as expansion seeds in the render (one line: expand before sending), or cap the count at what the facts support instead of the template maximum; the under-4 warning already points this way — extend its logic, don't just warn beside stubs.
- [ ] Audible role-type drop: unknown `roleTypes` are filtered silently (`lib/fields.ts:174-177`) with a silent fallback to both defaults — the only absence in the file without a note. Name the dropped values in a note, matching the tool's own explicit-fallback discipline everywhere else.
- [ ] Short-budget overshoot: `buildShort` always keeps the first sentence even over 60 words (`lib/fields.ts:127-131`), with no note and no field-limit statement. Add an overshoot note when the short exceeds budget, and state whether the receiving field limit is a hard cap (truncate with marker) or a soft target (warn only).
- [ ] Validated project dates: `datesReference` collects raw strings (`lib/fields.ts:287-297`), so a typo or mixed format becomes the "one consistent vocabulary." Validate against a few accepted formats (same ASCII-range discipline as the CV dates) and warn on the rest instead of enshrining them.
- [ ] Ephemerality in the tool description: the fixed `documents/portal-fields.md` path overwrites per use — add the ephemeral treatment (copy-paste scratch, never a record; never cite it as an application record) to the tool description itself, so models don't point to it later as history.
