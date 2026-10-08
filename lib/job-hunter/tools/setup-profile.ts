import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";
import type { Prisma } from "@/generated/prisma/client.ts";

import { prisma } from "@/lib/db.ts";
import { profileToRow, type Profile } from "@/lib/job-hunter/profile.ts";
import { userIdFromRequest } from "@/lib/job-hunter/request-profile.ts";
import { planSetupProfile } from "@/lib/job-hunter/setup-profile.ts";
import { SetupProfileInput, SetupProfileOutput } from "@/lib/job-hunter/schemas/setup-profile.ts";

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/**
 * Server-side persist for the authenticated caller (dbWrite opt-in). The
 * Profile row keys on the BetterAuth User id, so this succeeds exactly
 * when the caller authenticated in BetterAuth mode; every other outcome
 * degrades to an honest note and the host keeps its mirror fallback.
 */
async function persistProfile(userId: string, profile: Profile, resumeHash: string): Promise<string> {
	if (!prisma) {
		return "Database not configured; host owns persistence (mirror the returned profile to the Prisma Profile row).";
	}
	try {
		const row = profileToRow(userId, profile, resumeHash);
		const data = {
			name: row.name,
			location: row.location,
			workCountry: row.workCountry,
			permitClasses: asJson(row.permitClasses),
			languages: asJson(row.languages),
			energizingTasks: asJson(row.energizingTasks),
			drainingTasks: asJson(row.drainingTasks),
			headline: row.headline,
			email: row.email,
			phone: row.phone,
			website: row.website,
			linkedin: row.linkedin,
			github: row.github,
			summary: row.summary,
			experience: asJson(row.experience),
			education: asJson(row.education),
			skills: asJson(row.skills),
			domains: asJson(row.domains),
			projects: asJson(row.projects),
			certifications: asJson(row.certifications),
			preferences: asJson(row.preferences),
			resumeHash: row.resumeHash,
		};
		await prisma.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
		return "Stored server-side for the authenticated caller (Prisma Profile row upserted).";
	} catch {
		return "Database write failed (no User row for this identity, or the database is unreachable); host owns persistence.";
	}
}

export function registerSetupProfile(server: McpServer): void {
	server.registerTool(
		"setup-profile",
		{
			title: "Setup profile",
			description:
				"Builds the validated per-user profile from the uploaded resume text plus optional structured corrections. Returns the profile, resume hash, and storage note; persists server-side to the caller's Profile row when dbWrite is set. Tools load the stored profile; run setup again to update it.",
			inputSchema: SetupProfileInput,
			outputSchema: SetupProfileOutput,
			...jobHunterAppMeta(),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input, extra) => {
			const result = planSetupProfile({
				resumeText: input.resumeText,
				profile: input.profile as Record<string, unknown> | undefined,
				displayName: input.displayName,
				dbWrite: input.dbWrite,
			});
			if (!result.ok) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: result.error }],
				};
			}
			let dbNote = result.dbNote;
			if (input.dbWrite) {
				const userId = userIdFromRequest(extra);
				dbNote = userId
					? await persistProfile(userId, result.profile, result.resumeHash)
					: "No authenticated user on this request; host owns persistence (mirror the returned profile to the Prisma Profile row).";
			}
			const { ok: _setupOk, ...setupStructured } = { ...result, dbNote };
			return {
				content: [{ type: "text" as const, text: JSON.stringify(setupStructured, null, 2) }],
				structuredContent: setupStructured,
			};
		},
	);
}
