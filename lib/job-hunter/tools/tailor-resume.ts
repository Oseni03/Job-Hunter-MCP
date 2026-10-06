import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { sectionHeadings } from "@/lib/job-hunter/latex.ts";
import { loadActiveProfile } from "@/lib/job-hunter/request-profile.ts";
import { buildTailoredCv } from "@/lib/job-hunter/tailor.ts";
import { documentSignals } from "@/lib/job-hunter/verify.ts";
import { TailorCvInput, TailorCvOutput } from "@/lib/job-hunter/schemas.ts";
import { renderTailoredCvMarkdown } from "@/lib/job-hunter/render.ts";

export function registerTailorResume(server: McpServer): void {
	server.registerTool(
		"tailor-resume",
		{
			title: "Tailor resume",
			description:
				"Tailors the moderncv banking CV to one posting: profile statement, 5-7 competencies, relevance-ordered bullets, role-type section order. Returns LaTeX source plus file path; the host owns file writes and the lualatex compile (exactly 2 pages). EMPTY_SLUG hard error with no TeX when nothing identifies the posting.",
			inputSchema: TailorCvInput,
			outputSchema: TailorCvOutput,
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
			const result = buildTailoredCv({
				...input,
				profile,
			});
			if (!result.ok) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: result.error }],
				};
			}
			const { ok: _cvOk, ...cvStructured } = result;
			const language = input.cvLanguage ?? "en";
			const signals = documentSignals("cv", result.tex, {
				language,
				sections: Object.values(sectionHeadings(language)),
			});
			return {
				content: [{ type: "text" as const, text: renderTailoredCvMarkdown({ ...result, signals }) }],
				structuredContent: { ...cvStructured, signals },
			};
		},
	);
}
