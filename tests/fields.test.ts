import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planPortalFields } from "../lib/fields.ts";

const PROFILE = {
	name: "Test Candidate",
	primarySkills: ["Python", "SQL"],
	secondarySkills: ["Docker"],
	strongDomains: ["fraud detection"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	languages: [{ language: "English", level: "C1" }],
};

const DESCRIPTION =
	"Own the scoring pipeline that screens card transactions before authorization. " +
	"Engineer behavioural features with Python and SQL over streaming history, train gradient boosting models, and tune thresholds with risk analysts. " +
	"Ship Docker images to staging weekly, monitor score drift and analyst overrides, and page on decay. " +
	"Document retraining cadence, fallback rules, and rollout steps so operations run it without research support. " +
	"Results held across two holiday peaks, keeping recall stable while manual review time fell for fraud detection teams. " +
	"Partner with product and compliance on approval policies and customer messaging during incidents. " +
	"Mentor analysts on model basics.";

const PROJECT = {
	name: "Fraud scoring pipeline",
	role: "ML Engineer",
	dates: "2024-present",
	description: DESCRIPTION,
};

const BASE = {
	profile: PROFILE,
	company: "Acme",
	employerPoints: ["Acme processes payments across Europe."],
	experience: [
		{
			title: "Data Analyst",
			company: "R&D Corp",
			period: "2020-2024",
			bullets: ["Cut losses by 12% with Python models for fraud detection."],
		},
	],
	projects: [PROJECT],
	targetWords: 200,
};

function countWords(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

describe("planPortalFields", () => {
	it("drafts per-role-type self-introductions with strongest evidence first", () => {
		const plan = planPortalFields(BASE);
		assert.equal(plan.selfIntros.length, 2);
		const kinds = plan.selfIntros.map((intro) => intro.roleType).sort();
		assert.deepEqual(kinds, ["specialist", "technical"]);
		for (const intro of plan.selfIntros) {
			assert.ok(intro.text.indexOf("Python") < intro.text.indexOf("Docker"), "strongest evidence first");
			assert.ok(intro.text.includes("Acme"), "employer tie present");
			assert.ok(intro.text.includes("Acme processes payments across Europe."), "verified employer point used");
			assert.equal(intro.wordCount, countWords(intro.text), "word count measured, not guessed");
		}
	});

	it("states the word count against the target with a trim note only when over", () => {
		const over = planPortalFields({ ...BASE, targetWords: 10 });
		for (const intro of over.selfIntros) {
			assert.ok(intro.trimNote && intro.trimNote.includes(`${intro.wordCount - 10}`), "overage stated");
		}
		const within = planPortalFields(BASE);
		for (const intro of within.selfIntros) {
			assert.equal(intro.trimNote, null, "no trim note within target");
			assert.equal(intro.targetWords, 200);
		}
	});

	it("builds project entries in the 100-150 band with a 60-word short", () => {
		const plan = planPortalFields(BASE);
		assert.equal(plan.projectEntries.length, 1);
		const entry = plan.projectEntries[0];
		assert.ok(entry.wordCount >= 100 && entry.wordCount <= 150, `in band, got ${entry.wordCount}`);
		assert.equal(entry.lengthNote, null);
		assert.ok(entry.shortWordCount <= 60, `short within 60, got ${entry.shortWordCount}`);
		assert.equal(entry.shortWordCount, countWords(entry.short));
		assert.ok(entry.scopeNote.includes("ML Engineer"), "ownership scoped to the true project role");
		assert.equal(entry.inProgressNote, null);
	});

	it("flags shortfalls honestly instead of padding, and states in-progress as such", () => {
		const plan = planPortalFields({
			...BASE,
			projects: [{ name: "Tiny tool", role: "Contributor", dates: "2023", description: "Small script." }],
		});
		const entry = plan.projectEntries[0];
		assert.ok(entry.wordCount < 100);
		assert.ok(entry.lengthNote && entry.lengthNote.includes("below"), "shortfall stated, not padded");
		const ongoing = planPortalFields({
			...BASE,
			projects: [{ ...PROJECT, inProgress: true }],
		});
		assert.ok(
			ongoing.projectEntries[0].inProgressNote &&
				ongoing.projectEntries[0].inProgressNote.includes("In progress"),
			"in-progress stated as such",
		);
	});

	it("produces 4-6 counted character pitches with a recommended mapping", () => {
		const plan = planPortalFields(BASE);
		assert.ok(plan.pitches.length >= 4 && plan.pitches.length <= 6, `4-6 pitches, got ${plan.pitches.length}`);
		for (const pitch of plan.pitches) {
			assert.equal(pitch.charCount, [...pitch.text].length, "char count measured");
			assert.ok(pitch.context.length > 0, "every pitch mapped to a context");
		}
		assert.ok(plan.pitches.some((pitch) => pitch.recommended), "recommended mapping present");
	});

	it("warns honestly when thin facts yield fewer than 4 pitches", () => {
		const plan = planPortalFields({
			profile: { name: "Test Candidate", primarySkills: ["Python", "SQL"], careerGoals: ["ML Engineer"] },
		});
		assert.ok(plan.pitches.length > 0 && plan.pitches.length < 4, `thin yield, got ${plan.pitches.length}`);
		assert.ok(
			plan.warnings.some((warning) => warning.includes("to reach 4-6")),
			"expected a pitch shortfall warning",
		);
	});

	it("checks the submitted documents for consistency with the profile", () => {
		const clash = planPortalFields({ ...BASE, cvText: "Unrelated resume for Jordan Lee." });
		assert.ok(
			clash.warnings.some((warning) => warning.includes("submitted CV")),
			"expected a submitted-CV consistency warning",
		);
		const consistent = planPortalFields({ ...BASE, cvText: "Test Candidate resume with Python work." });
		assert.ok(
			consistent.warnings.every((warning) => !warning.includes("submitted CV")),
			"no warning when the CV names the candidate",
		);
	});

	it("grounds every field claim in the profile union with no contradictions", () => {
		const plan = planPortalFields(BASE);
		assert.deepEqual(plan.ungrounded, [], "all generated claims trace to the union");
		assert.ok(plan.datesReference.includes("2020-2024"), "experience periods referenced");
		assert.ok(plan.datesReference.includes("2024-present"), "project dates referenced");
		assert.equal(plan.filePath, "documents/portal-fields.md");
		assert.ok(plan.copyPasteText.includes("words"), "copy-paste file carries counts");
		assert.ok(plan.copyPasteText.includes("characters"), "copy-paste file carries char counts");
	});

	it("invents nothing from an empty profile: no pitches, honest warning", () => {
		const plan = planPortalFields({});
		assert.equal(plan.pitches.length, 0, "no pitches without facts");
		assert.equal(plan.selfIntros.length, 0, "no intros without facts");
		assert.ok(plan.warnings.some((warning) => warning.includes("placeholder")), "honest warning");
	});
});
