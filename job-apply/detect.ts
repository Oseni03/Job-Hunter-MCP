import type { Ats } from "./types.ts";

/**
 * Detects the applicant-tracking system from the posting URL. Greenhouse
 * application forms live under boards.greenhouse.io, job-boards.greenhouse.io,
 * and greenhouse.io embeds; Lever forms live under lever.co. LinkedIn
 * Easy Apply is deliberately NOT auto-detected: linkedin.com URLs report
 * unknown so the LinkedIn adapter (authenticated automation against
 * LinkedIn's ToS) only runs on explicit --ats linkedin opt-in. Anything
 * else (Workday, Taleo, bespoke portals) reports unknown: the filler
 * refuses rather than guessing at an unfamiliar form.
 */
export function detectAts(postingUrl: string): Ats {
	let host = "";
	try {
		host = new URL(postingUrl).hostname.toLowerCase();
	} catch {
		return "unknown";
	}
	if (host.includes("greenhouse.io") || host.includes("greenhouse.com")) return "greenhouse";
	if (host === "lever.co" || host.endsWith(".lever.co")) return "lever";
	return "unknown";
}

export function parseAtsFlag(raw: string | undefined): Ats {
	if (!raw) return "unknown";
	const value = raw.toLowerCase();
	if (value === "greenhouse" || value === "gh") return "greenhouse";
	if (value === "lever") return "lever";
	if (value === "linkedin") return "linkedin";
	throw new Error(`--ats must be greenhouse|lever|linkedin, got ${JSON.stringify(raw)}.`);
}
