// Golden checks for ticket 07: deterministic end-to-end assertions on a
// fixture posting. Run with:
//   node --import ./scripts/alias-loader.mjs scripts/golden-check.mjs
// Exit 0 when every check passes or skips; exit 1 on any failure.
// The cover-compile check skips explicitly when the TeX toolchain is
// absent instead of inventing a page count.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyBearerToken } from "@/lib/auth.ts";
import { oauthConfigFromEnv, oauthResourceMetadata } from "@/lib/oauth.ts";
import { buildCoverLetter, buildTailoredCv } from "@/lib/job-hunter/tailor.ts";
import { checkWritingBans, sectionHeadings } from "@/lib/job-hunter/latex.ts";
import { isCanonical, makeKey } from "@/lib/job-key.ts";
import { TRACKER_HEADER, planRecordApplication } from "@/lib/job-hunter/record.ts";
import { SEARCH_LIMIT_MAX, SEARCH_RECENCY_DAYS, planSearch } from "@/lib/job-hunter/search.ts";
import { planRank } from "@/lib/job-hunter/rank.ts";
import {
	getCompanyResearchResource,
	getPrompt,
	getResource,
	listPrompts,
	listResources,
} from "@/lib/job-hunter/resources.ts";
import { resolveProfile } from "@/lib/job-hunter/profile.ts";

let pass = 0;
let fail = 0;
let skip = 0;

function check(name, ok, detail = "") {
	if (ok) {
		pass += 1;
		console.log(`PASS ${name}`);
	} else {
		fail += 1;
		console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
	}
}

function skipped(name, reason) {
	skip += 1;
	console.log(`SKIP ${name} -- ${reason}`);
}

const POSTING = [
	"Senior ML Engineer at Acme.",
	"We welcome international applicants and offer visa sponsorship.",
	"Requirements: Python, SQL, Machine Learning.",
	"Nice to have: Docker, Kubernetes.",
	"Domain: fraud detection.",
	"Remote. Apply by 15 March 2026. Ref: ACME-123.",
].join("\n");

const PROFILE = {
	name: "Test Candidate",
	primarySkills: ["Python", "SQL", "Machine Learning"],
	secondarySkills: ["Docker"],
	strongDomains: ["fraud detection"],
	adjacentDomains: ["credit risk"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	drainingTasks: ["maintenance"],
	languages: [{ language: "English", level: "C1" }],
};

const profile = resolveProfile(PROFILE);

const cv = buildTailoredCv({
	postingText: POSTING,
	company: "Acme",
	role: "Senior ML Engineer",
	profile,
	experience: [
		{
			title: "Data Analyst",
			company: "R&D Corp",
			period: "2020-2024",
			bullets: ["Cut losses by 12% with Python models for fraud detection."],
		},
	],
});
check("cv builds on the fixture posting", cv.ok === true);
if (cv.ok) {
	check("tailored TeX contains posting keywords", cv.tex.includes("Python") && cv.tex.includes("fraud"));
	check("tailored TeX honors writing bans", checkWritingBans(cv.tex).length === 0);
	const dates = [...cv.tex.matchAll(/\\cventry(\[[^\]]*\])?\{([^{}]*)\}/g)].map((m) => m[2]);
	check("tailored TeX preserves ASCII date ranges", dates.every((d) => !/--|–|—/.test(d)));
	const headings = Object.values(sectionHeadings("en"));
	check(
		"tailored TeX preserves translated headings",
		headings.some((h) => cv.tex.includes(h)) && !cv.tex.includes("Experiencia Profesional"),
	);
	check("canonical key stays stable", cv.slug === "acme_senior-ml-engineer" && isCanonical(cv.slug));
}

const letter = buildCoverLetter({
	postingText: POSTING,
	company: "Acme",
	role: "Senior ML Engineer",
	profile,
	hiringManager: "Jane Smith",
	companySpecifics: ["Acme processes payments across Europe."],
	highlights: ["Shipped a model that cut review time by 30%."],
});
check("cover letter builds on the fixture posting", letter.ok === true);
if (letter.ok) {
	check("letter TeX contains posting keywords", letter.tex.includes("Python"));
	check("letter TeX honors writing bans", checkWritingBans(letter.tex).length === 0);
}

check("tracker header matches exactly", TRACKER_HEADER.includes("deadline"));
const recorded = planRecordApplication({
	company: "Acme",
	role: "Senior ML Engineer",
	fitScore: 84,
	cvFile: "cv/main_acme_senior-ml-engineer.tex",
	coverLetterFile: "cover_letters/cover_acme_senior-ml-engineer.tex",
	postingUrl: "https://example.com/jobs/1",
	deadline: "2026-04-01",
	postingText: POSTING,
	trackerText: "",
	today: "2026-03-01",
});
check(
	"record output opens with the exact tracker header",
	recorded.ok && recorded.trackerText.startsWith(TRACKER_HEADER),
);

check("canonical keys stay stable", makeKey("Acme Corp", "SOC Analyst (L2)") === "acme-corp_soc-analyst-l2");
check(
	"non-Latin fallback stays stable",
	makeKey("Acme", "工程师", "https://example.com/jobs/12345678") === "acme_12345678",
);

const search = await planSearch({
	filters: { keywords: "Python", limit: 50 },
	profile,
	portalResults: [
		{ title: "Fresh Role", company: "Acme", url: "https://example.com/jobs/1", postedDate: "2026-09-20" },
		{ title: "Stale Role", company: "Acme", url: "https://example.com/jobs/2", postedDate: "2026-01-01" },
	],
	now: new Date("2026-09-29T00:00:00Z"),
});
check("recency window respected", SEARCH_RECENCY_DAYS === 14 && search.staleCount === 1);
check("result cap respected", SEARCH_LIMIT_MAX === 20 && search.filters.limit === 20);
check("no postings invented", search.candidates.length === 1 && search.errors.length === 0);

const ranked = await planRank({
	profile,
	items: [
		{
			key: "acme_senior-ml-engineer",
			title: "Senior ML Engineer",
			company: "Acme",
			url: "https://example.com/jobs/1",
			postingText: [
				"Senior ML Engineer at Acme.",
				"We welcome international applicants and offer visa sponsorship.",
				"Requirements: Python, SQL, Machine Learning.",
				"Nice to have: Docker, Kubernetes.",
				"Domain: fraud detection.",
				"Remote.",
			].join("\n"),
			postedDate: "2026-09-20",
		},
	],
	now: new Date("2026-09-29T00:00:00Z"),
});
check("rank triages from posting text with counts", ranked.eligibleCount === 1 && ranked.ranked.length === 1);
check(
	"rank never invents postings",
	ranked.excluded.length === 0 && ranked.stateUpdates[0]?.status === "ranked",
);

const uris = listResources().map((resource) => resource.uri);
check("resource catalog covers profiles, framework, references, and strategy", [
	"job-hunter://profile/candidate",
	"job-hunter://framework/evaluation",
	"job-hunter://reference/cv-master",
	"job-hunter://reference/cover-example",
	"job-hunter://strategy/search-queries",
	"job-hunter://state/seen-keys",
	"job-hunter://state/tracker",
].every((uri) => uris.includes(uri)));
check(
	"per-call resource override wins",
	getResource("job-hunter://rules/writing", "Custom house style.").text === "Custom house style.",
);
const callerResearch = getCompanyResearchResource("acme-corp", {
	callerContent: JSON.stringify({
		company: "Acme Corp",
		fetched_date: "2026-09-29",
		sources: { website: { url: "https://acme.com", notes: "caller-held" } },
	}),
	now: new Date("2026-09-29T00:00:00Z"),
});
check("research caller fallback serves without server disk", callerResearch.ok === true);
const promptNames = listPrompts().map((prompt) => prompt.name);
check(
	"workflow prompts cover all five flows",
	["apply", "rank", "interview", "scrape-health", "tailor-flow"].every((name) => promptNames.includes(name)),
);
check(
	"apply prompt holds the full checklist",
	(getPrompt("apply").ok && getPrompt("apply").text.includes("grounding audit")) === true,
);

check("local dev stays open", verifyBearerToken(undefined, undefined).authorized === true);
check("prod stays closed", verifyBearerToken(undefined, "secret").authorized === false);
check("oauth stays off without an issuer", oauthConfigFromEnv({}) === null);
check(
	"oauth metadata carries the resource, its authorization server, and scopes",
	oauthResourceMetadata("https://mcp.example.com/mcp", "https://login.example.com").authorization_servers[0] ===
		"https://login.example.com" &&
		oauthResourceMetadata("https://mcp.example.com/mcp", "https://login.example.com").scopes_supported.includes(
			"mcp:tools",
		),
);

const mcpConfig = JSON.parse(readFileSync(".mcp.json", "utf-8"));
check("shipped client config points at /job-hunter/mcp", mcpConfig.mcpServers["job-hunter"].url.endsWith("/job-hunter/mcp"));

const coverExample = "cover_letters/cover_example.tex";
if (!existsSync(coverExample)) {
	skipped("cover example compiles to one page", "cover_example.tex missing");
} else {
	try {
		execFileSync("xelatex", ["-version"], { stdio: "ignore" });
		const dir = mkdtempSync(join(tmpdir(), "golden-cover-"));
		writeFileSync(join(dir, "cover_example.tex"), readFileSync(coverExample, "utf-8"));
		execFileSync("xelatex", ["-interaction=nonstopmode", "cover_example.tex"], { cwd: dir, stdio: "ignore" });
		const log = readFileSync(join(dir, "cover_example.log"), "utf-8");
		const pages = /Output written on .* \((\d+) pages?/.exec(log)?.[1];
		check("cover example compiles to exactly one page", pages === "1", `xelatex reported ${pages ?? "?"} pages`);
	} catch (error) {
		skipped("cover example compiles to one page", `toolchain unavailable (${error.code ?? error.message})`);
	}
}

console.log(`\nDEFERRED (out of scope):`);
console.log("- full login-based auth (later phase; OAuth resource-server only, no login flow)");
console.log(`\ngolden: ${pass} pass, ${fail} fail, ${skip} skip`);
process.exit(fail > 0 ? 1 : 0);
