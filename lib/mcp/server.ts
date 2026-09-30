import { createMcpHandler } from "mcp-handler";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";

import { verifyBearerToken } from "@/lib/auth.ts";
import { registerEvaluateJob } from "@/lib/mcp/tools/evaluate-job.ts";
import { registerTailorCv } from "@/lib/mcp/tools/tailor-cv.ts";
import { registerWriteCoverLetter } from "@/lib/mcp/tools/write-cover-letter.ts";
import { registerRecordApplication } from "@/lib/mcp/tools/record-application.ts";
import { registerPrepInterview } from "@/lib/mcp/tools/prep-interview.ts";
import { registerCareerStrategy } from "@/lib/mcp/tools/career-strategy.ts";
import { registerPortalFields } from "@/lib/mcp/tools/portal-fields.ts";
import { registerRankJobs } from "@/lib/mcp/tools/rank-jobs.ts";
import { registerSearchJobs } from "@/lib/mcp/tools/search-jobs.ts";
import { getPrompt, getResource, listPrompts, listResources } from "@/lib/resources.ts";

export function registerAllTools(server: McpServer): void {
	registerEvaluateJob(server);
	registerTailorCv(server);
	registerWriteCoverLetter(server);
	registerRecordApplication(server);
	registerPrepInterview(server);
	registerCareerStrategy(server);
	registerPortalFields(server);
	registerRankJobs(server);
	registerSearchJobs(server);
}

/**
 * Versioned resources and prompts (ticket 06). Private server defaults;
 * per-call overrides are served by the tools that accept them, while the
 * resources themselves always serve the embedded defaults.
 */
export function registerAllResources(server: McpServer): void {
	for (const descriptor of listResources()) {
		server.registerResource(
			descriptor.name,
			descriptor.uri,
			{
				title: `${descriptor.title} (v${descriptor.version})`,
				description: descriptor.description,
				mimeType: descriptor.mimeType,
			},
			async (uri) => {
				const read = getResource(descriptor.uri);
				const text = read.ok ? read.text : read.error;
				return {
					contents: [{ uri: uri.href, mimeType: descriptor.mimeType, text }],
				};
			},
		);
	}
	for (const descriptor of listPrompts()) {
		server.registerPrompt(
			descriptor.name,
			{
				title: `${descriptor.title} (v${descriptor.version})`,
				description: descriptor.description,
			},
			async () => {
				const read = getPrompt(descriptor.name);
				const text = read.ok ? read.text : read.error;
				return {
					messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
				};
			},
		);
	}
}

export function buildMcpHandler(): (req: Request) => Promise<Response> {
	return createMcpHandler((server) => {
		registerAllTools(server);
		registerAllResources(server);
	});
}

export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
	const expected = process.env.MCP_AUTH_TOKEN || undefined;
	if (!verifyBearerToken(bearerToken, expected).authorized) {
		return undefined;
	}
	return { token: bearerToken ?? "local-dev", clientId: "job-hunter-client", scopes: [] };
}

export function isMcpAuthRequired(): boolean {
	return Boolean(process.env.MCP_AUTH_TOKEN);
}
