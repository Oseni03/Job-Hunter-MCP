import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { planRecordApplication } from "@/lib/job-hunter/record.ts";
import { RecordApplicationInput, RecordApplicationOutput } from "@/lib/job-hunter/schemas.ts";

export function registerTrackApplication(server: McpServer): void {
	server.registerTool(
		"track-application",
		{
			title: "Track application",
			description:
				"Records two finished documents to the tracker with match-then-update (posting URL first, then normalized company+role with legal-suffix tolerance): appends a drafted row on no match or all-final matches, otherwise refreshes the open row without moving status backwards. Cells are spreadsheet-injection neutralized and newline-free; returns the full tracker text plus the verbatim posting archive payload and the input tracker hash. The host passes its local day as today and writes only if the file still matches the hash; the host owns file writes and never touches seen_jobs.json.",
			inputSchema: RecordApplicationInput,
			outputSchema: RecordApplicationOutput,
			...jobHunterAppMeta(),
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
				content: [{ type: "text" as const, text: JSON.stringify(recordStructured, null, 2) }],
				structuredContent: recordStructured,
			};
		},
	);
}
