import assert from "node:assert/strict";
import test from "node:test";

import { getServerResource } from "@/lib/auth.ts";

test("job-hunter resource uses MCP_PUBLIC_URL verbatim when configured", () => {
	const env = { MCP_PUBLIC_URL: "https://mcp.example.com/job-hunter/mcp" };
	assert.equal(getServerResource("job-hunter", env), "https://mcp.example.com/job-hunter/mcp");
});

test("job-hunter resource defaults to /job-hunter/mcp on the deployment origin", () => {
	const bare: Record<string, string | undefined> = {};
	assert.equal(getServerResource("job-hunter", bare), "http://localhost:3000/job-hunter/mcp");
	const vercel = { VERCEL_URL: "deploy.vercel.app" };
	assert.equal(getServerResource("job-hunter", vercel), "https://deploy.vercel.app/job-hunter/mcp");
});

test("later servers get their own explicit path on the same domain", () => {
	const env = { MCP_PUBLIC_URL: "https://mcp.example.com/job-hunter/mcp" };
	const newsletters = getServerResource("newsletters", env);
	assert.equal(newsletters, "https://mcp.example.com/newsletters/mcp");
	assert.notEqual(newsletters, getServerResource("job-hunter", env));
});
