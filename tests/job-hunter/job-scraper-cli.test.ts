import assert from "node:assert/strict";
import test from "node:test";
import { CliError, formatDetail, formatJobs, formatSources, parseArgs, toSearchQuery } from "@/host/job-hunter/scraper/cli.ts";
import { parseLinkedInJobId, parseLinkedInSearch } from "@/host/job-hunter/scraper/adapters/linkedin.ts";
import { jobMatchesQuery } from "@/host/job-hunter/scraper/helpers.ts";
import type { Job, JobDetail } from "@/host/job-hunter/scraper/types.ts";

const makeJob = (overrides: Partial<Job> = {}): Job => ({
	id: "x:1",
	source: "x",
	title: "Software Engineer",
	company: "Acme",
	url: "https://example.com/jobs/1",
	...overrides,
});

test("parseArgs reads a full search invocation", () => {
	const parsed = parseArgs([
		"search", "--location", "Berlin, Germany", "-q", "frontend",
		"--jobage", "7", "--remote", "remote", "--page", "2",
		"--limit", "5", "--source", "all", "--format", "table",
	]);
	assert.equal(parsed.command, "search");
	if (parsed.command !== "search") throw new Error("unreachable");
	assert.deepEqual(parsed.options, {
		location: "Berlin, Germany",
		query: "frontend",
		jobageDays: 7,
		remote: "remote",
		page: 2,
		limit: 5,
		source: "all",
		format: "table",
		enrich: false,
	});
});

test("parseArgs reads --enrich", () => {
	const parsed = parseArgs(["search", "-l", "Lagos", "--enrich"]);
	assert.equal(parsed.command, "search");
	if (parsed.command !== "search") throw new Error("unreachable");
	assert.equal(parsed.options.enrich, true);
});

test("parseArgs applies search defaults", () => {
	const parsed = parseArgs(["search", "-l", "Remote"]);
	assert.equal(parsed.command, "search");
	if (parsed.command !== "search") throw new Error("unreachable");
	assert.equal(parsed.options.source, "all");
	assert.equal(parsed.options.page, 1);
	assert.equal(parsed.options.format, "json");
	assert.equal(parsed.options.query, "");
});

test("parseArgs rejects bad search invocations", () => {
	assert.throws(() => parseArgs(["search", "-q", "x"]), (err: unknown) => err instanceof CliError && err.code === "bad-args");
	assert.throws(() => parseArgs(["search", "-l", "x", "--jobage", "7", "--jobage-minutes", "30"]), /conflict/);
	assert.throws(() => parseArgs(["search", "-l", "x", "--remote", "office"]), /remote\|hybrid\|onsite/);
	assert.throws(() => parseArgs(["search", "-l", "x", "--bogus"]), /Unknown argument/);
	assert.throws(() => parseArgs(["frobnicate"]), /Unknown command/);
});

test("parseArgs reads detail and sources", () => {
	const detail = parseArgs(["detail", "4412815061", "--format", "plain"]);
	assert.equal(detail.command, "detail");
	if (detail.command !== "detail") throw new Error("unreachable");
	assert.equal(detail.options.target, "4412815061");
	assert.equal(detail.options.format, "plain");
	assert.throws(() => parseArgs(["detail"]), /requires a job id/);
	const sources = parseArgs(["sources"]);
	assert.equal(sources.command, "sources");
});

test("parseArgs reads --country and rejects the retired queries command", () => {
	const parsed = parseArgs(["search", "-l", "Berlin, Germany", "--country", "germany"]);
	assert.equal(parsed.command, "search");
	if (parsed.command !== "search") throw new Error("unreachable");
	assert.equal(parsed.options.country, "germany");
	const def = parseArgs(["search", "-l", "Remote"]);
	assert.equal(def.command, "search");
	if (def.command !== "search") throw new Error("unreachable");
	assert.equal(def.options.country, undefined);
	assert.throws(() => parseArgs(["queries", "--query", "x"]), /Unknown command/);
});

test("toSearchQuery threads the country passthrough", () => {
	assert.equal(
		toSearchQuery({ location: "Berlin, Germany", query: "ML Engineer", country: "germany", page: 1, source: "all", format: "json", enrich: false }).country,
		"germany",
	);
	assert.equal(
		toSearchQuery({ location: "Remote", query: "", page: 1, source: "all", format: "json", enrich: false }).country,
		undefined,
	);
});
test("parseLinkedInJobId accepts ids, URLs, and URNs", () => {
	assert.equal(parseLinkedInJobId("4412815061"), "4412815061");
	assert.equal(parseLinkedInJobId("https://www.linkedin.com/jobs/view/frontend-dev-at-acme-4412815061?position=1"), "4412815061");
	assert.equal(parseLinkedInJobId("urn:li:jobPosting:4412815061"), "4412815061");
	assert.equal(parseLinkedInJobId("not a job"), undefined);
});

test("parseLinkedInSearch parses guest search cards", () => {
	const html = [
		"<li><div class=\"base-card base-search-card job-search-card\" data-entity-urn=\"urn:li:jobPosting:4412815061\">",
		"<a class=\"base-card__full-link\" href=\"https://de.linkedin.com/jobs/view/frontend-dev-4412815061?trk=x\">x</a>",
		"<h3 class=\"base-search-card__title\">Frontend Developer</h3>",
		"<h4 class=\"base-search-card__subtitle\">Acme Ltd</h4>",
		"<span class=\"job-search-card__location\">Berlin, Germany</span>",
		"<time class=\"job-search-card__listdate\" datetime=\"2026-10-01\"></time>",
		"</div></li>",
	].join("");
	const jobs = parseLinkedInSearch(html);
	assert.equal(jobs.length, 1);
	assert.equal(jobs[0]?.id, "linkedin:4412815061");
	assert.equal(jobs[0]?.title, "Frontend Developer");
	assert.equal(jobs[0]?.company, "Acme Ltd");
	assert.equal(jobs[0]?.location, "Berlin, Germany");
	assert.equal(jobs[0]?.url, "https://www.linkedin.com/jobs/view/4412815061/");
	assert.deepEqual(jobs[0]?.postedAt, new Date("2026-10-01T00:00:00.000Z"));
});

test("jobMatchesQuery enforces date filters but keeps undated jobs", () => {
	const now = new Date("2026-10-03T12:00:00Z");
	const fresh = makeJob({ postedAt: new Date("2026-10-02T12:00:00Z") });
	const old = makeJob({ postedAt: new Date("2026-09-01T12:00:00Z") });
	const undated = makeJob({});
	assert.equal(jobMatchesQuery(fresh, { keywords: "", postedWithinDays: 7 }, now), true);
	assert.equal(jobMatchesQuery(old, { keywords: "", postedWithinDays: 7 }, now), false);
	assert.equal(jobMatchesQuery(undated, { keywords: "", postedWithinDays: 7 }, now), true);
	assert.equal(jobMatchesQuery(old, { keywords: "", postedWithinMinutes: 60 * 24 * 40 }, now), true);
});

test("jobMatchesQuery enforces onsite/hybrid workplace filters", () => {
	const remoteJob = makeJob({ remote: true });
	const onsiteJob = makeJob({ remote: false });
	const unknownJob = makeJob({});
	assert.equal(jobMatchesQuery(remoteJob, { keywords: "", remoteFilter: "onsite" }), false);
	assert.equal(jobMatchesQuery(onsiteJob, { keywords: "", remoteFilter: "onsite" }), true);
	assert.equal(jobMatchesQuery(unknownJob, { keywords: "", remoteFilter: "onsite" }), true);
	assert.equal(jobMatchesQuery(remoteJob, { keywords: "", remoteFilter: "hybrid" }), true);
	assert.equal(jobMatchesQuery(unknownJob, { keywords: "", remoteFilter: "remote" }), false);
});

test("formatJobs renders json, table, and plain", () => {
	const jobs = [makeJob({ title: "Dev", company: "Acme", location: "Berlin", postedAt: new Date("2026-10-01T00:00:00Z") })];
	const asJson = JSON.parse(formatJobs(jobs, "json") as string) as Job[];
	assert.equal(asJson[0]?.title, "Dev");
	const table = formatJobs(jobs, "table");
	assert.ok(table.includes("Title") && table.includes("Dev") && table.includes("Acme"));
	const plain = formatJobs(jobs, "plain");
	assert.ok(plain.includes("Dev @ Acme") && plain.includes("Berlin"));
	assert.equal(formatJobs([], "plain"), "No jobs found.");
});

test("formatDetail renders json and plain", () => {
	const detail: JobDetail = {
		id: "linkedin:1",
		source: "linkedin",
		title: "Dev",
		company: "Acme",
		location: "Berlin",
		url: "https://www.linkedin.com/jobs/view/1/",
		description: "Build things.",
		seniority: "Associate",
	};
	const asJson = JSON.parse(formatDetail(detail, "json") as string) as JobDetail;
	assert.equal(asJson.seniority, "Associate");
	const plain = formatDetail(detail, "plain");
	assert.ok(plain.includes("Dev @ Acme") && plain.includes("Build things."));
});

test("formatSources lists adapters with no config flags", () => {
	const rows = JSON.parse(formatSources("json") as string) as Array<{ name: string; needsConfig: boolean }>;
	const names = rows.map((row) => row.name);
	assert.ok(names.includes("linkedin") && names.includes("jobberman") && names.includes("indeed"));
	assert.ok(!names.includes("greenhouse") && !names.includes("lever") && !names.includes("ashby"));
	assert.ok(rows.every((row) => row.needsConfig === false));
});
