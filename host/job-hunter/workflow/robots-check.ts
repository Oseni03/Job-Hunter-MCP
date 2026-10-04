#!/usr/bin/env node
/**
 * Decide whether the browser-header curl retry in 09-web-research.md may run.
 * Ported from tools/robots_check.py (same rules, same exit contract). The
 * retry exists to get past bot-filtering firewalls on sites whose robots.txt
 * permits access. It is never used to override a site that has said no.
 *
 * WebFetch identifies itself as Claude-User and honors robots.txt, so a 403
 * has two very different causes: a WAF default on a site whose published
 * policy allows access, or a site that has actually declined. This tells
 * them apart.
 *
 * Rules (RFC 9309), deliberately cautious: longest-match wins, ties go to
 * Disallow; a Disallow for "*" or "Claude-User" blocks the retry; blank
 * lines never end a record; one leading BOM is skipped; 404 means no
 * published policy (permission); any other read failure leaves permission
 * unconfirmed. Exit 0 = the retry may proceed, 1 = do not retry, 2 = usage.
 *
 *   node host/job-hunter/workflow/robots-check.ts <url>
 */
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const BROWSER_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const KNOWN_FIELDS = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay", "host"]);

function fetchUrl(url: string, ua: string): { body: string; code: number } {
	// curl, not fetch: some hosts hang generic HTTP clients indefinitely
	// while answering curl in under a second, and --max-time is a ceiling.
	// "--" ends option parsing so a dash-led URL is never read as a flag.
	const output = execFileSync(
		"curl",
		["-sS", "-L", "--max-redirs", "5", "--max-time", "12", "-A", ua, "-H", "Accept: text/plain,*/*", "-w", "\n%{http_code}", "--", url],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 },
	) as string;
	const cut = output.lastIndexOf("\n");
	return { body: cut === -1 ? "" : output.slice(0, cut), code: Number(output.slice(cut + 1)) || 0 };
}

/**
 * Does this actually look like a robots.txt? A misconfigured host can
 * answer with 200 and an HTML error page; that parses to zero rules, and
 * zero rules read as allowed — a soft-200 granting ungranted permission.
 * Empty/whitespace bodies ARE valid allow-alls and stay allowed.
 */
export function isRobotsBody(text: string): boolean {
	const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
	if (!body.trim()) return true;
	for (const raw of body.split("\n")) {
		const line = raw.split("#", 1)[0]?.trim().toLowerCase() ?? "";
		if (line.includes(":") && KNOWN_FIELDS.has(line.split(":", 1)[0]?.trim() ?? "")) return true;
	}
	return false;
}

/**
 * Does a User-agent/Allow/Disallow line hold U+FFFD (a byte that was not
 * valid UTF-8)? Such a rule can never match, so it was silently skipped
 * and the path read as allowed: unreadable, not permissive. U+FFFD in a
 * comment or any other field decides nothing.
 */
export function hasUndecodableRule(text: string): boolean {
	const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
	for (const raw of body.split("\n")) {
		const line = (raw.split("#", 1)[0] ?? "");
		if (line.includes("\uFFFD") && line.includes(":")) {
			const field = line.split(":", 1)[0]?.replace(/\uFFFD/g, "").trim().toLowerCase() ?? "";
			if (field === "user-agent" || field === "allow" || field === "disallow") return true;
		}
	}
	return false;
}

type Rule = { allow: boolean; pattern: string };

/**
 * user-agent -> rules, tolerating blank lines inside a record (a strict
 * split drops those rules and fails open) and one leading BOM (which would
 * otherwise hide the first User-agent line and drop its whole group).
 */
export function parseGroups(text: string): Map<string, Rule[]> {
	const groups = new Map<string, Rule[]>();
	const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
	let agents: string[] = [];
	let expectAgents = true;
	const push = (agent: string): Rule[] => {
		let list = groups.get(agent);
		if (!list) {
			list = [];
			groups.set(agent, list);
		}
		return list;
	};
	for (const raw of body.split("\n")) {
		const line = (raw.split("#", 1)[0] ?? "").trim();
		if (!line || !line.includes(":")) continue;
		const cut = line.indexOf(":");
		const field = line.slice(0, cut).trim().toLowerCase();
		const value = line.slice(cut + 1).trim();
		if (field === "user-agent") {
			if (!expectAgents) {
				agents = [];
				expectAgents = true;
			}
			const agent = value.toLowerCase();
			agents.push(agent);
			push(agent);
		} else if ((field === "allow" || field === "disallow") && agents.length > 0) {
			expectAgents = false;
			for (const agent of agents) push(agent).push({ allow: field === "allow", pattern: value });
		}
	}
	return groups;
}

/** Lenient percent-decode: Python's unquote leaves invalid sequences as-is instead of throwing. */
function decodeLenient(text: string): string {
	return text.replace(/%[0-9a-fA-F]{2}/g, (match) => {
		try {
			return decodeURIComponent(match);
		} catch {
			return match;
		}
	});
}

/** RFC 9309 wildcard match; returns the pattern length on match, -1 otherwise. */
export function matchPattern(pattern: string, path: string): number {
	if (pattern === "") return -1;
	const decoded = decodeLenient(pattern);
	let rx = "^";
	for (const char of decoded) {
		if (char === "*") rx += ".*";
		else if (char === "$") rx += "$";
		else rx += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(rx).test(path) ? decoded.length : -1;
}

export function isAllowed(text: string, agent: string, path: string): boolean {
	const groups = parseGroups(text);
	const rules = groups.get(agent.toLowerCase()) ?? groups.get("*") ?? [];
	let best = -1;
	let allow = true;
	for (const rule of rules) {
		const n = matchPattern(rule.pattern, path);
		if (n > best || (n === best && n >= 0 && !rule.allow)) {
			best = n;
			allow = rule.allow;
		}
	}
	return best < 0 ? true : allow;
}

export type GateVerdict = { code: 0 | 1; message: string };

export function gate(
	target: string,
	fetch: (url: string, ua: string) => { body: string; code: number } = fetchUrl,
): GateVerdict {
	let parts: URL;
	try {
		parts = new URL(target);
	} catch {
		return { code: 1, message: "UNCONFIRMED (not a URL) - do not retry, go to step 3" };
	}
	let path = decodeLenient(parts.pathname) || "/";
	if (parts.search) path += parts.search;
	const robots = `${parts.protocol}//${parts.host}/robots.txt`;
	let body: string | null = null;
	let last = "no attempt";
	for (const ua of ["Claude-User", BROWSER_UA]) {
		let result: { body: string; code: number };
		try {
			result = fetch(robots, ua);
		} catch (error) {
			last = (error as Error).name || "fetch failed";
			continue;
		}
		if (result.code === 404) return { code: 0, message: "ALLOWED - no robots.txt published" };
		if (result.code === 200) {
			if (!isRobotsBody(result.body)) {
				last = "HTTP 200 but the body is not a robots.txt";
				continue;
			}
			if (hasUndecodableRule(result.body)) {
				last = "HTTP 200 but a User-agent/Allow/Disallow line is not valid UTF-8";
				continue;
			}
			body = result.body;
			break;
		}
		last = `HTTP ${result.code}`;
	}
	if (body === null) return { code: 1, message: `UNCONFIRMED (${last}) - do not retry, go to step 3` };
	for (const agent of ["Claude-User", "*"]) {
		if (!isAllowed(body, agent, path)) {
			return { code: 1, message: `DISALLOWED for ${agent} - do not retry, go to step 3` };
		}
	}
	return { code: 0, message: "ALLOWED - robots.txt permits this path" };
}

export function main(argv: string[]): number {
	if (argv.length !== 1) {
		process.stderr.write("usage: node host/job-hunter/workflow/robots-check.ts <url>\n");
		return 2;
	}
	const verdict = gate(argv[0] as string);
	process.stdout.write(`${verdict.message}\n`);
	return verdict.code;
}

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (error: unknown) {
		process.stderr.write(`${JSON.stringify({ error: (error as Error).message, code: "error" })}\n`);
		process.exit(1);
	}
}
