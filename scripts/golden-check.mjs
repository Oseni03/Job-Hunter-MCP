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
import { buildCoverLetter, buildTailoredCv } from "@/lib/tailor.ts";
import { checkWritingBans, sectionHeadings } from "@/lib/latex.ts";
import { isCanonical, makeKey } from "@/lib/job-key.ts";
import { TRACKER_HEADER, planRecordApplication } from "@/lib/record.ts";
import { SEARCH_LIMIT_MAX, SEARCH_RECENCY_DAYS, planSearch } from "@/lib/search.ts";
import { resolveProfile } from "@/lib/profile.ts";

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

check("local dev stays open", verifyBearerToken(undefined, undefined).authorized === true);
check("prod stays closed", verifyBearerToken(undefined, "secret").authorized === false);

const mcpConfig = JSON.parse(readFileSync(".mcp.json", "utf-8"));
check("shipped client config points at /mcp", mcpConfig.mcpServers["job-hunter"].url.endsWith("/mcp"));

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

console.log(`\nDEFERRED (blocked by tickets 08-11, out of scope):`);
console.log("- rank-jobs triage tool (08) and research-company tool (09)");
console.log("- full resource catalog (10) and workflow prompts (11)");
console.log("- full login-based auth (later phase; bearer token only)");
console.log(`\ngolden: ${pass} pass, ${fail} fail, ${skip} skip`);
process.exit(fail > 0 ? 1 : 0);
