import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildTailoredCv } from "../lib/tailor.ts";
import type { Profile } from "../lib/profile.ts";

const PROFILE: Profile = {
	name: "Test Candidate",
	location: "Copenhagen, Denmark",
	constraints: "No relocation",
	workCountry: "Denmark",
	citizenships: [],
	permitClasses: [],
	languages: [{ language: "English", level: "C1" }],
	primarySkills: ["Python", "SQL", "Machine Learning"],
	secondarySkills: ["Docker"],
	weakSkills: ["Kubernetes"],
	strongDomains: ["fraud detection"],
	adjacentDomains: ["credit risk"],
	careerGoals: ["ML Engineer"],
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
		assert.equal(result.filePath, "cv/main_acme_senior-ml-engineer.tex");
		assert.equal(result.archiveDir, "documents/applications/acme_senior-ml-engineer");
		assert.equal(result.pageLimit, 2);
		assert.ok(result.compileCommand.includes("lualatex"));
		assert.ok(result.compileCommand.includes("main_acme_senior-ml-engineer.tex"));
	});

	it("emits LaTeX-safe output with ASCII date ranges", () => {
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
		assert.ok(result.tex.includes("R\\&D Corp"));
		assert.ok(result.tex.includes("2020-2024"));
		assert.ok(!result.tex.includes("2020--2024"));
		assert.ok(result.tex.includes("In progress, expected June 2026."));
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
		const experienceAt = result.tex.indexOf("Professional Experience");
		const educationAt = result.tex.indexOf("Education");
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
		const experienceAt = result.tex.indexOf("Professional Experience");
		const educationAt = result.tex.indexOf("Education");
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
		assert.equal(result.tex.match(/\\textbf\{/g)?.length ?? 0, 5);
		assert.ok(result.tex.includes("\\textbf{Python}"));
		assert.ok(result.tex.includes("\\textbf{Docker}"));
		assert.ok(!result.tex.includes("Kubernetes"));
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
		const cutAt = result.tex.indexOf("Cut losses by 12");
		const pipelinesAt = result.tex.indexOf("Built SQL pipelines.");
		const adminAt = result.tex.indexOf("Did admin work.");
		assert.ok(cutAt > 0 && cutAt < pipelinesAt && pipelinesAt < adminAt);
		assert.ok(!result.tex.includes("Helped interns."));
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
		assert.equal(result.tex.match(/\\textbf\{/g)?.length ?? 0, 5);
		assert.ok(result.tex.includes("\\textbf{Python}"));
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
		assert.ok(result.tex.includes("Moving from credit risk"));
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

	it("honors an active custom template override over stock guidance", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			template: {
				name: "typst-clean",
				sourceExtension: ".typ",
				compileCommand: "typst compile <file>.typ <file>.pdf",
				pageLimit: 2,
			},
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.filePath, "cv/main_acme_senior-ml-engineer.typ");
		assert.ok(result.compileCommand.includes("typst compile"));
		assert.ok(result.warnings.templateNote);
	});

	it("returns the EMPTY_SLUG hard error with no TeX when nothing identifies the posting", () => {
		const result = buildTailoredCv({ postingText: "Requirements: Python.", profile: PROFILE });
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("EMPTY_SLUG"));
		assert.ok(!("tex" in result));
	});
});
