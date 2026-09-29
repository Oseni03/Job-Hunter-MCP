import { join } from "node:path";

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";

import { verifyBearerToken } from "@/lib/auth";
import { evaluateJob } from "@/lib/evaluate";
import type { Evaluation } from "@/lib/evaluate";
import { fetchPosting } from "@/lib/fetch-posting";
import { refineEvaluation } from "@/lib/llm";
import type { RefinementSource, SamplingSender } from "@/lib/llm";
import { ProfileSchema, resolveProfile } from "@/lib/profile";
import { researchCompany } from "@/lib/research-company";

const EvaluateJobInput = z
	.object({
		postingText: z
			.string()
			.min(1)
			.optional()
			.describe("Full posting text, pasted by the caller (preferred input)"),
		postingUrl: z.string().url().optional().describe("Posting URL to fetch when no text is pasted"),
		company: z.string().min(1).optional().describe("Employer name (drives employer-site search and research)"),
		role: z.string().min(1).optional().describe("Role title (drives employer-site search)"),
		companyUrl: z.string().url().optional().describe("Official company site override for research"),
		profile: ProfileSchema.partial()
			.optional()
			.describe("Per-call profile override; replaces the embedded default field by field"),
		llm: z
			.object({
				mode: z.enum(["auto", "off"]).default("auto"),
				model: z.string().min(1).optional().describe("Groq model override (sampling uses the host model)"),
			})
			.strict()
			.optional()
			.describe("LLM refinement: sampling, then Groq, then heuristic scaffold unchanged"),
	})
	.strict();

const GateSchema = z.object({
	verdict: z.string(),
	quote: z.string().optional(),
	note: z.string(),
});

const EvaluationSchema = z
	.object({
		scored: z.boolean(),
		eligibility: GateSchema,
		languageGate: GateSchema,
		dimensions: z.array(
			z.object({
				dimension: z.string(),
				score: z.number().nullable(),
				status: z.string().optional(),
				notes: z.string(),
			}),
		),
		overallScore: z.number().nullable(),
		verdict: z.string().nullable(),
		strengths: z.array(z.string()),
		gaps: z.array(z.string()),
		recommendation: z.string(),
		shouldCallEmployer: z.object({ suggest: z.boolean(), reason: z.string() }),
		needsConfirmation: z.literal(true),
		deadline: z.string().nullable(),
		source: z.string(),
		archive: z.string(),
		companyResearch: z.object({
			cached: z.boolean(),
			cacheFile: z.string(),
			websiteUrl: z.string().nullable(),
			websiteNotes: z.string().nullable(),
		}),
		refinement: z.object({
			source: z.enum(["sampling", "groq", "heuristic"]),
			model: z.string().nullable(),
			note: z.string(),
		}),
		fetchSteps: z.array(z.string()),
		discrepancies: z.array(z.string()),
	})
	.strict();

/** Adapts the MCP server's request sender for sampling; null when unavailable. */
function makeSamplingSender(extra: unknown): SamplingSender | null {
	if (typeof extra !== "object" || extra === null) {
		return null;
	}
	const sendRequest = (extra as { sendRequest?: unknown }).sendRequest;
	if (typeof sendRequest !== "function") {
		return null;
	}
	const sender = sendRequest as (
		request: { method: string; params?: Record<string, unknown> },
		schema: z.ZodType,
		options?: { timeout?: number },
	) => Promise<unknown>;
	return (method, params) => sender({ method, params }, z.unknown(), { timeout: 60000 });
}

function renderMarkdown(
	evaluation: Evaluation,
	company: string | undefined,
	role: string | undefined,
	websiteUrl: string | null,
	fetchSteps: string[],
	discrepancies: string[],
	refinement: { source: RefinementSource; model: string | null; note: string },
): string {
	const researchLine = !company
		? "skipped (no company given)"
		: (websiteUrl ?? "attempted, no official site found");
	const lines: string[] = [
		`## Job Fit Evaluation: ${role ?? "Role"} at ${company ?? "Company"}`,
		"",
		"| Dimension | Score | Notes |",
		"|-----------|-------|-------|",
	];
	for (const dim of evaluation.dimensions) {
		const score = dim.score === null ? (dim.status ?? "") : `${dim.score}/100`;
		lines.push(`| ${dim.dimension} | ${score} | ${dim.notes} |`);
	}
	lines.push(
		"",
		`**Overall Score: ${evaluation.overallScore ?? "n/a"}/100** (weighted average of scored dimensions)`,
		"",
		`### Verdict: ${evaluation.verdict ?? "Not scored — a gate failed"}`,
		"",
		"### Key Strengths for This Role",
		...(evaluation.strengths.length > 0 ? evaluation.strengths.map((s) => `- ${s}`) : ["- none identified"]),
		"",
		"### Gaps to Address",
		...(evaluation.gaps.length > 0 ? evaluation.gaps.map((g) => `- ${g}`) : ["- none identified"]),
		"",
		"### Recommendation",
		evaluation.recommendation,
		"",
		"### Gates",
		`- Eligibility: ${evaluation.eligibility.verdict} — ${evaluation.eligibility.quote ?? evaluation.eligibility.note}`,
		`- Language: ${evaluation.languageGate.verdict} — ${evaluation.languageGate.quote ?? evaluation.languageGate.note}`,
		"",
		"### Pre-Application: Call the Employer",
		`- Suggest calling: ${evaluation.shouldCallEmployer.suggest ? "yes" : "no"} — ${evaluation.shouldCallEmployer.reason}`,
		"- needsConfirmation: true (confirm with the candidate before drafting)",
		"",
		"### Meta",
		`- Deadline: ${evaluation.deadline ?? "not stated"}`,
		`- Source: ${evaluation.source}`,
		`- Fetch escalation: ${fetchSteps.join(" > ")}`,
		`- Company research: ${researchLine}`,
		`- Refinement: ${refinement.source}${refinement.model ? ` (${refinement.model})` : ""} — ${refinement.note}`,
	);
	for (const discrepancy of discrepancies) {
		lines.push(`- Discrepancy: ${discrepancy}`);
	}
	return lines.join("\n");
}

const handler = createMcpHandler((server) => {
	server.registerTool(
		"evaluate-job",
		{
			title: "Evaluate job fit",
			description:
				"Eligibility + Language gates, five-dimension weighted score, verdict, strengths, gaps, recommendation, and employer-call advice for one posting. Posting text preferred; URL fallback fetches with escalation.",
			inputSchema: EvaluateJobInput,
			outputSchema: EvaluationSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (input, extra) => {
			if (!input.postingText && !input.postingUrl) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: "Provide postingText (preferred) or postingUrl." }],
				};
			}
			const profile = resolveProfile(input.profile);

			let postingText = input.postingText;
			let fetchSteps = ["pasted-text"];
			let discrepancies: string[] = [];
			if (!postingText) {
				const fetched = await fetchPosting(input.postingUrl as string, {
					company: input.company,
					role: input.role,
				});
				fetchSteps = fetched.steps;
				discrepancies = fetched.discrepancies;
				if (!fetched.ok || !fetched.text) {
					return {
						isError: true,
						content: [
							{
								type: "text" as const,
								text: `Posting genuinely unavailable: ${fetched.steps.join(" > ")}. ${fetched.error ?? ""}`,
							},
						],
					};
				}
				postingText = fetched.text;
			}

			const heuristic = evaluateJob({
				postingText: postingText as string,
				profile,
				source: input.postingUrl ?? "pasted-text",
			});
			const outcome = await refineEvaluation(heuristic, postingText as string, profile, {
				mode: input.llm?.mode ?? "auto",
				groqApiKey: process.env.GROQ_API_KEY || undefined,
				model: input.llm?.model ?? process.env.LLM_MODEL ?? undefined,
				samplingSender: makeSamplingSender(extra),
			});
			const evaluation = outcome.evaluation;
			const refinement = { source: outcome.source, model: outcome.model, note: outcome.note };

			let companyResearch = {
				cached: false,
				cacheFile: "",
				websiteUrl: null as string | null,
				websiteNotes: null as string | null,
			};
			if (input.company) {
				const research = await researchCompany({
					company: input.company,
					cacheDir: join(process.cwd(), "company_research"),
					companyUrl: input.companyUrl,
				});
				companyResearch = {
					cached: research.cached,
					cacheFile: research.cacheFile,
					websiteUrl: research.entry.sources.website?.url ?? null,
					websiteNotes: research.entry.sources.website?.notes ?? null,
				};
			}

			const text = renderMarkdown(
				evaluation,
				input.company,
				input.role,
				companyResearch.websiteUrl,
				fetchSteps,
				discrepancies,
				refinement,
			);
			return {
				content: [{ type: "text" as const, text }],
				structuredContent: { ...evaluation, companyResearch, refinement, fetchSteps, discrepancies },
			};
		},
	);
});

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
	const expected = process.env.MCP_AUTH_TOKEN || undefined;
	if (!verifyBearerToken(bearerToken, expected).authorized) {
		return undefined;
	}
	return { token: bearerToken ?? "local-dev", clientId: "job-hunter-client", scopes: [] };
}

const authed = withMcpAuth(handler, verifyToken, {
	required: Boolean(process.env.MCP_AUTH_TOKEN),
});

export { authed as GET, authed as POST };
