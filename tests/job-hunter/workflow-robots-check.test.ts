import assert from "node:assert/strict";
import test from "node:test";

import {
	BROWSER_UA,
	gate,
	hasUndecodableRule,
	isAllowed,
	isRobotsBody,
	main,
	matchPattern,
	parseGroups,
} from "@/host/job-hunter/workflow/robots-check.ts";

test("parseGroups tolerates blank lines, BOM, and agent resets", () => {
	const groups = parseGroups("﻿User-agent: *\n\nDisallow: /private\n\nAllow: /private/ok\n");
	assert.deepEqual(groups.get("*"), [
		{ allow: false, pattern: "/private" },
		{ allow: true, pattern: "/private/ok" },
	]);
	const reset = parseGroups("User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y\n");
	assert.deepEqual(reset.get("a"), [{ allow: false, pattern: "/x" }]);
	assert.deepEqual(reset.get("b"), [{ allow: false, pattern: "/y" }]);
});

test("matchPattern implements RFC 9309 wildcards with lenient decoding", () => {
	assert.equal(matchPattern("/foo", "/foobar"), 4);
	assert.equal(matchPattern("/foo$", "/foobar"), -1);
	assert.equal(matchPattern("/foo$", "/foo"), 5);
	assert.equal(matchPattern("/*.pdf", "/a/b.pdf"), 6);
	assert.equal(matchPattern("/foo%20bar", "/foo bar"), 8);
	assert.equal(matchPattern("", "/x"), -1);
	assert.equal(matchPattern("/100%", "/100%"), 5);
});

test("isAllowed applies longest-match, ties to Disallow, agent over star", () => {
	const body = "User-agent: *\nDisallow: /\nAllow: /public\nDisallow: /public/no\n";
	assert.equal(isAllowed(body, "*", "/public/yes"), true);
	assert.equal(isAllowed(body, "*", "/public/no"), false);
	assert.equal(isAllowed(body, "*", "/other"), false);
	const tie = "User-agent: *\nAllow: /x\nDisallow: /x\n";
	assert.equal(isAllowed(tie, "*", "/x"), false);
	const specific = "User-agent: Claude-User\nDisallow: /a\nUser-agent: *\nAllow: /\n";
	assert.equal(isAllowed(specific, "Claude-User", "/a"), false);
	assert.equal(isAllowed(specific, "other", "/a"), true);
	assert.equal(isAllowed("User-agent: *\n", "*", "/anything"), true);
});

test("isRobotsBody rejects soft-200 HTML but accepts empty policies", () => {
	assert.equal(isRobotsBody(""), true);
	assert.equal(isRobotsBody("   \n  "), true);
	assert.equal(isRobotsBody("User-agent: *\nDisallow: /"), true);
	assert.equal(isRobotsBody("<html><body>Not found</body></html>"), false);
	assert.equal(isRobotsBody("# just a comment"), false);
	assert.equal(isRobotsBody("﻿User-agent: *\n"), true);
});

test("hasUndecodableRule fires only on rule fields", () => {
	assert.equal(hasUndecodableRule("User-agent: *\nDisallow: /caf\uFFFDx\n"), true);
	assert.equal(hasUndecodableRule("# \uFFFD comment\nUser-agent: *\n"), false);
	assert.equal(hasUndecodableRule("User-agent: *\nSitemap: x\uFFFDy\n"), false);
	assert.equal(hasUndecodableRule("User-agent: *\nDisallow: /\n"), false);
});

test("gate allows on 404 and enforces per-agent disallows", () => {
	const notFound = () => ({ body: "", code: 404 });
	assert.deepEqual(gate("https://example.com/jobs/1", notFound), { code: 0, message: "ALLOWED - no robots.txt published" });
	const blocked = () => ({ body: "User-agent: *\nDisallow: /\n", code: 200 });
	assert.equal(gate("https://example.com/jobs/1", blocked).code, 1);
	assert.match(gate("https://example.com/jobs/1", blocked).message, /DISALLOWED/);
	const open = () => ({ body: "User-agent: *\nAllow: /\n", code: 200 });
	assert.deepEqual(gate("https://example.com/jobs/1", open), { code: 0, message: "ALLOWED - robots.txt permits this path" });
});

test("gate stays unconfirmed on failures and soft-200 bodies", () => {
	const down = (): { body: string; code: number } => {
		throw new Error("connect");
	};
	assert.equal(gate("https://example.com/x", down).code, 1);
	assert.match(gate("https://example.com/x", down).message, /UNCONFIRMED/);
	const html = () => ({ body: "<html>nope</html>", code: 200 });
	assert.match(gate("https://example.com/x", html).message, /UNCONFIRMED/);
	const forbidden = () => ({ body: "", code: 403 });
	assert.match(gate("https://example.com/x", forbidden).message, /UNCONFIRMED/);
	assert.equal(gate("not a url", down).code, 1);
});

test("gate checks the path, not just the host", () => {
	const scoped = () => ({ body: "User-agent: *\nDisallow: /jobs\n", code: 200 });
	assert.equal(gate("https://example.com/about", scoped).code, 0);
	assert.equal(gate("https://example.com/jobs/1", scoped).code, 1);
});

test("main rejects wrong arity without touching the network", () => {
	assert.equal(main([]), 2);
	assert.equal(main(["a", "b"]), 2);
	assert.ok(BROWSER_UA.includes("Chrome/"));
});
