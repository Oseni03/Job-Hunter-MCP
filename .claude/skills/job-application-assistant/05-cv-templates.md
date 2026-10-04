---
framework_version: 1.4.5
---

# CV Templates and Tailoring Guide

<!-- SETUP: Profile statements and section ordering are personalized by running /setup -->

## Template: LaTeX moderncv (Banking Style)

All CVs use the moderncv LaTeX package with the "banking" style and "blue" color scheme.

**Output file:** `cv/main_<company>_<role>.tex`
**Compile with:** **lualatex** on MiKTeX/TeX Live. pdflatex often fails on modern MiKTeX installs with `fontawesome5` font-expansion errors; lualatex handles the same sources cleanly.
**Master reference:** `cv/main_example.tex` (comprehensive CV with all competencies, experience, and achievements - use as source when building targeted CVs)

### Compile command

```bash
cd cv && lualatex -interaction=nonstopmode main_<company>_<role>.tex
```

Expected output: `Output written on main_<company>_<role>.pdf (2 pages, ...)`. Any page count other than 2 is a failure that must be fixed before presenting to the user.

## Document Structure

```latex
\documentclass[11pt,a4paper,sans]{moderncv}
\moderncvstyle{banking}
\moderncvcolor{blue}

% Force the name and section headings to render in moderncv blue (color1).
\renewcommand*{\namefont}{\fontsize{34}{36}\bfseries\upshape}
\colorlet{firstnamecolor}{color1}
\colorlet{lastnamecolor}{color1}
\colorlet{namecolor}{color1}
\renewcommand*{\sectionstyle}[1]{{\sectionfont\color{color1}#1}}

\usepackage[utf8]{inputenc}
\ifpdftex\usepackage[T1]{fontenc}\fi
\AtEndPreamble{\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    filecolor=magenta,
    urlcolor=blue,
    pdftitle={[YOUR_NAME] - CV},
    pdfpagemode=UseNone,
}}
\usepackage[scale=0.77]{geometry}
\usepackage{import}

% Personal data
\name{[FIRST_NAME]}{[LAST_NAME]}
\address{[YOUR_ADDRESS]}{}{}
\phone[mobile]{[YOUR_PHONE]}
\email{[YOUR_EMAIL]}
\extrainfo{\href{[YOUR_LINKEDIN_URL]}{LinkedIn}, \href{[YOUR_GITHUB_URL]}{GitHub}}

\begin{document}
\makecvtitle

% 1. Profile statement (1-3 sentences, tailored per role)
% 2. Skills section
% 3. Education section
% 4. Professional Experience section
% 5. Selected Publications (if applicable)
% 6. Honors and Awards (if applicable)
% 7. References

\end{document}
```

### Spacing inside itemize lists (important)

**Do not place `\vspace{...}` between `\item` entries in an `itemize` list.** Remove the inter-item `\vspace` and let `itemize` use its native uniform spacing.

Two related patterns are fine and should be kept:
- `\vspace{1pt}` immediately after `\section{...}` (between section heading and first item)
- `\vspace{3pt}` between top-level `\cventry` blocks in Professional Experience or Education

### Section headings must match the CV's language (important)

Section headings such as `\section{Core Competencies}`, `Professional Experience`, `Education`, `Languages`, `Publications`, `Honors and Awards`, `References` (and any others your template defines), plus the `Available upon request.` line under References, are all **literal English text baked into the template** - they do not translate themselves. Whenever the CV language is not English, translate every one of these too. Worked example for Spanish: `Competencias Clave`, `Experiencia Profesional`, `Educaci\'on`, `Idiomas`, `Publicaciones`, `Distinciones y Premios`, `Referencias`, `Disponibles a solicitud.`

## Section-by-Section Tailoring

### Profile Statement / Elevator Pitch (Best Practice)
Write 5-7 lines that function as an "elevator pitch": a concise, compelling introduction explaining why you're qualified for *this specific role*. Focus on what the employer gains from hiring you.

When the role sits outside your home domain, **lead with the domain-transfer argument** in the profile statement's opening, not buried in the cover letter.

Statements labeled *[Used for: <company>_<role>]* were extracted from archived application drafts by `/setup` Path A. They are **phrasing references, never fact sources**: every factual claim still comes from `01-candidate-profile.md`.

### Core Competencies / Skills Section (Best Practice)
Reorder and emphasize based on the role. Use bold category labels. List **5-7 key competencies** in bullet format. Use the posting's own core term in the matching bullet's bold label when it truthfully applies.

### Education
- Always include your highest degrees
- For senior roles, keep education brief (dates and titles only)
- Include thesis topics when relevant to the target role

#### In-progress qualifications must say so explicitly

State completion inside the entry itself (e.g. `In progress, expected <Month Year>.`). A bare year range reads as finished. **Check for agreement:** profile statement, education entry, and any availability note must all give the same completion date.

### Professional Experience
- Rewrite bullet points to emphasize aspects most relevant to the target role
- Use 4-6 bullets for most recent role, 3-4 for previous, 2-3 for older
- **Emphasize measurable results** where possible

#### Check tenure against visible output

A two-year role represented by a single project reads as low output. Honest fixes in order: surface more real work; make phases explicit; name what made the cycle long. **Never** pad with invented projects, and **never** quietly shorten dates. Prepare the interview answer too.

### Handling Employment Gaps (Best Practice)
- Explain matter-of-factly if needed
- Describe continued professional development
- Frame as deliberate skill-building and career repositioning

### Publications
- Include Google Scholar link if applicable
- Select 3-4 most relevant publications
- For non-academic roles, keep brief

### Evidence Links
Wherever the CV names a verifiable artifact, carry its link (`\href`) so a reader can verify the claim in one click.

### Honors and Awards
- Keep format brief, one line each

### References
- List 2-4 references with name, title, company, and contact
- End with: "More references are available upon request."
- **Do not attach reference letters**

### LaTeX Special Characters (important)

| Character | Write | Typical trigger |
|---|---|---|
| `&` | `\&` | company names |
| `%` | `\%` | quantified achievements |
| `$` | `\$` | salary and cost figures |
| `#` | `\#` | "ranked \#1", C\# |
| `_` | `\_` | file names, code identifiers |
| `~` | `\textasciitilde{}` | URLs, tildes |
| `^` | `\textasciicircum{}` | version strings, math |

- **`%` fails silently** (starts a comment, rest of line vanishes from PDF). Check every `%` in every bullet before compiling.
- **`&` fails loudly** inside `\cventry`. Escape employer names up front.
- A bullet whose text begins with a literal `[` must be braced - `\item {[text]}`.

## Compile-and-Inspect Loop (MANDATORY)

1. Run `lualatex -interaction=nonstopmode main_<company>_<role>.tex`
2. Check the output page count: must be exactly 2
3. Read the PDF via the Read tool and visually inspect both pages
4. Check for **orphaned entries**: a `\cventry` title line must never sit alone at the bottom of page 1 with its bullets on page 2

**Fixes:** `\needspace{5\baselineskip}` before the orphaning `\cventry` (never before `\section` headings); `\enlargethispage{2-3\baselineskip}` before a late section for near-miss overflows; cut content for genuine overflow (see relevance-weighted cutting); restore cut content if page 2 ends thin.

## ATS Parseability

Verify the text layer with `node host/job-hunter/workflow/verify-pdf.ts cv/main_<company>_<role>.pdf --dump-text cv/main_<company>_<role>.txt` (Poppler `pdftotext -layout -enc UTF-8` under the hood; install poppler-utils if missing). Check: contact details as literal text; no `(cid:NNN)` or replacement characters; reading order matches visual order; keyword coverage in the posting's language (prefer the posting's exact term where truthful, never add unsupported keywords); accents intact.

### Date fields must be ASCII ranges (confirmed ATS import failure)

1. Write the `\cventry` date argument with a **single hyphen** (`2016-2024`, `Mar 2016 - Jul 2016`), not `--` (which renders as en-dash U+2013 and breaks parser range splitting). Prose ranges keep `--`.
2. Always give a start *and* an end (explicit ranges, months for sub-year roles). Do not invent dates; a lone graduation year is fine but expect manual entry.

`node host/job-hunter/workflow/verify-pdf.ts cv/main_<company>_<role>.pdf --ascii-dates` scans the raw text layer for year-plus-Unicode-dash hits. Cause 2 stays a read-through check.

## Page Budget - Hard 2-Page Limit

| Section | Max budget |
|---------|-----------|
| Profile statement | 3-4 lines |
| Skills | 5 items, each 1-2 lines |
| Most recent role | 4-5 bullets |
| Previous role | 2-3 bullets |
| Older roles | 2 bullets (1 line each) |
| Education | 2-3 entries |
| Publications | 2-3 entries |
| Awards | 3 entries, single line each |
| References | "Available upon request." (single line) |

**If in doubt, cut rather than squeeze.**

## Relevance-weighted cutting (the right way to shrink a CV)

Score each candidate line by relevance to THIS posting, uniqueness, and narrative load (does the cover letter depend on it?). Cut the lowest-total-score line first, regardless of section. Practical order: redundancy, profile fluff, low-relevance experience bullets, low-relevance supporting content, low-relevance publications, last-resort structural cuts. Never cut the cover letter's load-bearing example; prefer `\enlargethispage` for borderline (2.02-page) fits.

## Recommended Section Order

**Technical / data science / ML roles:** Profile, Core competencies, Experience, Education, Languages, Publications & Awards, References.
**Domain-specific / specialist roles:** Profile, Core competencies, Education, Experience, Publications & Awards, References.
