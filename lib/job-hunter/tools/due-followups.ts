import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { parseTrackerApplications, planDueFollowups } from "@/lib/job-hunter/followups.ts";
import { DueFollowupsInput, DueFollowupsOutput } from "@/lib/job-hunter/schemas.ts";
import { renderDueFollowupsMarkdown } from "@/lib/job-hunter/render.ts";

export function registerDueFollowups(server: McpServer): void {
	server.registerTool(
		"due-followups",
		{
			title: "Due follow-ups",
			description:
				"Read-only follow-up queue over caller-held applications: open rows untouched for staleDays (default 7) or with a deadline within deadlineWithinDays (default 3), oldest first. Saved rows and final statuses excluded. Accepts structured applications or raw tracker CSV; the server holds no state.",
			inputSchema: DueFollowupsInput,
			outputSchema: DueFollowupsOutput,
			...jobHunterAppMeta(),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
			const applications =
				input.applications && input.applications.length > 0
					? input.applications.map((app) => ({
							jobKey: app.jobKey,
							company: app.company,
							role: app.role,
							status: app.status,
							updatedAt: app.updatedAt ?? null,
							deadline: app.deadline ?? null,
						}))
					: parseTrackerApplications(input.trackerText ?? "");
			const plan = planDueFollowups(applications, {
				staleDays: input.staleDays,
				deadlineWithinDays: input.deadlineWithinDays,
				limit: input.limit,
				today: input.today,
			});
			return {
				content: [{ type: "text" as const, text: renderDueFollowupsMarkdown(plan) }],
				structuredContent: { ...plan },
			};
		},
	);
}
