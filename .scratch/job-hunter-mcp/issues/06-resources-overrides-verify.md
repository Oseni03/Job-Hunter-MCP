# 06: Profile resources plus overrides plus verify signals

**What to build:** Shared profile and template resources plus server-side document safety signals, so every tool uses the same defaults while the host keeps the compile toolchain.

**Blocked by:** 01-foundation-evaluate-job.

**Status:** done (commit f8fe94b; tsc clean, 277/277 node:test green, eslint clean, golden 26 pass)

- [ ] Candidate profile, behavioral profile, writing rules, evaluation framework, and CV and letter templates are exposed as versioned resources and prompts with private server defaults and per-call override winning everywhere
- [ ] Base CV variants are listable and fetchable, with direct passthrough of caller-supplied base content as fallback so tailoring never depends on server disk
- [ ] Document outputs carry page-budget signals (CV two pages, letter one page with word budget) enforced by content shaping rather than geometry squeezing
- [ ] Server checks LaTeX safety signals (escaping, bracket bracing, ASCII date ranges, translated headings) and reports them alongside the TeX instead of compiling on the hosting platform
- [ ] Layout signals mirror the mechanical checks (hole, early-ending page, thin final page, footer collision, orphaned header) with explicit degraded mode when bounding-box extraction is unavailable
- [ ] Host owns all compilation and visual inspection with the declared toolchain per active template, plus text-layer extraction and keyword coverage
