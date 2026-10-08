import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";

/**
 * MCP App surface for the job-hunter server (ext-apps 2.x).
 *
 * One shared UI resource (single-file bundle) referenced by every data tool
 * via `jobHunterAppMeta()`. When any tool returns, a UI-capable host renders
 * the bundle and forwards that call's arguments plus result; the app routes
 * to that tool's own view (one per tool, unique to its output — there is no
 * universal tool UI), with the tool's markdown text as the Details section.
 * Next-step buttons invoke MCP tools via `callServerTool`, never external
 * actions. Text-only hosts are unaffected: they ignore `_meta` and keep the
 * `content` fallback every tool already returns.
 *
 * CSP: the bundle is fully self-contained (system fonts, inlined assets, no
 * fetch, no storage), so no custom `connectDomains`/`resourceDomains` are
 * declared. Every external origin would need listing here; there are none.
 */

export const JOB_HUNTER_APP_RESOURCE_URI = "ui://job-hunter/dashboard.html";
export const JOB_HUNTER_APP_TITLE = "Job Hunter Dashboard";

/**
 * UI metadata shared by every job-hunter data tool. Spread into any
 * `registerTool` config. Both the modern (`ui.resourceUri`) and the legacy
 * (`ui/resourceUri`) keys are set, mirroring `registerAppTool`
 * normalization, so older hosts render the dashboard too.
 */
export function jobHunterAppMeta(): {
	_meta: { ui: { resourceUri: string }; "ui/resourceUri": string };
} {
	return {
		_meta: {
			ui: { resourceUri: JOB_HUNTER_APP_RESOURCE_URI },
			"ui/resourceUri": JOB_HUNTER_APP_RESOURCE_URI,
		},
	};
}

function missingBundleHtml(looked: string[]): string {
	const lines = [
		"<!doctype html>",
		"<html lang='en'><head><meta charset='utf-8'><title>Job Hunter Dashboard</title></head>",
		"<body style='font-family:system-ui,sans-serif;padding:24px'>",
		"<h1>Job Hunter Dashboard</h1>",
		"<p>The dashboard bundle has not been built yet, so there is nothing interactive to show.</p>",
		`<p>Run <code>npm run build:ui</code> to generate <code>public/mcp-app/mcp-app.html</code> (looked for: ${looked.join(", ") || "nothing"}). Text results above still work; nothing was guessed.</p>`,
		"</body></html>",
	];
	return lines.join("\n");
}

/**
 * Reads the Vite singlefile bundle. Missing output degrades to an explicit
 * error page, never a guess, mirroring the server's resource conventions.
 */
export async function readJobHunterAppHtml(): Promise<{ html: string; path: string | null }> {
	const override = (process.env["MCP_APP_HTML_PATH"] ?? "").trim();
	const relatives = [override, "public/mcp-app/mcp-app.html"].filter((entry) => entry !== "");
	const absolute = relatives.map((relative) => join(process.cwd(), relative));
	for (const path of absolute) {
		try {
			const html = await readFile(path, "utf-8");
			if (html.trim() !== "") {
				return { html, path };
			}
		} catch {
			// Try the next candidate; the explicit error page names every path.
		}
	}
	return { html: missingBundleHtml(absolute), path: null };
}

export function registerJobHunterAppResource(server: McpServer): void {
	registerAppResource(
		server,
		JOB_HUNTER_APP_TITLE,
		JOB_HUNTER_APP_RESOURCE_URI,
		{
			description:
				"Interactive job-hunter results views (single-file bundle). Every data tool references it; it routes to the calling tool's own view over its structured output plus its markdown text, with next steps invoking MCP tools.",
		},
		async () => {
			const read = await readJobHunterAppHtml();
			return {
				contents: [
					{
						uri: JOB_HUNTER_APP_RESOURCE_URI,
						mimeType: RESOURCE_MIME_TYPE,
						text: read.html,
					},
				],
			};
		},
	);
}
