import type { McpServer } from "@modelcontextprotocol/server";

import { planRecordApplication } from "@/lib/record.ts";
import { RecordApplicationInput, RecordApplicationOutput } from "@/lib/mcp/schemas.ts";
import { renderRecordMarkdown } from "@/lib/mcp/render.ts";

export function registerRecordApplication(server: McpServer): void {
	server.registerTool(
		"record-application",
		{
			title: "Record application",
			description:
				"Records two finished documents to the tracker with match-then-update on company and role (case-insensitive): appends a drafted row on no match or all-final matches, otherwise refreshes the open row without moving status backwards. Returns the full tracker text plus the verbatim posting archive payload; the host owns file writes and never touches seen_jobs.json.",
			inputSchema: RecordApplicationInput,
			outputSchema: RecordApplicationOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async (input) => {
			const result = planRecordApplication({
				company: input.company,
				role: input.role,
				sector: input.sector,
				roleType: input.roleType,
				contactPerson: input.contactPerson,
				channel: input.channel,
				portal: input.portal,
				fitScore: input.fitScore,
				cvFile: input.cvFile,
				coverLetterFile: input.coverLetterFile,
				postingUrl: input.postingUrl,
				deadline: input.deadline ?? null,
				postingText: input.postingText,
				trackerText: input.trackerText ?? "",
				today: input.today,
			});
			if (!result.ok) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: result.error }],
				};
			}
			const { ok: _recordOk, ...recordStructured } = result;
			return {
				content: [{ type: "text" as const, text: renderRecordMarkdown(result) }],
				structuredContent: recordStructured,
			};
		},
	);
}
