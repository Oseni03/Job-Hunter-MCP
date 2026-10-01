import { createHash } from "node:crypto";

import { decodeCursor, encodeCursor } from "@/lib/cursor.ts";
import {
	checkLanguage,
	extractDeadline,
	extractGaps,
	extractStrengths,
	overallScore,
	parseConservativeDeadline,
	parsePostingDay,
	phraseMatches,
	sanitizeQuote,
	scoreDimensions,
	verdictFor,
} from "@/lib/evaluate.ts";
import { getFetchCache, setFetchCache } from "@/lib/fetch-cache.ts";
import { FETCH_CONCURRENCY, FETCH_ITEM_TIMEOUT_MS, mapWithConcurrency, withTimeout } from "@/lib/fetch-concurrency.ts";
import { defaultFetch, fetchPosting } from "@/lib/fetch-posting.ts";
import type { FetchLike } from "@/lib/fetch-posting.ts";
import type { Profile } from "@/lib/profile.ts";

/**
 * Batch triage (ticket 08) with issue-15 safety:
 * - Four terminal fates split: ranked / expired / unavailable / excluded.
 * - Conservative fresh deadlines (explicit-year, unambiguous only).
 * - Bounded retry for unavailable, hash-gated re-score for excluded.
 * - Word-boundary focus, quote hygiene, bounded concurrency, fetch cache.
 *
 * Scope: triage only. Scores fetched posting text against the
 * five-dimension weights and verdict bands, with no company research,
 * salary lookup, or reviewer. Never scores from title alone and never
 * fabricates content: unfetchable postings become unavailable.
 */

export const RANK_LIMIT_DEFAULT = 10;
export const RANK_TOP_DEFAULT = 5;
export const RANK_LIMIT_MAX = 20;
export const RANK_THRESHOLD = 45;
export const RANK_URGENCY_DAYS = 7;
export const RANK_STALE_DAYS = 30;

/**
 * Bounded unavailable retry (issue 15, named constants): a permanently
 * dead URL must not be escalated forever. `stateUpdates` carries
 * `lastAttemptDate` + `attemptCount`; the tool skips the re-fetch (note,
 * not escalation) once attempts reach 3 or the last attempt is under
 * 3 days old. Server stays stateless — all retry memory travels
 * host-side in `stateUpdates` and back via `RankItem`.
 */
export const UNAVAILABLE_MAX_ATTEMPTS = 3;
export const UNAVAILABLE_RETRY_COOLDOWN_DAYS = 3;

export type RankStatus = "ranked" | "expired" | "unavailable" | "excluded";

export interface RankItem {
	key: string;
	title: string;
	company: string;
	url: string;
	portal?: string;
	postedDate?: string | null;
	deadline?: string | null;
	postingText?: string;
	postingUrl?: string;
	status?: string;
	fitNotes?: string;
	/**
	 * Caller-held quick-fit score for pre-ordering before the limit slice
	 * (issue 14): explicit caller evidence, so no rule is weakened. Items
	 * without one keep portal order behind scored items.
	 */
	callerQuickFit?: number;
	/** Host-persisted profile hash from the last exclusion (issue 15). Mismatch triggers re-evaluation. */
	lastProfileHash?: string;
	/** Host-persisted last fetch attempt date YYYY-MM-DD for unavailable retry bounding. */
	lastAttemptDate?: string | null;
	/** Host-persisted fetch attempt count for unavailable retry bounding. */
	attemptCount?: number;
}

export interface StoredRank {
	key: string;
	deadline?: string | null;
}

export interface RankInput {
	profile: Profile;
	items: RankItem[];
	focus?: string;
	limit?: number;
	top?: number;
	all?: boolean;
	appliedPairs?: string[];
	storedRanks?: StoredRank[];
	now?: Date;
	fetchImpl?: FetchLike;
	/**
	 * Opaque resume token from a previous call (issue 14). The server holds
	 * no state: the deferred set resumes from this offset, not from a
	 * resend-everything loop.
	 */
	cursor?: string;
}

export interface RankedEntry {
	key: string;
	title: string;
	company: string;
	url: string;
	portal: string;
	score: number;
	verdict: string;
	locationVerdict: string;
	locationNote: string;
	languageGate: string;
	languageNote: string;
	languageQuote?: string;
	deadline: string | null;
	postedDate: string | null;
	staleNote: string | null;
	urgent: boolean;
	flags: string[];
	strengths: string[];
	gaps: string[];
}

export interface ExcludedEntry {
	key: string;
	title: string;
	company: string;
	url: string;
	kind: "location" | "language" | "expired" | "unavailable";
	reason: string;
	quote?: string;
}

export interface SweptEntry {
	key: string;
	deadline: string;
	reason: string;
}

export interface RankStateUpdate {
	key: string;
	status: "ranked" | "expired" | "unavailable" | "excluded";
	rank_score?: number;
	rank_verdict?: string;
	rank_date?: string;
	location_verdict?: string;
	location_note?: string;
	language_gate?: string;
	language_note?: string;
	deadline?: string | null;
	strengths?: string[];
	gaps?: string[];
	/** Deterministic profile hash (canonical JSON, sha1) — host persists, sends back as lastProfileHash. */
	profileHash?: string;
	/** Unavailable retry memory: attempts so far. */
	attemptCount?: number;
	/** Unavailable retry memory: last attempt date YYYY-MM-DD. */
	lastAttemptDate?: string | null;
	/** Excluded/unavailable human reason for the host store. */
	reason?: string;
}

export interface RankPlan {
	eligibleCount: number;
	deferredCount: number;
	trackerExcludedCount: number;
	/** Focus non-matches silently dropped before this fix; now counted so the host distinguishes "nothing matched" from "nothing sent". */
	focusSkippedCount: number;
	/** Opaque resume token when eligible items remain past this slice (issue 14). */
	nextCursor: string | null;
	/** Deterministic profile hash for this run; host persists per excluded row. */
	profileHash: string;
	ranked: RankedEntry[];
	shortlist: RankedEntry[];
	belowThreshold: RankedEntry[];
	excluded: ExcludedEntry[];
	closingSoon: RankedEntry[];
	sweptExpired: SweptEntry[];
	sweptClosingSoon: SweptEntry[];
	stateUpdates: RankStateUpdate[];
	limits: { limit: number; top: number };
	notes: string[];
	errors: string[];
}

function capRankLimit(limit: number | undefined, fallback: number): number {
	if (limit === undefined || limit === null || Number.isNaN(limit)) {
		return fallback;
	}
	return Math.max(1, Math.min(RANK_LIMIT_MAX, Math.floor(limit)));
}

function appliedKey(company: string, title: string): string {
	return `${company.trim().toLowerCase()}||${title.trim().toLowerCase()}`;
}

function daysBetween(from: string, to: string): number {
	return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
}

/** Canonical JSON: sorted keys recursively, so the hash is deterministic across runs. */
function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

/**
 * Deterministic profile hash (issue 15): canonical JSON of the resolved
 * profile, sha1. The server emits it in every `stateUpdates` entry; the
 * host flow is persist hash → send back as `lastProfileHash` → mismatch
 * triggers re-evaluation of excluded rows. The tool cannot see profile
 * changes, so the hash is the protocol.
 */
export function profileHashFor(profile: Profile): string {
	return createHash("sha1").update(canonicalJson(profile)).digest("hex");
}

/**
 * Fresh deadline from posting text (issue 15, conservative): accepts the
 * fresh value over the stored one solely for explicit-year, unambiguous
 * formats (ISO YYYY-MM-DD, month-name + explicit year). Yearless,
 * order-ambiguous numeric, and zoned-midnight phrases return null — the
 * caller keeps the stored value and adds a note. Never guessed.
 */
function freshDeadlineFromText(text: string): { date: string | null; raw: string | null } {
	const raw = extractDeadline(text);
	if (!raw) {
		return { date: null, raw: null };
	}
	if (/(apply by|deadline|closing date|closes?( on| at)?|applications close)[^\n]{0,120}(\d{1,2}:\d{2}|UTC|GMT|[+-]\d{2}:?\d{2}|midnight|CET|CEST)/i.test(text)) {
		return { date: null, raw };
	}
	return { date: parseConservativeDeadline(raw), raw };
}

function matchesFocus(item: RankItem, focus: string): boolean {
	const needle = focus.trim();
	if (needle === "") {
		return true;
	}
	const hay = `${item.title} ${item.company} ${item.fitNotes ?? ""}`;
	return phraseMatches(hay, needle);
}

function cooldownDays(lastAttemptDate: string | null | undefined, today: string): number | null {
	if (!lastAttemptDate) {
		return null;
	}
	const parsed = new Date(`${lastAttemptDate}T00:00:00Z`).getTime();
	if (Number.isNaN(parsed)) {
		return null;
	}
	return (new Date(`${today}T00:00:00Z`).getTime() - parsed) / 86400000;
}

interface PerItemResult {
	ranked?: RankedEntry;
	excluded?: ExcludedEntry;
	stateUpdate?: RankStateUpdate;
	notes: string[];
}

export async function planRank(input: RankInput): Promise<RankPlan> {
	const now = input.now ?? new Date();
	const today = now.toISOString().slice(0, 10);
	const limit = capRankLimit(input.limit, RANK_LIMIT_DEFAULT);
	const top = capRankLimit(input.top, RANK_TOP_DEFAULT);
	const notes: string[] = [];
	const errors: string[] = [];
	const profileHash = profileHashFor(input.profile);

	const applied = new Set((input.appliedPairs ?? []).map((pair) => pair.trim().toLowerCase()));
	const focus = input.focus?.trim() ?? "";

	let trackerExcludedCount = 0;
	let focusSkippedCount = 0;
	const candidates: RankItem[] = [];
	const earlyExcluded: ExcludedEntry[] = [];
	const earlyStateUpdates: RankStateUpdate[] = [];
	for (const item of input.items) {
		if (applied.has(appliedKey(item.company, item.title))) {
			trackerExcludedCount += 1;
			continue;
		}
		if (!matchesFocus(item, focus)) {
			focusSkippedCount += 1;
			continue;
		}
		const status = (item.status ?? "").trim();
		if (!input.all && status === "ranked") {
			continue;
		}
		if (status === "expired") {
			continue;
		}
		if (status === "unavailable") {
			const attempts = item.attemptCount ?? 0;
			const age = cooldownDays(item.lastAttemptDate ?? null, today);
			const throttledByCount = attempts >= UNAVAILABLE_MAX_ATTEMPTS;
			const throttledByCooldown = age !== null && age < UNAVAILABLE_RETRY_COOLDOWN_DAYS;
			const forceRetry = input.all === true && !throttledByCount;
			if ((throttledByCount || throttledByCooldown) && !forceRetry) {
				const why = throttledByCount
					? `attempts ${attempts} reached max ${UNAVAILABLE_MAX_ATTEMPTS}`
					: `last attempt ${item.lastAttemptDate} under ${UNAVAILABLE_RETRY_COOLDOWN_DAYS}-day cooldown`;
				earlyExcluded.push({
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					kind: "unavailable",
					reason: `Fetch throttled (${why}); skipped without escalation.`,
				});
				earlyStateUpdates.push({
					key: item.key,
					status: "unavailable",
					rank_date: today,
					profileHash,
					attemptCount: attempts,
					lastAttemptDate: item.lastAttemptDate ?? null,
					reason: `Throttled: ${why}.`,
				});
				notes.push(`Skipped re-fetch for ${item.key}: ${why} (bounded retry, no escalation burned).`);
				continue;
			}
		}
		if (status === "excluded" && !input.all) {
			if ((item.lastProfileHash ?? "") === profileHash) {
				continue;
			}
			notes.push(`Re-scoring excluded ${item.key}: profile hash changed since exclusion.`);
		}
		candidates.push(item);
	}

	// Caller-evidence pre-ordering (issue 14): scored items first by score
	// descending, unscored items keep portal order behind them. Stable sort,
	// so ties preserve the caller's order.
	const scoredCount = candidates.filter((item) => typeof item.callerQuickFit === "number").length;
	const ordered = candidates
		.map((item, index) => ({ item, index }))
		.sort(
			(a, b) =>
				(typeof b.item.callerQuickFit === "number" ? b.item.callerQuickFit : -1) -
					(typeof a.item.callerQuickFit === "number" ? a.item.callerQuickFit : -1) || a.index - b.index,
		)
		.map((entry) => entry.item);
	if (scoredCount > 0) {
		notes.push(
			`Pre-ordered ${scoredCount} caller-scored item(s) by caller quick-fit before the limit slice; unscored items keep portal order.`,
		);
	}
	// Deferred-set resumption rides the opaque cursor (issue 14): offset into
	// the ordered eligible list, server stateless, caller holding the items.
	let offset = 0;
	if (input.cursor !== undefined) {
		const decoded = decodeCursor(input.cursor);
		if (decoded === null) {
			notes.push("Unparseable rank cursor ignored; restarted at offset zero (correctness first).");
		} else {
			offset = decoded;
		}
	}
	const eligibleCount = ordered.length;
	const toScore = ordered.slice(offset, offset + limit);
	const deferredCount = Math.max(0, ordered.length - offset - toScore.length);
	const nextCursor = offset + toScore.length < ordered.length ? encodeCursor(offset + toScore.length) : null;
	if (focus !== "") {
		notes.push(`Focus "${input.focus}" matched ${eligibleCount} posting(s); skipped ${focusSkippedCount} non-match(es).`);
	}
	notes.push(
		`Triage limits: scoring ${toScore.length} of ${eligibleCount} eligible (limit ${limit}${offset > 0 ? `, resumed at offset ${offset}` : ""}); shortlist shows top ${top}. Deferred ${deferredCount}; tracker-excluded ${trackerExcludedCount}.`,
	);
	notes.push(
		`State semantics (all=${input.all === true}): ranked rests unless all=true; expired terminal (never re-fetched, host may drop); unavailable bounded (max ${UNAVAILABLE_MAX_ATTEMPTS} attempts, ${UNAVAILABLE_RETRY_COOLDOWN_DAYS}-day cooldown; all=true bypasses cooldown, never the max); excluded re-scores on profile-hash mismatch (host: persist profileHash → send lastProfileHash → mismatch re-evaluates) or all=true.`,
	);

	const fetchImpl = input.fetchImpl ?? defaultFetch;

	async function scoreOne(item: RankItem): Promise<PerItemResult> {
		const localNotes: string[] = [];
		let text = item.postingText?.trim() ? item.postingText : null;
		let fetchNote: string | null = null;
		let attempts = item.attemptCount ?? 0;
		if (!text) {
			const target = item.postingUrl?.trim() || item.url?.trim();
			if (!target) {
				return {
					excluded: {
						key: item.key,
						title: item.title,
						company: item.company,
						url: item.url,
						kind: "unavailable",
						reason: "No posting text held and no posting URL to fetch; never scored from the title alone.",
					},
					stateUpdate: {
						key: item.key,
						status: "unavailable",
						rank_date: today,
						profileHash,
						attemptCount: attempts,
						lastAttemptDate: item.lastAttemptDate ?? null,
						reason: "No text and no URL to fetch.",
					},
					notes: [`Marked ${item.key} unavailable: no text and no URL to fetch.`],
				};
			}
			const cached = getFetchCache(target);
			if (cached) {
				if (cached.ok && cached.text) {
					text = cached.text;
					fetchNote = `Cache hit (${cached.steps.join(" > ")}).`;
				} else {
					attempts += 1;
					return {
						excluded: {
							key: item.key,
							title: item.title,
							company: item.company,
							url: item.url,
							kind: "unavailable",
							reason: `Posting unavailable (cached ${cached.steps.join(" > ")}); marked unavailable, never title-scored.`,
						},
						stateUpdate: {
							key: item.key,
							status: "unavailable",
							rank_date: today,
							profileHash,
							attemptCount: attempts,
							lastAttemptDate: today,
							reason: "Cached fetch failure; transient, never invented.",
						},
						notes: [`Marked ${item.key} unavailable from cache: ${cached.steps.join(" > ")}.`],
					};
				}
			} else {
				let fetched: Awaited<ReturnType<typeof fetchPosting>>;
				try {
					fetched = await withTimeout(
						fetchPosting(target, { fetchImpl, company: item.company, role: item.title }),
						FETCH_ITEM_TIMEOUT_MS,
						`fetch ${item.key}`,
					);
				} catch (error) {
					attempts += 1;
					setFetchCache(target, { ok: false, text: null, finalUrl: target, steps: ["timeout"] });
					return {
						excluded: {
							key: item.key,
							title: item.title,
							company: item.company,
							url: item.url,
							kind: "unavailable",
							reason: `Posting fetch timed out (${String(error)}); marked unavailable, never title-scored.`,
						},
						stateUpdate: {
							key: item.key,
							status: "unavailable",
							rank_date: today,
							profileHash,
							attemptCount: attempts,
							lastAttemptDate: today,
							reason: "Fetch timeout; bounded retry applies.",
						},
						notes: [`Marked ${item.key} unavailable: fetch timeout.`],
					};
				}
				setFetchCache(target, {
					ok: fetched.ok,
					text: fetched.text,
					finalUrl: fetched.finalUrl,
					steps: fetched.steps,
				});
				if (!fetched.ok || !fetched.text) {
					attempts += 1;
					return {
						excluded: {
							key: item.key,
							title: item.title,
							company: item.company,
							url: item.url,
							kind: "unavailable",
							reason: `Posting unavailable after full escalation (${fetched.steps.join(" > ")}); marked unavailable, never title-scored.`,
						},
						stateUpdate: {
							key: item.key,
							status: "unavailable",
							rank_date: today,
							profileHash,
							attemptCount: attempts,
							lastAttemptDate: today,
							reason: fetched.error ?? "Fetch failed after escalation.",
						},
						notes: [`Marked ${item.key} unavailable after escalation: ${fetched.steps.join(" > ")}.`],
					};
				}
				text = fetched.text;
				fetchNote = `Fetched via ${fetched.steps.join(" > ")}.`;
			}
		}

		const postingText = text as string;
		const dims = scoreDimensions(postingText, input.profile);
		const score = overallScore(dims);
		const verdict = verdictFor(score);
		const locationDim = dims.find((dim) => dim.dimension === "location");
		const locationVerdict = locationDim?.status ?? "PASS";
		const locationNote = locationDim?.notes ?? "";
		const languageGate = checkLanguage(postingText, input.profile);

		if (locationVerdict === "FAIL") {
			return {
				excluded: {
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					kind: "location",
					reason: `Location veto: ${sanitizeQuote(locationNote)}`,
				},
				stateUpdate: {
					key: item.key,
					status: "excluded",
					rank_date: today,
					profileHash,
					reason: `Location veto: ${sanitizeQuote(locationNote)}`,
				},
				notes: [],
			};
		}
		if (languageGate.verdict === "FAIL") {
			const quote = languageGate.quote ? sanitizeQuote(languageGate.quote) : undefined;
			return {
				excluded: {
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					kind: "language",
					reason: `Language-gate veto: ${sanitizeQuote(languageGate.note)}`,
					quote,
				},
				stateUpdate: {
					key: item.key,
					status: "excluded",
					rank_date: today,
					profileHash,
					reason: `Language-gate veto: ${sanitizeQuote(languageGate.note)}`,
				},
				notes: [],
			};
		}

		const storedDeadline = parsePostingDay(item.deadline, now);
		const fresh = freshDeadlineFromText(postingText);
		let deadline = storedDeadline;
		if (fresh.date) {
			deadline = fresh.date;
		} else if (fresh.raw) {
			localNotes.push(
				`Kept stored deadline ${storedDeadline ?? "unknown"} for ${item.key}: fresh phrase "${sanitizeQuote(fresh.raw)}" is yearless/ambiguous/zoned — assumed-year, month-order, and UTC-day rules require explicit-year unambiguous dates.`,
			);
		}

		if (deadline && deadline < today) {
			return {
				excluded: {
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					kind: "expired",
					reason: `Past deadline ${deadline}; marked expired.`,
				},
				stateUpdate: { key: item.key, status: "expired", rank_date: today, profileHash, deadline },
				notes: localNotes,
			};
		}

		const urgent = deadline !== null && daysBetween(today, deadline) <= RANK_URGENCY_DAYS;
		const postedDate = parsePostingDay(item.postedDate, now);
		let staleNote: string | null = null;
		if (postedDate) {
			const age = Math.round(daysBetween(postedDate, today));
			if (age > RANK_STALE_DAYS) {
				staleNote = `Posted ${age} days ago (${postedDate}); staleness signal only, never a veto.`;
			}
		} else if (item.postedDate) {
			localNotes.push(`Unparseable posted date for ${item.key} left unflagged (never guessed).`);
		}

		const flags: string[] = [];
		if (locationVerdict === "FLAG") {
			flags.push(`⚠ location: ${sanitizeQuote(locationNote)}`);
		}
		if (languageGate.verdict === "FLAG") {
			flags.push(
				languageGate.quote
					? `⚠ language: Quoted posting data: "${sanitizeQuote(languageGate.quote)}" — ${sanitizeQuote(languageGate.note)}`
					: `⚠ language: ${sanitizeQuote(languageGate.note)}`,
			);
		}
		if (staleNote) {
			flags.push(`⚠ stale: ${staleNote}`);
		}
		if (urgent && deadline) {
			flags.push(`🔥 closing soon: deadline ${deadline}`);
		}

		const strengths = extractStrengths(postingText, input.profile);
		const gaps = extractGaps(postingText, input.profile);
		const entry: RankedEntry = {
			key: item.key,
			title: item.title,
			company: item.company,
			url: item.url,
			portal: item.portal ?? "linkedin",
			score,
			verdict,
			locationVerdict,
			locationNote,
			languageGate: languageGate.verdict,
			languageNote: languageGate.note,
			languageQuote: languageGate.quote ? sanitizeQuote(languageGate.quote) : undefined,
			deadline,
			postedDate,
			staleNote,
			urgent,
			flags,
			strengths,
			gaps,
		};
		const stateUpdate: RankStateUpdate = {
			key: item.key,
			status: "ranked",
			rank_score: score,
			rank_verdict: verdict,
			rank_date: today,
			location_verdict: locationVerdict,
			location_note: locationNote,
			language_gate: languageGate.verdict,
			language_note: languageGate.quote ? `${sanitizeQuote(languageGate.quote)} — ${sanitizeQuote(languageGate.note)}` : sanitizeQuote(languageGate.note),
			deadline,
			strengths: [...strengths],
			gaps: [...gaps],
			profileHash,
		};
		if (fetchNote) {
			localNotes.push(`${item.key}: ${fetchNote}`);
		}
		return { ranked: entry, stateUpdate, notes: localNotes };
	}

	// Bounded concurrency, deterministic order: results collected per input
	// index and emitted in input order, never completion order.
	const perItem = await mapWithConcurrency(toScore, FETCH_CONCURRENCY, scoreOne);

	const ranked: RankedEntry[] = [];
	const excluded: ExcludedEntry[] = [...earlyExcluded];
	const stateUpdates: RankStateUpdate[] = [...earlyStateUpdates];
	for (const result of perItem) {
		if (result.ranked && result.stateUpdate) {
			ranked.push(result.ranked);
			stateUpdates.push(result.stateUpdate);
		} else if (result.excluded && result.stateUpdate) {
			excluded.push(result.excluded);
			stateUpdates.push(result.stateUpdate);
		}
		notes.push(...result.notes);
	}

	ranked.sort((a, b) => b.score - a.score || Number(b.urgent) - Number(a.urgent) || a.key.localeCompare(b.key));

	const shortlist = ranked.filter((entry) => entry.score >= RANK_THRESHOLD).slice(0, top);
	const belowThreshold = ranked.filter((entry) => entry.score < RANK_THRESHOLD);
	const closingSoon = ranked.filter((entry) => entry.urgent);

	const scoredKeys = new Set([...ranked.map((entry) => entry.key), ...excluded.map((entry) => entry.key)]);
	const sweptExpired: SweptEntry[] = [];
	const sweptClosingSoon: SweptEntry[] = [];
	for (const stored of input.storedRanks ?? []) {
		if (scoredKeys.has(stored.key)) {
			continue;
		}
		const deadline = parsePostingDay(stored.deadline, now);
		if (!deadline) {
			continue;
		}
		if (deadline < today) {
			sweptExpired.push({ key: stored.key, deadline, reason: `Stored deadline ${deadline} is past; swept to expired.` });
			stateUpdates.push({ key: stored.key, status: "expired", rank_date: today, profileHash, deadline });
		} else if (daysBetween(today, deadline) <= RANK_URGENCY_DAYS) {
			sweptClosingSoon.push({
				key: stored.key,
				deadline,
				reason: `Stored deadline ${deadline} closes within ${RANK_URGENCY_DAYS} days.`,
			});
		}
	}
	if (sweptExpired.length > 0 || sweptClosingSoon.length > 0) {
		notes.push(
			`Swept ${sweptExpired.length} newly expired and ${sweptClosingSoon.length} closing-soon stored deadlines (no-deadline entries left alone, never guessed).`,
		);
	}

	notes.push(
		"Triage depth only: scored from posting text with five-dimension weights (30/25/15/30) and verdict bands (75/60/45/30). No company research, salary lookup, or reviewer. Route picks back to evaluate-job, which always re-runs full Step 1.",
		"Scale note: rank verdict bands (full fetched text) and search quick-fit bands (snippet probe text) are different instruments over different text depths — not comparable until calibrated on a labeled set.",
		"Fetch cache: normalized URL (fragment stripped, host lowercased), 6h success TTL / 15min failure TTL, in-memory per process — does not survive restarts or scale across instances. Failures degrade to unavailable, never invented content.",
	);

	return {
		eligibleCount,
		deferredCount,
		trackerExcludedCount,
		focusSkippedCount,
		nextCursor,
		profileHash,
		ranked,
		shortlist,
		belowThreshold,
		excluded,
		closingSoon,
		sweptExpired,
		sweptClosingSoon,
		stateUpdates,
		limits: { limit, top },
		notes,
		errors,
	};
}
