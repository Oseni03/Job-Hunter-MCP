/**
 * due-followups core: read-only query over caller-held applications.
 * Pure function; the server holds no state. Accepts either structured
 * `applications[]` (preferred, e.g. mirrored from Prisma) or the raw
 * `trackerText` CSV the host already owns.
 */

export interface DueApplicationInput {
	jobKey: string;
	company: string;
	role: string;
	status: string;
	/** Last touch as YYYY-MM-DD; unknown stays unknown and is treated as stale. */
	updatedAt?: string | null;
	/** Deadline as YYYY-MM-DD; anything else ignored, never guessed. */
	deadline?: string | null;
}

export interface DueFollowupsOptions {
	staleDays?: number;
	deadlineWithinDays?: number;
	limit?: number;
	/** YYYY-MM-DD override for today; default is the UTC day. */
	today?: string;
}

export interface DueItem {
	jobKey: string;
	company: string;
	role: string;
	status: string;
	daysStale: number | null;
	reason: string;
	suggestedAction: string;
}

export interface DueFollowupsPlan {
	ok: true;
	due: DueItem[];
	checked: number;
	staleDays: number;
	deadlineWithinDays: number;
	note: string;
}

const FINAL_STATUSES = new Set([
	"rejected",
	"withdrawn",
	"no response",
	"offer declined",
	"hired",
	"accepted",
]);

const TRACKED_OPEN = new Set(["applied", "interviewing", "offer"]);

function dayMs(date: string): number | null {
	const ms = new Date(`${date}T00:00:00Z`).getTime();
	return Number.isNaN(ms) ? null : ms;
}

function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

function isFinal(status: string): boolean {
	return FINAL_STATUSES.has(status.trim().toLowerCase());
}

/** Parses the host-owned tracker CSV into DueApplicationInputs. Header-tolerant, never throws. */
export function parseTrackerApplications(trackerText: string): DueApplicationInput[] {
	const lines = trackerText.split("\n").map((line) => line.trimEnd());
	if (lines.length < 2) return [];
	const out: DueApplicationInput[] = [];
	for (const line of lines.slice(1)) {
		if (!line.trim()) continue;
		const cells = line.split(",");
		if (cells.length < 7) continue;
		const date = (cells[0] ?? "").trim();
		const company = (cells[1] ?? "").trim();
		const role = (cells[3] ?? "").trim();
		const status = (cells[6] ?? "").trim();
		const deadline = cells.length >= 14 ? (cells[13] ?? "").trim() : "";
		if (!company || !role) continue;
		out.push({
			jobKey: `${company}||${role}`.toLowerCase(),
			company,
			role,
			status: status || "applied",
			updatedAt: date || null,
			deadline: deadline || null,
		});
	}
	return out;
}

export function planDueFollowups(
	applications: DueApplicationInput[],
	options: DueFollowupsOptions = {},
): DueFollowupsPlan {
	const staleDays = options.staleDays ?? 7;
	const deadlineWithinDays = options.deadlineWithinDays ?? 3;
	const limit = options.limit ?? 20;
	const today = options.today ?? todayStr();
	const nowMs = dayMs(today) ?? Date.now();

	const due: (DueItem & { sortKey: number })[] = [];
	for (const app of applications) {
		const status = (app.status ?? "").trim();
		if (!status || isFinal(status)) continue;
		if (!TRACKED_OPEN.has(status.toLowerCase()) && status.toLowerCase() !== "saved") {
			// Unknown open-ish statuses still count; only `saved` is excluded plus finals.
			if (status.toLowerCase() === "saved") continue;
		} else if (status.toLowerCase() === "saved") {
			continue;
		}
		const updatedMs = app.updatedAt ? dayMs(app.updatedAt) : null;
		const daysStale = updatedMs === null ? null : Math.max(0, Math.floor((nowMs - updatedMs) / 86400000));
		const deadlineMs = app.deadline ? dayMs(app.deadline) : null;
		const daysToDeadline =
			deadlineMs === null ? null : Math.floor((deadlineMs - nowMs) / 86400000);

		const staleHit = daysStale !== null ? daysStale >= staleDays : true;
		const deadlineHit =
			daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= deadlineWithinDays;
		if (!staleHit && !deadlineHit) continue;

		const reasons: string[] = [];
		if (staleHit) reasons.push(daysStale === null ? "no recorded touch" : `untouched ${daysStale}d`);
		if (deadlineHit) reasons.push(`deadline in ${daysToDeadline}d`);
		due.push({
			jobKey: app.jobKey,
			company: app.company,
			role: app.role,
			status,
			daysStale,
			reason: reasons.join("; "),
			suggestedAction:
				deadlineHit && staleHit
					? "Follow up now; deadline is near and the thread is stale."
					: deadlineHit
						? "Confirm deadline and submission state."
						: "Send a brief check-in referencing your last touch.",
			sortKey: daysStale ?? 9999,
		});
	}
	due.sort((a, b) => b.sortKey - a.sortKey);
	const sliced = due.slice(0, Math.max(1, limit)).map(({ sortKey: _sortKey, ...item }) => item);
	return {
		ok: true,
		due: sliced,
		checked: applications.length,
		staleDays,
		deadlineWithinDays,
		note: `Open applications untouched >= ${staleDays}d or with a deadline within ${deadlineWithinDays}d; saved rows and final statuses excluded.`,
	};
}
