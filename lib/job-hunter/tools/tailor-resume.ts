import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { loadPrismaClient } from "@/lib/db.ts";
import { sectionHeadings } from "@/lib/job-hunter/latex.ts";
import { loadActiveProfile, userIdFromRequest } from "@/lib/job-hunter/request-profile.ts";
import {
	buildResumeVerification,
	buildResumeVersionRecord,
	buildTailorEventNote,
	logTailorEvent,
	saveResumeVersion,
	tailorInputHash,
} from "@/lib/job-hunter/resume-version.ts";
import { buildTailoredCv } from "@/lib/job-hunter/tailor.ts";
import { documentSignals } from "@/lib/job-hunter/verify.ts";
import { TailorCvInput, TailorCvOutput } from "@/lib/job-hunter/schemas/tailor-resume.ts";

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
			const started = Date.now();
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
			const verification = buildResumeVerification({
				coverage: result.coverage,
				draftDrift: result.warnings.draftDrift,
				latexSafetyPassed: signals.latexSafety.passed,
			});
			const payload: Record<string, unknown> = { ...cvStructured, signals, verification };
			// Best-effort observability (ticket 03): store the version and
			// leave a redacted EventLog entry. Anonymous callers and
			// database-less hosts skip silently; observability never fails
			// a tailoring call.
			try {
				const userId = userIdFromRequest(extra);
				const client = await loadPrismaClient();
				if (userId && client) {
					const built = buildResumeVersionRecord({
						userId,
						jobKey: result.slug,
						tex: result.tex,
						verification,
					});
					const stored = built.ok
						? await saveResumeVersion(client, built.record)
						: { persisted: false as const, reason: built.error };
					if (stored.persisted && stored.id !== undefined) {
						payload["versionId"] = stored.id;
					}
					await logTailorEvent(client, {
						userId,
						ok: true,
						ms: Date.now() - started,
						note: buildTailorEventNote({
							slug: result.slug,
							verification,
							driftCount: result.warnings.draftDrift.length,
							stretchCount: result.warnings.stretchChoices.length,
							stored: stored.persisted,
						}),
						inputHash: tailorInputHash(input.postingText),
						outputRef: stored.id !== undefined ? `resume-version:${stored.id}` : result.slug,
					});
				}
			} catch {
				// Observability is best-effort; the tailored draft still returns.
			}
			return {
				content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
				structuredContent: payload,
			};
		},
	);
}
