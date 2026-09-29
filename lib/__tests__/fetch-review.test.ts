import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fetchPosting, robotsAllows } from "../fetch-posting.ts";
import type { FetchLike } from "../fetch-posting.ts";

function mockFetch(routes: Record<string, { status: number; body: string }>): {
	fetchImpl: FetchLike;
	calls: string[];
} {
	const calls: string[] = [];
	const fetchImpl: FetchLike = async (url, headers = {}) => {
		void headers;
		calls.push(url);
		return routes[url] ?? { status: 404, body: "not found" };
	};
	return { fetchImpl, calls };
}

const PAGE = (title: string, body: string) =>
	`<html><head><title>${title}</title></head><body><p>${body}</p></body></html>`;

describe("login walls and listing pages (review fixes)", () => {
	it("treats a 200 sign-in wall as a failed fetch and tries employer search", async () => {
		const { fetchImpl } = mockFetch({
			"https://www.linkedin.com/jobs/view/123": {
				status: 200,
				body: PAGE("Sign in | LinkedIn", "Sign in to view this job. Join now to continue."),
			},
			"https://html.duckduckgo.com/html/?q=Acme%20ML%20Engineer": {
				status: 200,
				body: `<a href="https://acme.com/jobs/1?uddg=https%3A%2F%2Facme.com%2Fjobs%2F1">Acme</a>`,
			},
			"https://acme.com/jobs/1": { status: 200, body: PAGE("ML Engineer - Acme", "Python role") },
		});
		const result = await fetchPosting("https://www.linkedin.com/jobs/view/123", {
			fetchImpl,
			company: "Acme",
			role: "ML Engineer",
		});
		assert.equal(result.ok, true);
		assert.equal(result.source, "employer");
		assert.ok(result.steps.includes("login-wall"));
		assert.ok(!(result.text ?? "").includes("Sign in to view"));
	});

	it("flags a direct page whose title does not mention the role", async () => {
		const { fetchImpl } = mockFetch({
			"https://acme.com/careers": { status: 200, body: PAGE("Careers at Acme", "Many openings") },
		});
		const result = await fetchPosting("https://acme.com/careers", {
			fetchImpl,
			company: "Acme",
			role: "ML Engineer",
		});
		assert.equal(result.ok, true);
		assert.ok(result.discrepancies.some((d) => d.includes("listing page")));
	});

	it("does not flag a direct page whose title matches the role", async () => {
		const { fetchImpl } = mockFetch({
			"https://acme.com/jobs/1": { status: 200, body: PAGE("ML Engineer - Acme", "Python role") },
		});
		const result = await fetchPosting("https://acme.com/jobs/1", {
			fetchImpl,
			company: "Acme",
			role: "ML Engineer",
		});
		assert.equal(result.ok, true);
		assert.equal(result.discrepancies.length, 0);
	});
});

describe("robotsAllows (review fix)", () => {
	it("honors a Claude-User disallow like a wildcard one", () => {
		assert.equal(robotsAllows("User-agent: Claude-User\nDisallow: /\n", "job-hunter", "/jobs/1"), false);
		assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "job-hunter", "/jobs/1"), false);
		assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "job-hunter", "/jobs/1"), true);
	});
});
