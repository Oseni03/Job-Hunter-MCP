---
framework_version: 1.0.0
---

# Application Form Fields

`/apply` produces two artifacts: a CV and a cover letter. Many applications need a **third** — free-text fields typed directly into an application portal. This file governs that third artifact. It is text the candidate pastes, not a document you compile.

## When this applies

- A self-introduction / personal statement / "tell us about yourself" paragraph
- Structured project entries (project name, role, start and end date, description)
- A short pitch under a hard character limit
- Motivation questions ("why this company", "why this program")
- Competency questions with a word cap ("describe a time you…", 200 words)

## The rule that governs everything here

**Every claim must already be defensible from the union of `01-candidate-profile.md`, the master CV (`cv/main_example.tex`), and `CLAUDE.md`'s Candidate Profile section**, grounded if ANY of the three supports it. Select from what is already true; never introduce new claims. All accuracy rules from `05-cv-templates.md` and `03-writing-style.md` apply unchanged.

## Field type: self-introduction paragraph

Usually 100–200 words, one paragraph, no formatting. Structure: current status; single strongest evidence with number and scale; trajectory line if a pivot is genuinely interesting; what they want next tied to this employer's work. Lead with strongest evidence; one version per role type; tie to this employer in the final sentence; count words, supply a trimmed variant naming the first sentence to cut.

## Field type: structured project entries

**Project name:** descriptive project name, not employer name. **Role:** candidate's role on that project, never upgraded. **Dates:** dates on that project, never invented. **Description:** 100–150 words (system and users, hardest problem and solution, outcome with number) plus a ~60-word short version. Scope discipline is stricter than a CV: contributory work must say so.

## Field type: hard character limits

A specific situation beats adjectives. Pick the most distinctive true thing, draft 4–6 candidates at different angles, **count characters programmatically**, present all with counts plus recommendation, preferring the version mapping the candidate's problem onto the employer's problem.

## Output format

One plain `.txt` per employer with every requested field: header naming employer and roles; each field labelled with word/character counts; short variants; **`NOTE TO SELF` blocks** (never for pasting) for scope reminders and invited-question prep; dates quick-reference.

## Verification before handing it over

- [ ] Every claim traces to the `01` + master CV + `CLAUDE.md` union
- [ ] No contradiction with the CV/cover letter for the same role
- [ ] Ownership scoped on contributory work; counts measured; in-progress stated as in progress; internal blocks clearly marked
