/**
 * Canonical descriptive aliases (thin, zero logic fork).
 *
 * Existing `register*` functions keep their original names untouched so
 * unit tests pinning `tools[0].name` stay green. This module re-registers the
 * SAME config+handler under the canonical descriptive name by capturing them
 * through a recording proxy. No handler code is duplicated here.
 */

import type { McpServer } from "@modelcontextprotocol/server";

import { registerEvaluateJob } from "@/lib/mcp/tools/evaluate-job.ts";
import { registerTailorCv } from "@/lib/mcp/tools/tailor-cv.ts";
import { registerWriteCoverLetter } from "@/lib/mcp/tools/write-cover-letter.ts";
import { registerRecordApplication } from "@/lib/mcp/tools/record-application.ts";
import { registerPrepInterview } from "@/lib/mcp/tools/prep-interview.ts";
import { registerPortalFields } from "@/lib/mcp/tools/portal-fields.ts";

type RegisterFn = (server: McpServer) => void;

interface Captured {
	name: string;
	config: Record<string, unknown>;
	handler: unknown;
}

function capture(register: RegisterFn): Captured {
	const captured: Captured[] = [];
	const proxy = {
		registerTool(name: string, config: unknown, handler: unknown) {
			captured.push({ name, config: config as Record<string, unknown>, handler });
		},
	} as unknown as McpServer;
	register(proxy);
	if (captured.length === 0 || !captured[0]) {
		throw new Error("Alias capture found no tool registration.");
	}
	return captured[0];
}

/** Re-registers the captured tool under `canonical`, keeping the original title unless overridden. */
function alias(server: McpServer, register: RegisterFn, canonical: string): void {
	const { config, handler } = capture(register);
	server.registerTool(
		canonical,
		config as Parameters<McpServer["registerTool"]>[1],
		handler as Parameters<McpServer["registerTool"]>[2],
	);
}

export const CANONICAL_ALIASES: { canonical: string; legacy: string }[] = [
	{ canonical: "analyze-job", legacy: "evaluate-job" },
	{ canonical: "tailor-resume", legacy: "tailor-cv" },
	{ canonical: "generate-cover-letter", legacy: "write-cover-letter" },
	{ canonical: "track-application", legacy: "record-application" },
	{ canonical: "prepare-interview", legacy: "prep-interview" },
	{ canonical: "draft-application-answers", legacy: "portal-fields" },
];

/** Registers all six canonical aliases alongside the legacy names. */
export function registerCanonicalAliases(server: McpServer): void {
	alias(server, registerEvaluateJob, "analyze-job");
	alias(server, registerTailorCv, "tailor-resume");
	alias(server, registerWriteCoverLetter, "generate-cover-letter");
	alias(server, registerRecordApplication, "track-application");
	alias(server, registerPrepInterview, "prepare-interview");
	alias(server, registerPortalFields, "draft-application-answers");
}
