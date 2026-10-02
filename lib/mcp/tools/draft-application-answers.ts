import type { McpServer } from "@modelcontextprotocol/server";

import { planPortalFields } from "@/lib/fields.ts";
import { PortalFieldsInput, PortalFieldsOutput } from "@/lib/mcp/schemas.ts";
import { renderFieldsMarkdown } from "@/lib/mcp/render.ts";

export function registerDraftApplicationAnswers(server: McpServer): void {
	server.registerTool(
		"draft-application-answers",
		{
			title: "Draft application answers",
			description:
				"Drafts portal form fields from caller-held facts only: per-role-type self-introductions with strongest evidence first and a stated word count plus trim note, project entries in the 100-150 band with a 60-word short (soft target — overshoot warns, never truncates) and scoped ownership, and 4-6 counted character pitches marked as expansion seeds with a recommended mapping. Returns one copy-paste file with counts, short variants, and a validated dates reference — internal scope notes stay in structured output, never in the copy text. The copy-paste file is an ephemeral scratch (overwritten per use; never a record — never cite it as application history); the host owns the save. Every claim traces to the profile union, shortfalls and in-progress work are stated, never padded.",
			inputSchema: PortalFieldsInput,
			outputSchema: PortalFieldsOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
			const result = planPortalFields({
				profile: input.profile,
				company: input.company,
				employerPoints: input.employerPoints,
				experience: input.experience,
				projects: input.projects,
				roleTypes: input.roleTypes,
				targetWords: input.targetWords,
				pitchContexts: input.pitchContexts,
				masterCvText: input.masterCvText,
				workspaceProfileText: input.workspaceProfileText,
				cvText: input.cvText,
				coverText: input.coverText,
				postingLanguage: input.postingLanguage,
			});
			return {
				content: [{ type: "text" as const, text: renderFieldsMarkdown(result) }],
				structuredContent: result,
			};
		},
	);
}
