# 04: Board-path contract removal

**What to build:** An end-to-end search contract offering only portal-live and scraper Sources, with every board reference, schema field, and board-only test retired and no dangling behavior.

**Blocked by:** 03-honest-errors-country-isolation.

**Status:** ready-for-agent

- [ ] Search requests without board refs behave identically before and after removal, board refs are rejected as unknown input rather than silently ignored, and no Source claim ever reports a board Source
- [ ] Full test suite passes with board-only suites deleted and scraper suites updated to the Site-backed behavior, with zero invented postings on any removed-path regression probe
