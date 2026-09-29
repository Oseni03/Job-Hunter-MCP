# /add-template - Register a Custom CV or Cover Letter Template

Registers a user CV/cover-letter template (LaTeX, Typst, or any compile-to-PDF CLI) so `/apply` drafts from it. Stock: moderncv banking CV, custom `cover.cls` letter. `$ARGUMENTS`: `--list`, `--use <name|default>`, file path/@-mention, or empty (registration flow).

## Step 0: Parse Arguments

- `--list`: Glob `templates/**/TEMPLATE.md`, table Name/Type/Source/Toolchain/Fonts/Active (active = ACTIVE-TEMPLATE block in `05` for CV / `06` for letters); none → explain registration. Stop.
- `--use <name|default>`: `default` → Step 5 with deactivation. Else find exactly one `templates/**/TEMPLATE.md` whose parent folder = `<name>` (none → suggest `--list`; several → stop, ask to rename); extract Type, Source extension, Compile command, Engine label, Page limit, Fonts; verify `template<ext>` exists; derive type from path (`templates/cv/...` → cv, `templates/cover_letters/...` → cover_letters); go to Step 5 (skip 1-4).
- Path/mention: carry source into Step 1. Else start at Step 1.

## Step 1: Template Type and Source

Ask type (CV/cover letter) and source (file, pasted content, or asset directory) unless already given. Read all provided files; confirm/ask for missing includes the toolchain needs (custom `.cls`/`.sty`, local Typst packages, etc.).

## Step 2: Capture Template Instructions

Infer from source first, confirm rather than ask blind. Collect: kebab-case Name (no `templates/` collision); Source extension; Compile command with `<file>` basename placeholder (`.tex` with fontspec/path-loaded fonts → xelatex/lualatex, never pdflatex; render `rm -f <file>.pdf && mkdir -p build && <engine> -interaction=nonstopmode -output-directory=build <file>.tex && mv build/<file>.pdf ./`; `.typ` → `typst compile <file>.typ <file>.pdf`; else ask exact command; redirect intermediates to `build/`, keep PDF beside source; log in `build/`; on redirect-only failure drop redirect but keep leading `rm -f` + record why); Fonts (bundled `.ttf`/`.otf` copied in Step 3 with relative load paths, or system font + install note); Style rules (colors, order, headings, spacing, bullets, dates); Page limit (default CV 2, letter 1); Known pitfalls (macro/content breaks, escaping, frozen sections).

## Step 3: Store the Template

Folder `templates/cv/<name>/` or `templates/cover_letters/<name>/` with: `template<ext>` (personal data → `[PLACEHOLDER]`s, structure/preamble/styling intact); companion class/style/package files; `fonts/` preserving load-layout (adjust skeleton paths relative); `TEMPLATE.md` manifest (Type, Source extension, Engine label, Page limit, Fonts, Class/packages, Compile command run from output dir, Style rules, Known pitfalls).

## Step 4: Verify the Template Compiles (MANDATORY)

Copy skeleton to `_compile_test.*`, fill placeholders with realistic dummy data (contact, one education + one 3-bullet job), compile with declared command (`<file>` → `_compile_test`), diagnose/fix or ask for user-only inputs, confirm PDF + Read layout (sensible, fonts loaded, page limit holds for dummy content), record surprises, delete scratch source/PDF/`build/`/byproducts. No Step 5 until green.

## Step 5: Activate the Template

Insert/replace the managed block after the H1 of `05` (CV) or `06` (letters) — exactly one block per file; `--use default` removes it (stock guidance resumes); never touch outside markers. Block declares override name, skeleton + manifest paths, source extension, compile command (run from output dir; `build/` log + Step 5e cleanup), fonts, page limit, output file (`cv/main_<company>_<role><ext>` / `cover_letters/cover_<company>_<role><ext>`; copy/reference needed class/font files).

## Step 6: Confirm

"Template `<name>` registered and activated" + files + test-compile command/pages + `/apply` now drafts from it + `--list` / `--use` / `--use default` follow-ups. Principles: idempotent re-runs update; profile-agnostic shareable storage; compile check non-negotiable; small managed-block activation surviving `/setup` and manual `05`/`06` edits.
