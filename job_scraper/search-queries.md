# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

/scrape discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`. You do **not** need a matching `site:` line below for those CLIs to run. The `site:` templates are the **WebSearch fallback**.

**Language scope:** write every query category in every language in the CLAUDE.md Languages table. Translate keywords (e.g. "Frontend Developer" -> "Desarrollador Frontend"), not word-for-word.

## Search Sites

- **[YOUR_JOB_BOARD]** - your market's largest general job board
- **linkedin.com/jobs** - LinkedIn listings (filter: [YOUR_COUNTRY] / [YOUR_CITY]); also covered by `linkedin-search` CLI
- **[YOUR_INDUSTRY_JOB_BOARD]** - niche board (optional)
- **[YOUR_ADDITIONAL_JOB_BOARD]** - another major board (optional)
- Company career pages via `site:` searches for known targets

## Query Categories

Organize by function, not job title. Name each priority after the function; list title variants within it.

### Priority 1: [YOUR_PRIMARY_ROLE_TYPE]

```
site:[YOUR_JOB_BOARD] "[YOUR_PRIMARY_JOB_TITLE_1]" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_PRIMARY_JOB_TITLE_2]" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_KEY_SKILL]" [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_PRIMARY_JOB_TITLE_1]" [YOUR_COUNTRY]
```

### Priority 2: [YOUR_DOMAIN_EXPERTISE]

```
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY] OR [YOUR_REGION]
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_2] [YOUR_COUNTRY]
site:linkedin.com/jobs [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY] [YOUR_COUNTRY]
```

### Priority 3: [YOUR_ADJACENT_ROLE_TYPE]

```
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_1]" [YOUR_KEY_SKILL] [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_2]" [YOUR_KEY_SKILL] [YOUR_CITY]
```

### Priority 4: Broader Technical / Consulting

```
site:[YOUR_JOB_BOARD] [YOUR_KEY_SKILL] developer [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_KEY_SKILL] developer" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "technical consultant" [YOUR_DOMAIN] [YOUR_CITY]
```

## Location Filter

Acceptable: [YOUR_CITY] + surroundings, [ACCEPTABLE_AREA_1], [ACCEPTABLE_AREA_2]; borderline [BORDERLINE_AREA] (~X min transit); too far [TOO_FAR_AREA].

## Language Filter

Apply `04-job-evaluation.md`'s Language Gate: undeclared required language = excluded; higher-level-than-declared = flagged, not excluded. Postings merely written in another language are fine.

## Date Filter

Last 14 days or unexpired deadline; flag "date unknown" when undeterminable.

## Adapting Queries

On a focus area, use the matching category plus 2-3 custom focus queries.
