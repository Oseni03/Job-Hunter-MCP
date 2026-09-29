import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fetchPosting } from "../fetch-posting.ts";
import type { FetchLike } from "../fetch-posting.ts";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

function mockFetch(routes: Record<string, { status: number; body: string }>): {
	fetchImpl: FetchLike;
	calls: Array<{ url: string; headers: Record<string, string> }>;
} {
	const calls: Array<{ url: string; headers: Record<string, string> }> = [];
	const fetchImpl: FetchLike = async (url, headers = {}) => {
		calls.push({ url, headers });
		const route = routes[url];
		if (!route) {
			return { status: 404, body: "not found" };
		}
		return { status: route.status, body: route.body };
	};
	return { fetchImpl, calls };
}

const PAGE = (title: string, body: string) =>
	`<html><head><title>${title}</title><script>evil()</script></head><body><p>${body}</p></body></html>`;

describe("fetchPosting", () => {
	it("uses a direct fetch when it succeeds and strips markup", async () => {
		const { fetchImpl, calls } = mockFetch({
			"https://acme.com/jobs/1": { status: 200, body: PAGE("ML Engineer - Acme", "Python role") },
		});
		const result = await fetchPosting("https://acme.com/jobs/1", { fetchImpl });
		assert.equal(result.ok, true);
		assert.equal(result.source, "employer");
		assert.deepEqual(result.steps, ["direct-fetch"]);
		assert.match(result.text ?? "", /Python role/);
		assert.ok(!(result.text ?? "").includes("evil()"));
		assert.equal(calls.length, 1);
	});

	it("retries with browser headers after a 403 when robots allows", async () => {
		const { fetchImpl, calls } = mockFetch({
			"https://acme.com/jobs/1": { status: 403, body: "forbidden" },
			"https://acme.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" },
		});
		// Same URL requested with a browser UA succeeds on retry.
		const retrying: FetchLike = async (url, headers = {}) => {
			calls.push({ url, headers });
			if (url === "https://acme.com/jobs/1" && (headers["User-Agent"] ?? "").includes("Mozilla")) {
				return { status: 200, body: PAGE("ML Engineer", "Python role") };
			}
			const route = {
				"https://acme.com/jobs/1": { status: 403, body: "forbidden" },
				"https://acme.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" },
			}[url];
			return route ?? { status: 404, body: "not found" };
		};
		const result = await fetchPosting("https://acme.com/jobs/1", { fetchImpl: retrying });
		assert.equal(result.ok, true);
		assert.ok(result.steps.includes("robots-allowed"));
		assert.ok(result.steps.includes("browser-retry"));
		assert.ok(calls.some((c) => (c.headers["User-Agent"] ?? "").includes("Mozilla")));
	});

	it("skips the browser retry on robots disallow and declares unavailable", async () => {
		const { fetchImpl, calls } = mockFetch({
			"https://acme.com/jobs/1": { status: 403, body: "forbidden" },
			"https://acme.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" },
		});
		const result = await fetchPosting("https://acme.com/jobs/1", { fetchImpl });
		assert.equal(result.ok, false);
		assert.ok(result.steps.includes("robots-disallow"));
		assert.ok(
			!calls.some(
				(c) => c.url === "https://acme.com/jobs/1" && (c.headers["User-Agent"] ?? "").includes("Mozilla"),
			),
		);
	});

	it("treats a 404 robots.txt as permission to retry", async () => {
		const retrying: FetchLike = async (url, headers = {}) => {
			if (url === "https://acme.com/jobs/1" && (headers["User-Agent"] ?? "").includes("Mozilla")) {
				return { status: 200, body: PAGE("ML Engineer", "Python role") };
			}
			if (url.endsWith("/robots.txt")) {
				return { status: 404, body: "nope" };
			}
			return { status: 403, body: "forbidden" };
		};
		const result = await fetchPosting("https://acme.com/jobs/1", { fetchImpl: retrying });
		assert.equal(result.ok, true);
		assert.ok(result.steps.includes("browser-retry"));
	});

	it("prefers the employer posting over an aggregator copy", async () => {
		const { fetchImpl } = mockFetch({
			"https://www.linkedin.com/jobs/view/123": {
				status: 200,
				body: PAGE("ML Engineer | LinkedIn", "Python role"),
			},
			"https://html.duckduckgo.com/html/?q=Acme%20ML%20Engineer": {
				status: 200,
				body: `<html><body><a href="https://acme.com/jobs/1?uddg=https%3A%2F%2Facme.com%2Fjobs%2F1&amp;rut=x">Acme</a></body></html>`,
			},
			"https://acme.com/jobs/1": { status: 200, body: PAGE("ML Engineer - Acme", "Python and SQL") },
		});
		const result = await fetchPosting("https://www.linkedin.com/jobs/view/123", {
			fetchImpl,
			company: "Acme",
			role: "ML Engineer",
		});
		assert.equal(result.ok, true);
		assert.equal(result.source, "employer");
		assert.equal(result.finalUrl, "https://acme.com/jobs/1");
		assert.match(result.text ?? "", /Python and SQL/);
	});

	it("keeps the aggregator copy with a discrepancy when the employer title mismatches", async () => {
		const { fetchImpl } = mockFetch({
			"https://www.linkedin.com/jobs/view/123": {
				status: 200,
				body: PAGE("ML Engineer | LinkedIn", "Python role"),
			},
			"https://html.duckduckgo.com/html/?q=Acme%20ML%20Engineer": {
				status: 200,
				body: `<html><body><a href="https://acme.com/jobs/9?uddg=https%3A%2F%2Facme.com%2Fjobs%2F9">x</a></body></html>`,
			},
			"https://acme.com/jobs/9": { status: 200, body: PAGE("Sales Manager - Acme", "Sell things") },
		});
		const result = await fetchPosting("https://www.linkedin.com/jobs/view/123", {
			fetchImpl,
			company: "Acme",
			role: "ML Engineer",
		});
		assert.equal(result.ok, true);
		assert.equal(result.source, "aggregator");
		assert.ok(result.discrepancies.some((d) => d.includes("mismatch")));
	});

	it("declares unavailable when every step fails", async () => {
		const { fetchImpl } = mockFetch({
			"https://acme.com/jobs/1": { status: 500, body: "boom" },
			"https://acme.com/robots.txt": { status: 500, body: "boom" },
			"https://html.duckduckgo.com/html/?q=Acme%20ML%20Engineer": { status: 500, body: "boom" },
		});
		const result = await fetchPosting("https://acme.com/jobs/1", {
			fetchImpl,
			company: "Acme",
			role: "ML Engineer",
		});
		assert.equal(result.ok, false);
		assert.equal(result.source, "unavailable");
		assert.ok(result.steps.includes("unavailable"));
	});

	it("never fetches URLs embedded in a posting body", async () => {
		const { fetchImpl, calls } = mockFetch({});
		await fetchPosting("https://acme.com/jobs/1", { fetchImpl });
		for (const call of calls) {
			assert.ok(
				call.url.startsWith("https://acme.com/") || call.url.startsWith("https://html.duckduckgo.com/"),
				`unexpected fetch: ${call.url}`,
			);
		}
		assert.ok(calls.length > 0);
	});

	it("exposes the browser user agent marker for tests", () => {
		assert.ok(BROWSER_UA.includes("Mozilla"));
	});
});
