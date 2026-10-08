import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sectionHeadings } from "@/lib/job-hunter/document.ts";
import type { FetchLike } from "@/lib/job-hunter/fetch-posting.ts";
import { buildTailoredCv } from "@/lib/job-hunter/tailor.ts";
import type { Profile } from "@/lib/job-hunter/profile.ts";

const PROFILE: Profile = {
	name: "Test Candidate",
	location: "Copenhagen, Denmark",
	workCountry: "Denmark",
	permitClasses: [],
	languages: [{ language: "English", level: "C1" }],
	preferences: { targetRoles: ["ML Engineer"] },
	skills: [{ name: "Python", category: "primary" as const }, { name: "SQL", category: "primary" as const }, { name: "Machine Learning", category: "primary" as const }, { name: "Docker", category: "secondary" as const }, { name: "Kubernetes", category: "weak" as const }],
	domains: [{ name: "fraud detection", category: "strong" as const }, { name: "credit risk", category: "adjacent" as const }],
	energizingTasks: ["model building"],
	drainingTasks: ["maintenance"],
	experience: [
		{
			company: "R&D Corp",
			position: "Data Analyst",
			location: "",
			startDate: "2020",
			endDate: "2024",
			current: false,
			description: "Cut losses by 12% with Python models for fraud detection. Built SQL pipelines.",
			achievements: [],
			technologies: ["Python", "SQL"],
		},
	],
};

const POSTING = [
	"Senior ML Engineer at Acme.",
	"We welcome international applicants and offer visa sponsorship.",
	"Requirements: Python, SQL, Machine Learning.",
	"Nice to have: Docker, Kubernetes.",
	"Domain: fraud detection.",
	"Remote. Apply by 15 March 2026. Ref: ACME-123.",
].join("\n");

/** Canned model output: every numeral and employer is grounded in PROFILE above. */
const RENDER = {
	name: "Test Candidate",
	headline: "Senior ML Engineer",
	location: "Copenhagen, Denmark",
	email: "test@example.com",
	phone: "+45 12345678",
	statement: "Test Candidate brings Python, SQL and Machine Learning to ML Engineer work in fraud detection.",
	competencies: [
		{ label: "Python", body: "Direct match to a stated requirement." },
		{ label: "SQL", body: "Direct match to a stated requirement." },
		{ label: "Machine Learning", body: "Direct match to a stated requirement." },
		{ label: "Docker", body: "Direct match to a stated nice-to-have requirement." },
		{ label: "fraud detection", body: "Core strength for this role." },
	],
	experience: [
		{
			title: "Data Analyst",
			company: "R&D Corp",
			period: "2020-2024",
			bullets: [
				"Cut losses by 12% with Python models for fraud detection.",
				"Built SQL pipelines.",
				"Did admin work.",
			],
		},
	],
	education: [
		{
			degree: "MSc Data Science",
			period: "2022-2024",
			institution: "Test University",
			inProgress: true,
			expectedDate: "June 2026",
		},
	],
	languages: [{ language: "English", level: "C1" }],
	headings: sectionHeadings("en"),
	experienceFirst: true,
};

/** Stub Groq transport carrying canned model JSON, following the repo fetchImpl convention. */
function stubFetch(data: unknown, status = 200): FetchLike {
	return async () => ({
		status,
		body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }),
	});
}

const LLM = { apiKey: "test-key", fetchImpl: stubFetch(RENDER) };

const CV_INPUT = {
	postingText: POSTING,
	company: "Acme",
	role: "Senior ML Engineer",
	profile: PROFILE,
};

describe("buildTailoredCv", () => {
	it("derives the shared slug and stock file contract", async () => {
		const result = await buildTailoredCv(CV_INPUT, LLM);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.slug, "acme_senior-ml-engineer");
		assert.equal(result.filePath, "cv/main_acme_senior-ml-engineer.html");
		assert.equal(result.template, "modern-fixed-v1");
		assert.equal(result.archiveDir, "documents/applications/acme_senior-ml-engineer");
		assert.equal(result.pageLimit, 2);
	});

	it("emits escaped HTML output with ASCII date ranges", async () => {
		const doubleDash = {
			...RENDER,
			experience: [{ ...RENDER.experience[0], period: "2020--2024" }],
		};
		const result = await buildTailoredCv(CV_INPUT, { apiKey: "test-key", fetchImpl: stubFetch(doubleDash) });
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.html.includes("R&amp;D Corp"));
		assert.ok(result.html.includes("2020-2024"));
		assert.ok(!result.html.includes("2020--2024"));
		assert.ok(result.html.includes("In progress, expected June 2026."));
	});

	it("puts experience before education when the model sets experienceFirst", async () => {
		const result = await buildTailoredCv(CV_INPUT, LLM);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const experienceAt = result.html.indexOf("Professional Experience");
		const educationAt = result.html.indexOf("Education");
		assert.ok(experienceAt > 0 && educationAt > experienceAt);
	});

	it("puts education before experience when the model clears experienceFirst", async () => {
		const specialist = { ...RENDER, experienceFirst: false };
		const result = await buildTailoredCv(
			{
				postingText: "Requirements: credit risk analysis and regulatory reporting.",
				company: "Acme",
				role: "Risk Specialist",
				profile: PROFILE,
			},
			{ apiKey: "test-key", fetchImpl: stubFetch(specialist) },
		);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const experienceAt = result.html.indexOf("Professional Experience");
		const educationAt = result.html.indexOf("Education");
		assert.ok(educationAt > 0 && educationAt < experienceAt);
	});

	it("renders the model's competency list as-is with no padding", async () => {
		const single = { ...RENDER, competencies: [RENDER.competencies[0]] };
		const result = await buildTailoredCv(CV_INPUT, { apiKey: "test-key", fetchImpl: stubFetch(single) });
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const competencyHtml = result.html.match(/<ul class="competencies">[\s\S]*?<\/ul>/)?.[0] ?? "";
		assert.equal(competencyHtml.match(/<strong>/g)?.length ?? 0, 1);
		assert.ok(competencyHtml.includes("<strong>Python</strong>"));
	});

	it("renders the model-selected bullets verbatim in order", async () => {
		const result = await buildTailoredCv(CV_INPUT, LLM);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const cutAt = result.html.indexOf("Cut losses by 12");
		const pipelinesAt = result.html.indexOf("Built SQL pipelines.");
		const adminAt = result.html.indexOf("Did admin work.");
		assert.ok(cutAt > 0 && cutAt < pipelinesAt && pipelinesAt < adminAt);
	});

	it("flows the model statement through untouched", async () => {
		const transfer = {
			...RENDER,
			statement: "Moving from credit risk to Risk Analyst, Test Candidate brings SQL to ML Engineer work.",
		};
		const result = await buildTailoredCv(
			{
				postingText: "Requirements: credit risk modeling.",
				company: "Acme",
				role: "Risk Analyst",
				profile: PROFILE,
			},
			{ apiKey: "test-key", fetchImpl: stubFetch(transfer) },
		);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.html.includes("Moving from credit risk"));
	});

	it("reports no heuristic stretch choices; the model owns framing", async () => {
		const result = await buildTailoredCv(CV_INPUT, LLM);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.deepEqual(result.warnings.stretchChoices, []);
	});

	it("reports no dropped bullets; the model owns selection", async () => {
		const result = await buildTailoredCv(CV_INPUT, LLM);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.deepEqual(result.droppedBullets, []);
	});

	it("warns before drafting when the posting matches nothing at all", async () => {
		const result = await buildTailoredCv(
			{
				postingText: "Requirements: quantum satellite engineering.",
				company: "Acme",
				role: "Quantum Engineer",
				profile: PROFILE,
			},
			LLM,
		);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.warnings.reframingWarning);
	});

	it("keeps grounded model prose ban-clean and drift-free on the fixture", async () => {
		const result = await buildTailoredCv(CV_INPUT, LLM);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.deepEqual(result.banViolations, []);
		assert.deepEqual(result.warnings.draftDrift, []);
		assert.deepEqual(result.warnings.profileConsistency, []);
	});

	it("flags employers outside the profile as drift", async () => {
		const invented = {
			...RENDER,
			experience: [{ ...RENDER.experience[0], company: "Invented Inc" }],
		};
		const result = await buildTailoredCv(CV_INPUT, { apiKey: "test-key", fetchImpl: stubFetch(invented) });
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.warnings.draftDrift.some((entry) => entry.includes("Invented Inc")));
	});

	it("flags ungrounded numbers as drift", async () => {
		const inflated = {
			...RENDER,
			experience: [
				{ ...RENDER.experience[0], bullets: ["Cut losses by 99% with Python models."] },
			],
		};
		const result = await buildTailoredCv(CV_INPUT, { apiKey: "test-key", fetchImpl: stubFetch(inflated) });
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.warnings.draftDrift.some((entry) => entry.includes("99")));
	});

	it("uses the fixed modern template and ignores custom template input", async () => {
		const result = await buildTailoredCv(
			{
				postingText: POSTING,
				company: "Acme",
				role: "Senior ML Engineer",
				profile: PROFILE,
			},
			LLM,
		);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.filePath, "cv/main_acme_senior-ml-engineer.html");
		assert.equal(result.template, "modern-fixed-v1");
	});

	it("returns the EMPTY_SLUG hard error with no document when nothing identifies the posting", async () => {
		const result = await buildTailoredCv({ postingText: "Requirements: Python.", profile: PROFILE });
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("EMPTY_SLUG"));
		assert.ok(!("html" in result));
	});

	it("returns TAILOR_NO_LLM without a key instead of falling back", async () => {
		const result = await buildTailoredCv(CV_INPUT);
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("TAILOR_NO_LLM"));
	});

	it("returns TAILOR_INVALID on malformed model JSON", async () => {
		const broken: FetchLike = async () => ({
			status: 200,
			body: JSON.stringify({ choices: [{ message: { content: "oops" } }] }),
		});
		const result = await buildTailoredCv(CV_INPUT, { apiKey: "test-key", fetchImpl: broken });
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("TAILOR_INVALID"));
	});

	it("returns TAILOR_LLM_FAILED on transport errors", async () => {
		const result = await buildTailoredCv(CV_INPUT, { apiKey: "test-key", fetchImpl: stubFetch(RENDER, 500) });
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("TAILOR_LLM_FAILED"));
	});
});
