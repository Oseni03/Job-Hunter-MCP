import type { McpServer } from "@modelcontextprotocol/server";

import { resolveProfile } from "@/lib/profile";
import { buildTailoredCv } from "@/lib/tailor";
import { TailorCvInput, TailorCvOutput } from "@/lib/mcp/schemas";
import { renderTailoredCvMarkdown } from "@/lib/mcp/render";

export function registerTailorCv(server: McpServer): void {
	server.registerTool(
		"tailor-cv",
		{
			title: "Tailor CV",
			description:
				"Tailors the moderncv banking CV to one posting: profile statement, 5-7 competencies, relevance-ordered bullets, role-type section order. Returns LaTeX source plus file path; the host owns file writes and the lualatex compile (exactly 2 pages). EMPTY_SLUG hard error with no TeX when nothing identifies the posting.",
			inputSchema: TailorCvInput,
			outputSchema: TailorCvOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
			const result = buildTailoredCv({
				...input,
				profile: resolveProfile(input.profile),
			});
			if (!result.ok) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: result.error }],
				};
			}
			const { ok: _cvOk, ...cvStructured } = result;
			return {
				content: [{ type: "text" as const, text: renderTailoredCvMarkdown(result) }],
				structuredContent: cvStructured,
			};
		},
	);
}
