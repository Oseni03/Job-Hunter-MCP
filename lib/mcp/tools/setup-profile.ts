import type { McpServer } from "@modelcontextprotocol/server";

import { planSetupProfile } from "@/lib/setup-profile.ts";
import { SetupProfileInput, SetupProfileOutput } from "@/lib/mcp/schemas.ts";
import { renderSetupProfileMarkdown } from "@/lib/mcp/render.ts";

export function registerSetupProfile(server: McpServer): void {
	server.registerTool(
		"setup-profile",
		{
			title: "Setup profile",
			description:
				"Builds the validated per-user profile from the uploaded resume text plus optional structured corrections. Returns the profile, resume hash, and storage note; the host owns persistence (Prisma Profile mirror when dbWrite is set). Per-call profile overrides still win field by field.",
			inputSchema: SetupProfileInput,
			outputSchema: SetupProfileOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
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
			const { ok: _setupOk, ...setupStructured } = result;
			return {
				content: [{ type: "text" as const, text: renderSetupProfileMarkdown(result) }],
				structuredContent: setupStructured,
			};
		},
	);
}
