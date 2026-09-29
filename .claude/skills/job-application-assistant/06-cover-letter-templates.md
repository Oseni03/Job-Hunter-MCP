---
framework_version: 1.0.2
---

# Cover Letter Templates and Tailoring Guide

## Template: Custom cover.cls (XeLaTeX)

Cover letters use a custom LaTeX document class (`cover.cls`) with Lato/Raleway fonts.

**Output file:** `cover_letters/cover_<company>_<role>.tex`
**Compile with:** XeLaTeX (cover.cls requires fontspec)
**Font directory:** `cover_letters/OpenFonts/fonts/`

### Compile command

```bash
cd cover_letters && xelatex -interaction=nonstopmode cover_<company>_<role>.tex
```

Expected output: `Output written on cover_<company>_<role>.pdf (1 page, ...)`. Any page count other than 1 is a failure that must be fixed before presenting to the user.

## Compile-and-Inspect Loop (MANDATORY)

1. Run `xelatex -interaction=nonstopmode cover_<company>_<role>.tex`
2. Confirm page count is exactly 1 and compile succeeded
3. Read the PDF via the Read tool and visually check: signature fits at the bottom, no text cut off, bullet font matches body

### Known template pitfall: itemize inside `\lettercontent{}`

The `\lettercontent{}` macro appends `\\` to its argument. This breaks when the argument ends in `\end{itemize}` (`! LaTeX Error: There's no line here to end.`).

**Correct:** close `\lettercontent{}` before the list and wrap the list in the matching Raleway-Medium font:

```latex
\lettercontent{Here is how my experience maps:}

{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont
\begin{itemize}
    \item ...
\end{itemize}\par}
\vspace{6pt}

\lettercontent{[next paragraph]}
```

## Document Structure

```latex
\documentclass[]{cover}
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\rfoot{Page \thepage \hspace{0pt}}
\thispagestyle{empty}
\renewcommand{\headrulewidth}{0pt}
\begin{document}
\namesection{}{\Huge{[YOUR_NAME]}}{  \href{mailto:[YOUR_EMAIL]}{[YOUR_EMAIL]} | [YOUR_PHONE] |  \urlstyle{same}\href{[YOUR_LINKEDIN_URL]}{LinkedIn}
}
\currentdate{\today}
\lettercontent{Dear [Name/Team],}
\lettercontent{[Opening paragraph - role, connection to background, 2-3 sentences]}
\lettercontent{[Body paragraph - most relevant experience, introducing the bullet list]}
{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont
\begin{itemize}
    \item {[Concrete achievement/skill 1]}
    \item {[Concrete achievement/skill 2]}
    \item {[Concrete achievement/skill 3]}
\end{itemize}\par}
\lettercontent{[Connection to company - why this role, why this company specifically]}
\lettercontent{[Personal fit paragraph - behavioral strengths, team contribution, 2-3 sentences]}
\lettercontent{I look forward to hearing from you.}
\begin{flushright}
\closing{Kind regards,}
\signature{[YOUR_NAME]}
\end{flushright}
\end{document}
```

Note: no trailing `\\` inside `\closing{}` - cover.cls appends its own.

## Tailoring Guidelines

### Salutation
- Named hiring manager if known; team if known; generic "Dear [Company]," (avoid "To whom it may concern")

### Length - Hard 1-Page Limit
- 250-300 words of body text (350 overflows). Opening + bullets + closing = 3 blocks; add a 4th only if others are short. Trim to compensate when adding company content.

### Bullet Lists
- `\begin{itemize}...\end{itemize}` **outside** `\lettercontent{}`, wrapped in the Raleway-Medium `\fontspec` block; 3-5 bullets; bold label or action-verb leads; brace leading-`[` bullets (`\item {[text]}`).

### LaTeX Special Characters
Escape `\&`, `\%` (silent-eat), `\$`, `\#`, `\_`, `\textasciitilde{}`, `\textasciicircum{}`, `\textbackslash{}`.

### Non-English Cover Letters
Same structure in the posting's language; local date and closing conventions (e.g. "Med venlig hilsen,").

## Checklist Before Finalizing
- [ ] No em-dashes, no cliches, every claim backed by example
- [ ] Forward-looking, company-specific motivation
- [ ] Correct company/role/date, one page, posting language, appropriate salutation, specific headline

## Submission Guidelines (Best Practice)
- Only requested documents, PDF export, clear filenames, follow anonymity/material instructions
