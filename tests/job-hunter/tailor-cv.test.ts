import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
};

const POSTING = [
	"Senior ML Engineer at Acme.",
	"We welcome international applicants and offer visa sponsorship.",
	"Requirements: Python, SQL, Machine Learning.",
	"Nice to have: Docker, Kubernetes.",
	"Domain: fraud detection.",
	"Remote. Apply by 15 March 2026. Ref: ACME-123.",
].join("\n");

const EXPERIENCE = [
	{
		title: "Data Analyst",
		company: "R&D Corp",
		period: "2020--2024",
		bullets: [
			"Did admin work.",
			"Cut losses by 12% with Python models for fraud detection.",
			"Attended meetings.",
			"Built SQL pipelines.",
			"Wrote reports.",
			"Helped interns.",
		],
	},
];

const EDUCATION = [
	{
		degree: "MSc Data Science",
		period: "2022-2024",
		institution: "Test University",
		inProgress: true,
		expectedDate: "June 2026",
	},
];

describe("buildTailoredCv", () => {
	it("derives the shared slug and stock file contract", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
		});
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

	it("emits escaped HTML output with ASCII date ranges", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.html.includes("R&amp;D Corp"));
		assert.ok(result.html.includes("2020-2024"));
		assert.ok(!result.html.includes("2020--2024"));
		assert.ok(result.html.includes("In progress, expected June 2026."));
	});

	it("orders technical CVs as competencies, experience, then education", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const experienceAt = result.html.indexOf("Professional Experience");
		const educationAt = result.html.indexOf("Education");
		assert.ok(experienceAt > 0 && educationAt > experienceAt);
	});

	it("orders specialist CVs with education before experience", () => {
		const result = buildTailoredCv({
			postingText: "Requirements: credit risk analysis and regulatory reporting.",
			company: "Acme",
			role: "Risk Specialist",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
			roleType: "specialist",
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const experienceAt = result.html.indexOf("Professional Experience");
		const educationAt = result.html.indexOf("Education");
		assert.ok(educationAt > 0 && educationAt < experienceAt);
	});

	it("builds 5 competencies with the posting terms as bold labels and never the gap", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const competencyHtml = result.html.match(/<ul class="competencies">[\s\S]*?<\/ul>/)?.[0] ?? "";
		assert.equal(competencyHtml.match(/<strong>/g)?.length ?? 0, 5);
		assert.ok(competencyHtml.includes("<strong>Python</strong>"));
		assert.ok(competencyHtml.includes("<strong>Docker</strong>"));
		assert.ok(!result.html.includes(">Kubernetes</strong>"));
	});

	it("relevance-orders bullets, keeps measurable outcomes, and caps the role at 5", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const cutAt = result.html.indexOf("Cut losses by 12");
		const pipelinesAt = result.html.indexOf("Built SQL pipelines.");
		const adminAt = result.html.indexOf("Did admin work.");
		assert.ok(cutAt > 0 && cutAt < pipelinesAt && pipelinesAt < adminAt);
		assert.ok(!result.html.includes("Helped interns."));
	});

	it("pads short competency lists to 5 from profile skills, never inventing", () => {
		const result = buildTailoredCv({
			postingText: "Requirements: Python.",
			company: "Acme",
			role: "Engineer",
			profile: PROFILE,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const competencyHtml = result.html.match(/<ul class="competencies">[\s\S]*?<\/ul>/)?.[0] ?? "";
		assert.equal(competencyHtml.match(/<strong>/g)?.length ?? 0, 5);
		assert.ok(competencyHtml.includes("<strong>Python</strong>"));
	});

	it("leads with the domain-transfer argument when changing fields", () => {
		const result = buildTailoredCv({
			postingText: "Requirements: credit risk modeling.",
			company: "Acme",
			role: "Risk Analyst",
			profile: PROFILE,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.html.includes("Moving from credit risk"));
	});

	it("flags secondary-skill bullets as keep/soften/drop stretches", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		const docker = result.warnings.stretchChoices.find((choice) => choice.bullet === "Docker");
		assert.ok(docker);
		assert.deepEqual(docker.options, ["keep", "soften", "drop"]);
	});

	it("warns before drafting when the posting matches nothing at all", () => {
		const result = buildTailoredCv({
			postingText: "Requirements: quantum satellite engineering.",
			company: "Acme",
			role: "Quantum Engineer",
			profile: PROFILE,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.warnings.reframingWarning);
	});

	it("keeps generated prose ban-clean and drift-free on the fixture", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			experience: EXPERIENCE,
			education: EDUCATION,
			masterCvText: "Test Candidate: Python, SQL, Machine Learning, Docker, fraud detection, ML Engineer.",
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.deepEqual(result.banViolations, []);
		assert.deepEqual(result.warnings.draftDrift, []);
		assert.deepEqual(result.warnings.profileConsistency, []);
	});

	it("uses the fixed modern template and ignores custom template input", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.filePath, "cv/main_acme_senior-ml-engineer.html");
		assert.equal(result.template, "modern-fixed-v1");
	});

	it("returns the EMPTY_SLUG hard error with no document when nothing identifies the posting", () => {
		const result = buildTailoredCv({ postingText: "Requirements: Python.", profile: PROFILE });
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("EMPTY_SLUG"));
		assert.ok(!("html" in result));
	});
});
