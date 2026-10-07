# Prune legacy Profile fields into the unified shape

The Profile table carried two generations of the same data: flat `primary/secondary/weakSkills` plus unified `skills[]`, flat `strong/adjacentDomains` plus `domains[]`, and `careerGoals` plus `preferences.targetRoles`. We dropped the eight legacy columns (plus display-only `constraints` and `citizenships`, which no logic read) and fold old payloads into the new shape on parse, because keeping both lets writers and readers disagree about which copy is true.

## Considered Options

- Keep both generations with sync logic: rejected, every writer must remember to update two copies and the audit/matcher code has to guess which one wins.
- Hard cut with no folding: rejected, stored rows and caller-held overrides from before the prune would fail strict parsing instead of migrating.

## Consequences

- `foldLegacyFields` accepts the old keys (skills by category, domains by strength, goals into `preferences.targetRoles`) and drops the display-only ones; `parseProfile` applies it before strict validation, so pre-prune rows, overrides, and LLM payloads migrate instead of failing.
- Weak skills stay out of matching denominators and vocabularies (claiming them would over-claim); they surface only through the research gap-watch, exactly as before.
- Kept on purpose: `workCountry` (Indeed site country), `permitClasses` (eligibility gate), `languages` (language gate), `energizing/drainingTasks` (behavioral dimension, optional supplements defaulting neutral).
