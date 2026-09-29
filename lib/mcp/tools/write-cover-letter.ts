import type { McpServer } from "@modelcontextprotocol/server";

import { resolveProfile } from "@/lib/profile";
import { buildCoverLetter } from "@/lib/tailor";
import { CoverInput, CoverOutput } from "@/lib/mcp/schemas";
import { renderCoverMarkdown } from "@/lib/mcp/render";

export function registerWriteCoverLetter(server: McpServer): void {
	server.registerTool(
		"write-cover-letter",
		{
			title: "Write cover letter",
			description:
				"Drafts the cover.cls cover letter for one posting: forward-looking task-solving, 250-300 words, bullets outside lettercontent. Returns LaTeX source plus file path; the host owns file writes and the xelatex compile (exactly 1 page). EMPTY_SLUG hard error with no TeX when nothing identifies the posting.",
			inputSchema: CoverInput,
			outputSchema: CoverOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
			const result = buildCoverLetter({
				...input,
				profile: resolveProfile(input.profile),
			});
			if (!result.ok) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: result.error }],
				};
			}
			const { ok: _coverOk, ...coverStructured } = result;
			return {
				content: [{ type: "text" as const, text: renderCoverMarkdown(result) }],
				structuredContent: coverStructured,
			};
		},
	);
}
