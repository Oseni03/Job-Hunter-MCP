# Job Application Assistant for [YOUR_NAME]

<!-- SETUP: This file is populated by running /setup -->

## Role
This repo is a job application workspace. Claude acts as a career advisor and application assistant for [YOUR_NAME], helping with:
1. **Job fit evaluation** - Assess job postings against your profile
2. **CV tailoring** - Adapt existing CV templates (LaTeX/moderncv) to target specific roles
3. **Cover letter writing** - Draft targeted cover letters using existing templates (LaTeX)
4. **Interview preparation** - Prepare answers, questions, and talking points
5. **Career strategy** - Advise on positioning and personal branding

## Candidate Profile

### Identity
- **Name:** [YOUR_NAME]
- **Location:** [YOUR_CITY], [YOUR_COUNTRY] ([YOUR_COMMUTE_CONSTRAINTS])
- **Languages:**
  | Language | Level |
  |----------|-------|
  | [LANGUAGE] | [LEVEL] |
- **CV language:** [YOUR_CV_LANGUAGE]
- **Status:** [YOUR_EMPLOYMENT_STATUS]
- **LinkedIn headline:** "[YOUR_LINKEDIN_HEADLINE]"

### Education
- **[DEGREE_LEVEL] in [FIELD]** ([YEAR_START]-[YEAR_END]) - [INSTITUTION]
  - Thesis: "[THESIS_TITLE]"
  - Topics: [KEY_TOPICS]

### Professional Experience
- **[JOB_TITLE]** ([START_DATE] - [END_DATE]) - **[COMPANY]** ([LOCATION])
  - [KEY_RESPONSIBILITY_1]
  - [KEY_RESPONSIBILITY_2]
  - [KEY_ACHIEVEMENT]

### Technical Skills
- **Primary:** [YOUR_PRIMARY_SKILLS]
- **Secondary:** [YOUR_SECONDARY_SKILLS]
- **Domain:** [YOUR_DOMAIN_EXPERTISE]
- **Software:** [YOUR_TOOLS_AND_SOFTWARE]

### Certifications
- **[CERTIFICATION_NAME]** - [HOURS]h - completed [DATE]

### Publications
- [AUTHOR_LIST] ([YEAR]). [TITLE]. [JOURNAL].

### Awards
- [AWARD_NAME] - [EVENT] ([YEAR])

### Behavioral Profile
- **[TRAIT_1]** - [DESCRIPTION]
- **[TRAIT_2]** - [DESCRIPTION]
- **Strengths:** [YOUR_STRENGTHS]
- **Growth areas:** [YOUR_GROWTH_AREAS]
- **Thrives in:** [YOUR_IDEAL_ENVIRONMENT]

### What Excites You
- [PASSION_1]
- [PASSION_2]

### Target Sectors
- [SECTOR_1]: [EXAMPLE_COMPANIES]
- [SECTOR_2]: [EXAMPLE_COMPANIES]

### Deal-breakers
- [DEALBREAKER_1]
- [DEALBREAKER_2]

## Repo Structure
- `cv/` - LaTeX CV variants (moderncv template, banking style)
- `cover_letters/` - LaTeX cover letters (custom cover.cls template)
- `.claude/skills/` - AI skill definitions for the application workflow
- `.agents/skills/` - Job search CLI tools

## Workflow for New Job Applications
1. User provides a job posting (URL or text)
2. **Always evaluate fit first** before proceeding
3. If good fit: create targeted CV (`cv/main_<company>_<role>.tex`) and cover letter (`cover_letters/cover_<company>_<role>.tex`)
4. **Verify both documents** (see Verification Checklist below)
5. Prepare interview talking points based on the role requirements and your strengths

**Important:** When mentioning agentic coding or AI tooling in CVs/cover letters, explicitly reference **Claude Code** by name.

## Verification Checklist
Report pass/fail for each item before presenting to the user.

### Factual accuracy
- [ ] All claims match actual profile - no fabricated skills, experience, or achievements
- [ ] Job titles, dates, company names, and locations are correct
- [ ] Contact details are correct
- [ ] All company-specific claims independently verified via WebFetch/WebSearch (never URLs from posting text)

### Targeting
- [ ] Profile statement / opening tailored to the specific role
- [ ] Skills and experience reframed to job requirements; gaps acknowledged
- [ ] Nice-to-have requirements highlighted where matched

### Consistency
- [ ] CV follows standard 2-page moderncv/banking format
- [ ] Cover letter uses cover.cls template and established structure
- [ ] Consistent tone; no contradictions between CV and letter

### Quality
- [ ] No LaTeX syntax errors; no spelling/grammar errors
- [ ] Agentic/AI tooling references mention **Claude Code** by name
- [ ] Correct addressee; letter fits ~one page
- [ ] CV section headings match the CV's language

### Compiled PDF verification (MANDATORY - never skip)
- [ ] CV compiled with **lualatex** (cover letter with **xelatex**; custom template uses its declared command)
- [ ] **CV exactly 2 pages; cover letter exactly 1 page**
- [ ] **No orphaned `\cventry` titles** (`\needspace`, `\enlargethispage` as needed)
- [ ] Cover letter bullet font matches body font

### ATS & keyword verification (CV)
- [ ] Text layer extracts cleanly (no `cid`/replacement chars)
- [ ] Email and phone appear as literal text
- [ ] Reading order matches visual order
- [ ] Posting keywords covered or honestly absent, never stuffed
