# 02: Tailor CV + cover letter

**What to build:** Two document tools that turn a posting plus profile into submittable LaTeX sources with correct filenames, enforcing the writing bans and template contracts end to end.

**Blocked by:** 01-foundation-evaluate-job.

**Status:** done (commit bbb0748; tsc clean, 135/135 node:test green, live HTTP verified incl. EMPTY_SLUG probe)

- [ ] Both tools derive the same `<company>_<role>` slug once and reuse it for CV, letter, and archive path, returning hard error with no TeX when the slug is empty
- [ ] CV tailors profile statement (domain-transfer lead when changing fields), 5-7 competencies using the posting's own core terms as bold labels where truthful, relevance-ordered experience bullets with measurable outcomes, and correct section order per role type
- [ ] Cover letter is forward-looking task-solving (250-300 words, opening plus bullets plus company connection plus fit plus close), motivated by verified company specifics, salutation and language matched to the posting
- [ ] Every requirement in the posting is matched or honestly bridged, nice-to-haves engaged by name, logistics and reference ID addressed, and stretch reframing surfaced to the user with keep/soften/drop choice
- [ ] All factual claims audit against the union of candidate profile, master CV, and workspace profile before writing, with zero drift and profile-consistency warnings kept distinct from draft drift
- [ ] Output honors writing bans (no em-dashes, no cliches, no unverified company claims, no apologetic hedging, active first-person voice) and LaTeX safety (escaping, bracket bracing, ASCII date ranges, translated headings, in-progress stated with agreed dates)
- [ ] Active custom template override (source extension, compile command, page limit, style rules) wins over stock guidance when present
