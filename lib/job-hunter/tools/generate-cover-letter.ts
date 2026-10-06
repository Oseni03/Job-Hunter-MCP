import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { loadActiveProfile } from "@/lib/job-hunter/request-profile.ts";
import { buildCoverLetter } from "@/lib/job-hunter/tailor.ts";
import { documentSignals } from "@/lib/job-hunter/verify.ts";
import { CoverInput, CoverOutput } from "@/lib/job-hunter/schemas.ts";

export function registerGenerateCoverLetter(server: McpServer): void {
	server.registerTool(
		"generate-cover-letter",
		{
			title: "Generate cover letter",
			description:
				"Drafts the cover.cls cover letter for one posting: forward-looking task-solving, 250-300 words, bullets outside lettercontent. Returns LaTeX source plus file path; the host owns file writes and the xelatex compile (exactly 1 page). EMPTY_SLUG hard error with no TeX when nothing identifies the posting.",
			inputSchema: CoverInput,
			outputSchema: CoverOutput,
			...jobHunterAppMeta(),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input, extra) => {
			const profile = await loadActiveProfile(extra);
			const result = buildCoverLetter({
				...input,
				profile,
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
			const payload = { ...coverStructured, signals };
			return {
				content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
				structuredContent: payload,
			};
		},
	);
}
