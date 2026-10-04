---
name: assisted-apply
version: 1.0.0
description: >
  Use this skill whenever the user wants help filling a job application form,
  applying to a specific posting, or auto-filling a Greenhouse or Lever
  application. Trigger phrases: apply to this job, fill the application,
  fill out the form, submit an application, help me apply.
context: fork
enabled: true
allowed-tools: Bash(node host/job-hunter/apply/cli.ts *)
---

# Assisted Apply Skill

Fills an employer's Greenhouse or Lever application form in a headed browser
and **stops before Submit**. The human reviews the filled form, completes the
manual items (EEO/demographic questions, attestations, anything unmapped),
clicks Submit, then records the application with the `track-application` tool.

## Hard rules

- **Never click Submit.** The filler has no submit path by construction; a
  source-grep test (`tests/assisted-apply.test.ts`) fails the suite if any
  click/press/submit primitive appears in `host/job-hunter/apply/`.
- **Never touch EEO/demographic fields** (gender, race, veteran status,
  disability, voluntary self-ID). They are reported as skipped, always.
- **Only Greenhouse and Lever.** Any other ATS refuses with `unknown-ats`
  instead of guessing at an unfamiliar form.
- Contact details come from explicit flags, never invented: the stored
  profile carries no email/phone, so `--email` and `--phone` are required.

## Commands

### 1. Assemble the apply pack

```bash
node host/job-hunter/apply/cli.ts pack --url <posting> --name "<full name>" --email <email> \
  --phone <phone> --location "<city, country>" --resume <cv.pdf> \
  [--cover <letter.pdf>] [--answers <draft-application-answers.json>] \
  [--field "Question label=Answer"...] [--ats greenhouse|lever] [--out pack.json]
```

`--resume` must be a compiled PDF. `--answers` pulls self-introductions and
pitches out of a `draft-application-answers` plan; `--field` covers anything
else. Omit `--ats` to detect it from the posting URL.

### 2. Fill the form (headed browser, stops before Submit)

```bash
node host/job-hunter/apply/cli.ts fill --pack pack.json
```

Chrome/Edge is driven via `playwright-core` (no browser download); override
with `CHROME_PATH`. The session persists in `.scratch/apply-chrome/`
(gitignored), so logins survive between runs. The field report marks every
field filled / skipped / manual; a screenshot lands in the OS temp dir.

### LinkedIn Easy Apply (explicit opt-in only)

`linkedin.com` URLs never auto-detect — the pack stays `unknown` until you
pass `--ats linkedin`, and filling additionally requires
`--accept-linkedin-risk`:

```bash
node host/job-hunter/apply/cli.ts fill --pack pack.json --ats linkedin --accept-linkedin-risk
```

Why the double gate: driving your authenticated LinkedIn session is against
LinkedIn's Terms of Service and can restrict your account. The adapter steps
the Easy Apply modal (Next/Continue only — the only clicks in the codebase,
fenced by test), skips EEO/demographic groups, and stops at the Review step.
Log in to LinkedIn in the opened browser on first run; expect occasional
CAPTCHA/phone challenges (you're present — solve them yourself). "Apply on
company website" postings have no modal and refuse with `no-easy-apply`;
fill those with the matching adapter instead.

### 3. Human submits, then record

After clicking Submit in the browser: `track-application` with the company,
role, posting URL, and filenames of the submitted CV and letter.

## Verification

```bash
node --test --import ./scripts/alias-loader.mjs tests/assisted-apply.test.ts
```

Fills run headless against `host/job-hunter/apply/fixtures/` pages and assert the submit
trap never fires.
