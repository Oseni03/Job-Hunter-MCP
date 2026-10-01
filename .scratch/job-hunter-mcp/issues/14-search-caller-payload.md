# 14: Search caller payload cost within the stateless constraint

**What to build:** Shrink what the LLM caller must carry through context (`portalResults`, `seenKeys`, `appliedPairs` blobs) without adding server-side per-user persistence. Server-side stores are explicitly out of scope: `contract.test.ts` forbids filesystem writes in `lib/`, statelessness keeps the server serverless-deployable, and user-keyed storage means auth, retention, and GDPR — a different product. An LLM pass is also out of scope here: it increases token spend rather than cutting it.

**Blocked by:** 05-search-jobs.

**Status:** done (commit: feat issue-14; fetch-concurrency bound for rank URLs-not-blobs rides issue 15)

Verification: `npx tsc --noEmit` clean, `npx eslint` clean on touched files, focused suites green (payload 9, rank, search, search-tool).

- [ ] URLs-not-blobs where re-fetch is cheap: define which inputs may travel as references (posting URLs for rank/evaluate to fetch) versus which must stay inline (seen keys, tracker pairs), and document the tradeoff per tool
- [ ] Paged/cursor candidates for large result sets instead of full arrays in one response, working within caller-held state (the cursor is opaque to the server, which stays stateless)
- [ ] Delta-only `seenKeys` convention: the host sends only keys new since the last call, documented in the search prompt together with the failure mode (a host that loses its store resends full state — correctness first, savings second)
- [ ] Token budget documented in the rank/search prompts: what the model should actually decide (keywords, location, mode, limit) versus what the host harness supplies (portal output, dedupe stores), so prompt authors stop routing blobs through model context by accident
- [ ] `rank-jobs` is the strongest URLs-not-blobs case: twenty items with full `postingText` is the largest single payload in the system — let the server fetch from keys and URLs (with the bounded concurrency from issue 15) instead of the caller pasting text
- [ ] `RankItem` carries an optional caller `quickFit` score for pre-ordering before the limit slice (cheapest fix for caller-order slicing; explicit caller evidence, so no rule is weakened), and deferred-set resumption rides the opaque cursor from the paging work above rather than resending everything
