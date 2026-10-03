/**
 * Request-scoped profile resolution: every tool grounds its output in the
 * profile stored for the current authenticated user, never in a per-call
 * payload. Resolution never throws and never fails a call: no identity, no
 * database, no stored row, or a drifted row all degrade to the embedded
 * default profile.
 *
 * Identity channel: the MCP route injects `extra.http.authInfo` (SDK v2
 * shape) on every authenticated path, with `clientId` set to the stable
 * user key. In BetterAuth mode that is the JWT `sub` (the User row id,
 * which is also the Profile row key). Local-dev, static-bearer, and legacy
 * fallback identities carry well-known placeholder ids that never match a
 * User row, so those callers share the embedded default.
 */

import { loadPrismaClient } from "@/lib/db.ts";
import { DEFAULT_PROFILE, rowToProfile, type Profile } from "@/lib/profile.ts";

/** Non-user identities that by construction never own a User row. */
const PLACEHOLDER_IDS = new Set(["", "local-user", "job-hunter-client", "static-bearer", "local-dev"]);

/** Stable user key from the request context, or undefined when anonymous. */
export function userIdFromRequest(extra: unknown): string | undefined {
	if (typeof extra !== "object" || extra === null) {
		return undefined;
	}
	const clientId = (extra as { http?: { authInfo?: { clientId?: unknown } } }).http?.authInfo?.clientId;
	if (typeof clientId !== "string") {
		return undefined;
	}
	const id = clientId.trim();
	if (id === "" || PLACEHOLDER_IDS.has(id)) {
		return undefined;
	}
	return id;
}

/**
 * The caller's stored profile plus whether it came from storage, or the
 * embedded default when there is no identity, no database, no User/Profile
 * row, or the row fails validation.
 */
export async function resolveActiveProfile(extra: unknown): Promise<{ profile: Profile; stored: boolean }> {
	const fallback = { profile: { ...DEFAULT_PROFILE }, stored: false };
	const userId = userIdFromRequest(extra);
	if (!userId) {
		return fallback;
	}
	const client = await loadPrismaClient();
	if (!client) {
		return fallback;
	}
	try {
		const user = await client.user.findUnique({ where: { id: userId }, include: { profile: true } });
		if (!user?.profile) {
			return fallback;
		}
		return { profile: rowToProfile(user.profile as Record<string, unknown>), stored: true };
	} catch {
		return fallback;
	}
}

/** The caller's stored profile, or the embedded default (see resolveActiveProfile). */
export async function loadActiveProfile(extra: unknown): Promise<Profile> {
	return (await resolveActiveProfile(extra)).profile;
}
