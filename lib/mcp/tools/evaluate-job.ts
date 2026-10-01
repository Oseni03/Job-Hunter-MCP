import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/server";

import { evaluateJob } from "@/lib/evaluate.ts";
import { getFetchCache, setFetchCache } from "@/lib/fetch-cache.ts";
import { fetchPosting } from "@/lib/fetch-posting.ts";
import { refineEvaluation } from "@/lib/llm.ts";
import { resolveProfile } from "@/lib/profile.ts";
import { researchCompany } from "@/lib/research-company.ts";
import { EvaluateJobInput, EvaluationSchema } from "@/lib/mcp/schemas.ts";
import { renderMarkdown } from "@/lib/mcp/render.ts";
import { makeSamplingSender } from "@/lib/mcp/sampling.ts";

export function registerEvaluateJob(server: McpServer): void {
	server.registerTool(
		"evaluate-job",
		{
			title: "Evaluate job fit",
			description:
				"Eligibility + Language gates, five-dimension weighted score, verdict, strengths, gaps, recommendation, and employer-call advice for one posting. Posting text preferred; URL fallback fetches with escalation. Refinement privacy: host-model sampling keeps data on-machine; Groq (only when GROQ_API_KEY is set) sends the posting plus full profile JSON to a third party — set llm.mode off to keep the heuristic scaffold with no network.",
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
				const target = input.postingUrl as string;
				const cached = getFetchCache(target);
				if (cached?.ok && cached.text) {
					postingText = cached.text;
					fetchSteps = [...cached.steps, "cache-hit"];
				} else if (cached && !cached.ok) {
					return {
						isError: true,
						content: [
							{
								type: "text" as const,
								text: `Posting genuinely unavailable (cached ${cached.steps.join(" > ")}). Transient failure, never invented content.`,
							},
						],
					};
				} else {
					const fetched = await fetchPosting(target, {
						company: input.company,
						role: input.role,
					});
					setFetchCache(target, {
						ok: fetched.ok,
						text: fetched.text,
						finalUrl: fetched.finalUrl,
						steps: fetched.steps,
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
}
