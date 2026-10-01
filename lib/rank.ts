import {
	checkLanguage,
	extractDeadline,
	extractGaps,
	extractStrengths,
	overallScore,
	parsePostingDay,
	scoreDimensions,
	verdictFor,
} from "@/lib/evaluate.ts";
import { defaultFetch, fetchPosting } from "@/lib/fetch-posting.ts";
import type { FetchLike } from "@/lib/fetch-posting.ts";
import type { Profile } from "@/lib/profile.ts";

/**
 * Batch triage (ticket 08). Scores fetched posting text only against the
 * five-dimension weights and verdict bands, with no company research,
 * salary lookup, or reviewer. Never scores from title alone and never
 * fabricates content: unfetchable postings become expired.
 */

export const RANK_LIMIT_DEFAULT = 10;
export const RANK_TOP_DEFAULT = 5;
export const RANK_LIMIT_MAX = 20;
export const RANK_THRESHOLD = 45;
export const RANK_URGENCY_DAYS = 7;
export const RANK_STALE_DAYS = 30;

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
	kind: "location" | "language" | "expired";
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
	status: "ranked" | "expired";
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
}

export interface RankPlan {
	eligibleCount: number;
	deferredCount: number;
	trackerExcludedCount: number;
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

/** Fresh deadline from posting text: stated deadline parsed to YYYY-MM-DD, else null (never guessed). */
function freshDeadlineFromText(text: string): string | null {
	const raw = extractDeadline(text);
	if (!raw) {
		return null;
	}
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		return parsePostingDay(raw);
	}
	return parsed.toISOString().slice(0, 10);
}

function matchesFocus(item: RankItem, focus: string): boolean {
	const needle = focus.trim().toLowerCase();
	if (needle === "") {
		return true;
	}
	const hay = `${item.title} ${item.company} ${item.fitNotes ?? ""}`.toLowerCase();
	return hay.includes(needle);
}

export async function planRank(input: RankInput): Promise<RankPlan> {
	const now = input.now ?? new Date();
	const today = now.toISOString().slice(0, 10);
	const limit = capRankLimit(input.limit, RANK_LIMIT_DEFAULT);
	const top = capRankLimit(input.top, RANK_TOP_DEFAULT);
	const notes: string[] = [];
	const errors: string[] = [];

	const applied = new Set((input.appliedPairs ?? []).map((pair) => pair.trim().toLowerCase()));
	const focus = input.focus?.trim() ?? "";

	let trackerExcludedCount = 0;
	const candidates: RankItem[] = [];
	for (const item of input.items) {
		if (applied.has(appliedKey(item.company, item.title))) {
			trackerExcludedCount += 1;
			continue;
		}
		if (!matchesFocus(item, focus)) {
			continue;
		}
		if (!input.all && item.status === "ranked") {
			continue;
		}
		candidates.push(item);
	}

	const eligibleCount = candidates.length;
	const toScore = candidates.slice(0, limit);
	const deferredCount = Math.max(0, candidates.length - toScore.length);
	if (focus !== "") {
		notes.push(`Focus "${input.focus}" matched ${eligibleCount} posting(s) by title/company/notes.`);
	}
	notes.push(
		`Triage limits: scoring ${toScore.length} of ${eligibleCount} eligible (limit ${limit}); shortlist shows top ${top}. Deferred ${deferredCount}; tracker-excluded ${trackerExcludedCount}.`,
	);

	const ranked: RankedEntry[] = [];
	const excluded: ExcludedEntry[] = [];
	const stateUpdates: RankStateUpdate[] = [];

	const fetchImpl = input.fetchImpl ?? defaultFetch;

	for (const item of toScore) {
		let text = item.postingText?.trim() ? item.postingText : null;
		let fetchNote: string | null = null;
		if (!text) {
			const target = item.postingUrl?.trim() || item.url?.trim();
			if (!target) {
				excluded.push({
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					kind: "expired",
					reason: "No posting text held and no posting URL to fetch; never scored from the title alone.",
				});
				stateUpdates.push({ key: item.key, status: "expired", rank_date: today });
				notes.push(`Marked ${item.key} expired: no text and no URL to fetch.`);
				continue;
			}
			const fetched = await fetchPosting(target, {
				fetchImpl,
				company: item.company,
				role: item.title,
			});
			if (!fetched.ok || !fetched.text) {
				excluded.push({
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					kind: "expired",
					reason: `Posting unavailable after full escalation (${fetched.steps.join(" > ")}); marked expired, never title-scored.`,
				});
				stateUpdates.push({ key: item.key, status: "expired", rank_date: today });
				notes.push(`Marked ${item.key} expired after escalation: ${fetched.steps.join(" > ")}.`);
				continue;
			}
			text = fetched.text;
			fetchNote = `Fetched via ${fetched.steps.join(" > ")}.`;
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
			excluded.push({
				key: item.key,
				title: item.title,
				company: item.company,
				url: item.url,
				kind: "location",
				reason: `Location veto: ${locationNote}`,
			});
			stateUpdates.push({ key: item.key, status: "expired", rank_date: today });
			continue;
		}
		if (languageGate.verdict === "FAIL") {
			excluded.push({
				key: item.key,
				title: item.title,
				company: item.company,
				url: item.url,
				kind: "language",
				reason: `Language-gate veto: ${languageGate.note}`,
				quote: languageGate.quote,
			});
			stateUpdates.push({ key: item.key, status: "expired", rank_date: today });
			continue;
		}

		const storedDeadline = parsePostingDay(item.deadline, now);
		const freshDeadline = freshDeadlineFromText(postingText);
		const deadline = freshDeadline ?? storedDeadline;

		if (deadline && deadline < today) {
			excluded.push({
				key: item.key,
				title: item.title,
				company: item.company,
				url: item.url,
				kind: "expired",
				reason: `Past deadline ${deadline}; marked expired (fresh value wins over stored).`,
			});
			stateUpdates.push({ key: item.key, status: "expired", rank_date: today, deadline });
			continue;
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
			notes.push(`Unparseable posted date for ${item.key} left unflagged (never guessed).`);
		}

		const flags: string[] = [];
		if (locationVerdict === "FLAG") {
			flags.push(`⚠ location: ${locationNote}`);
		}
		if (languageGate.verdict === "FLAG") {
			flags.push(
				languageGate.quote
					? `⚠ language: "${languageGate.quote}" — ${languageGate.note}`
					: `⚠ language: ${languageGate.note}`,
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
			languageQuote: languageGate.quote,
			deadline,
			postedDate,
			staleNote,
			urgent,
			flags,
			strengths,
			gaps,
		};
		ranked.push(entry);
		stateUpdates.push({
			key: item.key,
			status: "ranked",
			rank_score: score,
			rank_verdict: verdict,
			rank_date: today,
			location_verdict: locationVerdict,
			location_note: locationNote,
			language_gate: languageGate.verdict,
			language_note: languageGate.quote ? `${languageGate.quote} — ${languageGate.note}` : languageGate.note,
			deadline,
			strengths: [...strengths],
			gaps: [...gaps],
		});
		if (fetchNote) {
			notes.push(`${item.key}: ${fetchNote}`);
		}
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
			stateUpdates.push({ key: stored.key, status: "expired", rank_date: today, deadline });
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
	);

	return {
		eligibleCount,
		deferredCount,
		trackerExcludedCount,
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
