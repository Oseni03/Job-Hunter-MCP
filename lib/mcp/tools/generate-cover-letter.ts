import type { McpServer } from "@modelcontextprotocol/server";

import { resolveProfile } from "@/lib/profile.ts";
import { buildCoverLetter } from "@/lib/tailor.ts";
import { documentSignals } from "@/lib/verify.ts";
import { CoverInput, CoverOutput } from "@/lib/mcp/schemas.ts";
import { renderCoverMarkdown } from "@/lib/mcp/render.ts";

export function registerGenerateCoverLetter(server: McpServer): void {
	server.registerTool(
		"generate-cover-letter",
		{
			title: "Generate cover letter",
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
			const signals = documentSignals("letter", result.tex, {
				language: input.postingLanguage ?? "en",
				sections: [],
			});
			return {
				content: [{ type: "text" as const, text: renderCoverMarkdown({ ...result, signals }) }],
				structuredContent: { ...coverStructured, signals },
			};
		},
	);
}
