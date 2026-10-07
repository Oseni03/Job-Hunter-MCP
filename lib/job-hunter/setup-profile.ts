/**
 * setup-profile core: builds a validated per-user profile from the uploaded
 * resume. Pure function over caller-passed text; the server never touches the
 * filesystem. When `dbWrite` is set the host persists the same payload to the
 * Prisma `Profile` table (mirror-first); storage never changes the result.
 */

import { DEFAULT_PROFILE, parseProfile, type Profile } from "@/lib/job-hunter/profile.ts";
import { hashText } from "@/lib/db.ts";

export interface SetupProfileInput {
	/** Verbatim uploaded resume text (paste of the file the user uploaded). */
	resumeText: string;
	/** Optional structured corrections; wins over anything derived. */
	profile?: Record<string, unknown>;
	/** Optional display name for the User row; never parsed from the resume. */
	displayName?: string;
	/** Opt-in Prisma mirror write; degraded to a note when the client is absent. */
	dbWrite?: boolean;
}

export interface SetupProfilePlan {
	ok: true;
	profile: Profile;
	resumeHash: string;
	notes: string[];
	warnings: string[];
	dbNote: string;
}

export interface SetupProfileFailure {
	ok: false;
	error: string;
}

export type SetupProfileOutcome = SetupProfilePlan | SetupProfileFailure;

/** Fields still holding placeholder defaults after setup; the caller should fill them. */
export function placeholderFields(profile: Profile): string[] {
	const missing: string[] = [];
	if (profile.name.startsWith("[")) missing.push("name");
	if (profile.location.startsWith("[")) missing.push("location");
	if ((profile.skills ?? []).length === 0) missing.push("skills");
	if ((profile.domains ?? []).length === 0) missing.push("domains");
	if ((profile.preferences?.targetRoles ?? []).length === 0) missing.push("targetRoles");
	if ((profile.experience ?? []).length === 0) missing.push("experience");
	if (!profile.email) missing.push("email");
	return missing;
}

export function planSetupProfile(input: SetupProfileInput): SetupProfileOutcome {
	const resumeText = (input.resumeText ?? "").trim();
	if (!resumeText) {
		return { ok: false, error: "Provide resumeText (paste of the uploaded resume); nothing was stored." };
	}
	let override: Record<string, unknown> = {};
	if (input.profile !== undefined) {
		if (typeof input.profile !== "object" || input.profile === null || Array.isArray(input.profile)) {
			return { ok: false, error: "profile must be an object of Profile fields; nothing was stored." };
		}
		override = input.profile;
	}
	let profile: Profile;
	try {
		profile = parseProfile({ ...DEFAULT_PROFILE, ...override });
	} catch {
		return { ok: false, error: "profile override failed validation; nothing was stored." };
	}
	const resumeHash = hashText(resumeText);
	const notes = [
		`Resume held (${resumeText.length} chars, sha1 ${resumeHash.slice(0, 8)}); profile validated against ${Object.keys(override).length} override field(s).`,
		"Tools load this stored profile for the authenticated caller; run setup again to update it.",
	];
	const missing = placeholderFields(profile);
	const warnings =
		missing.length > 0
			? [`Unset after setup: ${missing.join(", ")}; pass them in profile.`]
			: [];
	return {
		ok: true,
		profile,
		resumeHash,
		notes,
		warnings,
		dbNote: input.dbWrite
			? "Mirror write requested; the tool upserts the Prisma Profile row for the current user when the database is available, else reports honestly."
			: "No mirror write requested; the host owns persistence.",
	};
}
