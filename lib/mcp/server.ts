import { createMcpHandler } from "mcp-handler";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";

import { verifyBearerToken } from "@/lib/auth";
import { registerEvaluateJob } from "@/lib/mcp/tools/evaluate-job";
import { registerTailorCv } from "@/lib/mcp/tools/tailor-cv";
import { registerWriteCoverLetter } from "@/lib/mcp/tools/write-cover-letter";
import { registerRecordApplication } from "@/lib/mcp/tools/record-application";
import { registerPrepInterview } from "@/lib/mcp/tools/prep-interview";
import { registerCareerStrategy } from "@/lib/mcp/tools/career-strategy";
import { registerPortalFields } from "@/lib/mcp/tools/portal-fields";

export function registerAllTools(server: McpServer): void {
	registerEvaluateJob(server);
	registerTailorCv(server);
	registerWriteCoverLetter(server);
	registerRecordApplication(server);
	registerPrepInterview(server);
	registerCareerStrategy(server);
	registerPortalFields(server);
}

export function buildMcpHandler(): (req: Request) => Promise<Response> {
	return createMcpHandler((server) => {
		registerAllTools(server);
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
