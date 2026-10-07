import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildCoverLetter } from "@/lib/job-hunter/tailor.ts";
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

const RICH = {
	postingText: POSTING,
	company: "Acme",
	role: "Senior ML Engineer",
	profile: PROFILE,
	hiringManager: "Jane Smith",
	companySpecifics: [
		{ text: "Acme processes payments across Europe.", sourceUrl: "https://acme.example/about" },
		{ text: "Acme launched a real-time risk platform in 2025.", sourceUrl: "https://media.example/acme-launch" },
		{ text: "Acme runs a Copenhagen research hub.", sourceUrl: "https://acme.example/hub" },
	],
	highlights: [
		"Shipped a model that cut review time by 30%.",
		"Built a SQL pipeline serving 40 analysts.",
	],
	experience: [
		{
			title: "Data Analyst",
			company: "R&D Corp",
			period: "2020-2024",
			bullets: ["Cut losses by 12% with Python models for fraud detection."],
		},
	],
};

describe("buildCoverLetter", () => {
	it("derives the shared slug and stock file contract", () => {
		const result = buildCoverLetter(RICH);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.slug, "acme_senior-ml-engineer");
		assert.equal(result.filePath, "cover_letters/cover_acme_senior-ml-engineer.tex");
		assert.equal(result.archiveDir, "documents/applications/acme_senior-ml-engineer");
		assert.equal(result.pageLimit, 1);
		assert.ok(result.compileCommand.includes("xelatex"));
	});

	it("lands in the 250-300 word band on rich inputs", () => {
		const result = buildCoverLetter(RICH);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(
			result.wordCount >= 250 && result.wordCount <= 300,
			`expected 250-300 words, got ${result.wordCount}`,
		);
		assert.equal(result.warnings.wordCountNote, undefined);
	});

	it("addresses the hiring manager by name and keeps bullets outside lettercontent", () => {
		const result = buildCoverLetter(RICH);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.tex.includes("\\lettercontent{Dear Jane Smith,}"));
		assert.ok(result.tex.includes("Raleway-Medium"));
		for (const line of result.tex.split("\n")) {
			assert.ok(!(line.includes("\\lettercontent") && line.includes("\\item")));
		}
	});

	it("is motivated by verified specifics and addresses logistics", () => {
		const result = buildCoverLetter(RICH);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.tex.includes("payments across Europe"));
		assert.ok(result.tex.includes("https://acme.example/about"), "quote-and-link carries the source URL");
		assert.ok(result.tex.includes("ACME-123"), "reference ID kept");
		assert.ok(result.tex.includes("Remote"));
		assert.ok(
			!result.tex.includes("15 March 2026"),
			"the deadline never prints in employer-facing text",
		);
	});

	it("engages the nice-to-have by name and bridges the gap honestly", () => {
		const result = buildCoverLetter(RICH);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.tex.includes("\\textbf{Docker}"));
		assert.ok(result.tex.includes("Kubernetes"));
		assert.ok(!result.tex.includes("\\textbf{Kubernetes}"));
		const stretch = result.warnings.stretchChoices.find((choice) => choice.bullet === "Kubernetes");
		assert.ok(stretch);
		assert.deepEqual(stretch.options, ["keep", "soften", "drop"]);
	});

	it("keeps generated prose ban-clean and drift-free on rich inputs", () => {
		const result = buildCoverLetter({
			...RICH,
			masterCvText:
				"Test Candidate: Python, SQL, Machine Learning, Docker, fraud detection, ML Engineer, model building.",
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.deepEqual(result.banViolations, []);
		assert.deepEqual(result.warnings.draftDrift, []);
	});

	it("falls back to the company salutation and warns below the band on thin inputs", () => {
		const result = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.tex.includes("\\lettercontent{Dear Acme,}"));
		assert.ok(result.wordCount < 250);
		assert.ok(result.warnings.wordCountNote?.includes("below"));
	});

	it("localizes the closing to the posting language", () => {
		const result = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			postingLanguage: "da",
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.ok(result.tex.includes("Med venlig hilsen,"));
	});

	it("honors an active custom template override over stock guidance", () => {
		const result = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			template: {
				name: "typst-clean",
				sourceExtension: ".typ",
				compileCommand: "typst compile <file>.typ <file>.pdf",
				pageLimit: 1,
			},
		});
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.filePath, "cover_letters/cover_acme_senior-ml-engineer.typ");
		assert.ok(result.warnings.templateNote);
	});

	it("returns the EMPTY_SLUG hard error with no TeX when nothing identifies the posting", () => {
		const result = buildCoverLetter({ postingText: "Requirements: Python.", profile: PROFILE });
		assert.equal(result.ok, false);
		if (result.ok) {
			return;
		}
		assert.ok(result.error.includes("EMPTY_SLUG"));
		assert.ok(!("tex" in result));
	});
});
