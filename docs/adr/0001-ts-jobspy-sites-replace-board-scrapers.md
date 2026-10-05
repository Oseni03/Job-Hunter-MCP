# Replace board scrapers with ts-jobspy Sites

Job discovery ran on hand-rolled board scrapers (LinkedIn guest HTML plus Greenhouse/Lever/Ashby board JSON behind empty token configs that returned nothing). We replaced them with the ts-jobspy Site client for Indeed and LinkedIn and deleted the board path, because the board configs were unconfigured dead weight and the guest scraper was the least reliable fetcher we owned.

## Considered Options

- Keep all legacy adapters and add ts-jobspy alongside: rejected, keeps unconfigured code alive.
- Full delete of every adapter: rejected, loses remote-board and Nigerian-board coverage ts-jobspy cannot replace.

## Consequences

- `search-jobs` offers `portal-live` and `scraper` Sources only; per-Site honesty (ok/empty notes, partial/error errors) is the contract.
- Indeed country derives from the profile with a `usa` fallback; failure isolation (`strict: false`) keeps one dead Site from discarding the other's jobs.
