# /interview - Prepare for an Interview on a Tracked Application

Preps for a real, scheduled interview on a tracked application. Wires `07-interview-prep.md` + `04` research checklist + `/outcome` stage history. `/apply` optimizes what they read; `/interview` optimizes what they hear; consistency bridges them (interviewer read the submitted docs).

## Step 0: Parse Input

`$ARGUMENTS` = company [role]. With arg: case-insensitive tracker match (company, then role); one → proceed; several → list + ask; none → suggest `/outcome <company>` or accept pasted posting + role. Without arg: list live-process rows (`interview`/`offer`/recent `applied` per `/outcome` vocabulary; `drafted` never qualifies) + ask; empty tracker → ask for company/role/posting. Specific-application only; no generic practice (prep against a real tracked app instead).

## Step 1: Load the Application Context

1. Archive via `documents/README.md` Subfolder naming → `documents/applications/<company>_<role>/`: `job_posting.md`, `cv_draft.html` + `cover_letter.html` (what the interviewer read — all talking points must match), `outcome.md` (stage + prior feedback = top input for next stage).
2. Fallbacks (pre-`/outcome` apps): posting via tracker `source` WebFetch or pasted text; CV/letter via `cv/main_<company>_<role>.*` + `cover_letters/cover_<company>_<role>.*` (never company-only globs); state gaps plainly, suggest `/outcome` for next time.
3. Ask what's missing from `outcome.md`: stage, date, format, interviewer names/titles.
4. Read once: `07`, `01`, `02`, `04` (no re-reads later).

## Step 2: Research the Company (Interview-Focused)

Cache-first (`company_research/<slug>.json` per 04; reuse within TTL, verification still required), else full checklist (site, reviews, LinkedIn team signals, media) then write/overwrite cache. Add interviewer angle (public professional info only; role → likely probe) + 2-3 verifiable conversation hooks. Verify every pack claim via fetch (403 → browser headers per 09; snippets are leads); unverified confident interview claims are worse than none.

## Step 3: Build the Prep Pack

1. Likely questions from feedback first, then fit-evaluation gaps (honest "You don't have [X]" bridges per 07, never invented), then posting requirements, then stage type.
2. STAR mapping via `07` Use-for tags; new STAR drafted strictly from `01` facts (offer to append to `07` only on explicit approval); surface incomplete relevant STAR stubs.
3. Consistency brief (paper claims likeliest probed; nothing in-room beyond paper, everything on paper defensible in depth).
4. Customized tough questions (company-specific "why us" from verified hooks).
5. 4-6 stage-customized questions to ask (cut publicly-answered ones).
6. Logistics (07 phone/video tips + date/interviewers header).
Save to `interview_prep_<stage>.md` in the archive (gitignored; one file per stage) + present in chat.

## Step 4: Offer a Mock Interview

On yes, roleplay in-conversation per 07 exactly (warm-up → technical → 1-2 behavioral → tough/curveball; brief per-answer feedback + better STAR pointer), coached toward the `02` natural register.

## Step 5: Close the Loop

"Good luck. After the interview, run `/outcome <company>`..." + re-offer deferred STAR appends.

Rules: consistency with submitted docs; honest bridge answers; verified research + public-only interviewer notes; stage-appropriate packs; writes to archive only — except user-approved STAR appends to `07` and new facts to `01` (prep-surfaced metrics/corrections belong in the profile, or later drafting strips them as fabrication).
