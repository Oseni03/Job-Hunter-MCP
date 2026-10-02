import { createMcpHandler } from "mcp-handler";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";

import { oauthConfigFromEnv, oauthRequiredScopesFromEnv, verifyMcpAuth } from "@/lib/oauth.ts";
import { registerAnalyzeJob } from "@/lib/mcp/tools/analyze-job.ts";
import { registerTailorResume } from "@/lib/mcp/tools/tailor-resume.ts";
import { registerGenerateCoverLetter } from "@/lib/mcp/tools/generate-cover-letter.ts";
import { registerTrackApplication } from "@/lib/mcp/tools/track-application.ts";
import { registerPrepareInterview } from "@/lib/mcp/tools/prepare-interview.ts";
import { registerCareerStrategy } from "@/lib/mcp/tools/career-strategy.ts";
import { registerDraftApplicationAnswers } from "@/lib/mcp/tools/draft-application-answers.ts";
import { registerRankJobs } from "@/lib/mcp/tools/rank-jobs.ts";
import { registerResearchCompany } from "@/lib/mcp/tools/research-company.ts";
import { registerSearchJobs } from "@/lib/mcp/tools/search-jobs.ts";
import { registerSetupProfile } from "@/lib/mcp/tools/setup-profile.ts";
import { registerDueFollowups } from "@/lib/mcp/tools/due-followups.ts";
import { getPrompt, getResource, listPrompts, listResources } from "@/lib/resources.ts";

export function registerAllTools(server: McpServer): void {
	registerAnalyzeJob(server);
	registerTailorResume(server);
	registerGenerateCoverLetter(server);
	registerTrackApplication(server);
	registerPrepareInterview(server);
	registerCareerStrategy(server);
	registerDraftApplicationAnswers(server);
	registerRankJobs(server);
	registerResearchCompany(server);
	registerSearchJobs(server);
	registerSetupProfile(server);
	registerDueFollowups(server);
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
	// Never log bearerToken: 401s carry only the generic challenge while the
	// specific error code stays server-side inside the decision. Auth is
	// deliberately decoupled from `Mcp-Session-Id` — the same token validates
	// across sessions and rotation is purely JWKS-driven.
	const decision = await verifyMcpAuth(bearerToken, {
		expectedToken: process.env.MCP_AUTH_TOKEN || undefined,
		oauth: oauthConfigFromEnv(),
		requiredScopes: oauthRequiredScopesFromEnv(),
		expectedResource: mcpPublicResource(),
	});
	if (!decision.authorized) {
		return undefined;
	}
	return {
		token: bearerToken ?? "local-dev",
		clientId: decision.sub ?? "job-hunter-client",
		scopes: decision.scopes,
	};
}

/** Least-privilege scopes enforced on /mcp (default `mcp:tools`; see `OAUTH_REQUIRED_SCOPES`). */
export function mcpRequiredScopes(): string[] {
	return oauthRequiredScopesFromEnv();
}

/** Full public resource URL (`MCP_PUBLIC_URL`) used as the audience fallback when `OAUTH_AUDIENCE` is unset. */
export function mcpPublicResource(): string | undefined {
	const raw = (process.env["MCP_PUBLIC_URL"] ?? "").trim().replace(/\/+$/, "");
	return raw || undefined;
}

/**
 * Legacy path only: whether the static/external-issuer branch enforces auth.
 * Better Auth mode (Postgres DATABASE_URL) always requires auth regardless
 * of this helper — but that branch never reaches `legacyProtected`, so this
 * stays scoped to the legacy fallback by design.
 */
export function isMcpAuthRequired(): boolean {
	return Boolean(process.env.MCP_AUTH_TOKEN || process.env.OAUTH_ISSUER);
}

/**
 * Public origin for the RFC 9728 challenge: MCP_PUBLIC_URL's origin when
 * the deployment sets it (proxies hide the internal origin), otherwise
 * undefined so the adapter derives it from the request.
 */
export function mcpPublicOrigin(): string | undefined {
	const raw = (process.env["MCP_PUBLIC_URL"] ?? "").trim();
	if (!raw) {
		return undefined;
	}
	try {
		return new URL(raw).origin;
	} catch {
		return undefined;
	}
}
