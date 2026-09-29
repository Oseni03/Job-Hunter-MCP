import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planInterviewPrep } from "../prep.ts";

const PROFILE = {
	name: "Test Candidate",
	primarySkills: ["Python", "SQL"],
	secondarySkills: ["Docker"],
	strongDomains: ["fraud detection"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	languages: [{ language: "English", level: "C1" }],
};

const POSTING = [
	"Senior ML Engineer at Acme.",
	"Requirements: Python, Kubernetes.",
	"Domain: fraud detection.",
].join("\n");

const HISTORY =
	"Feedback from recruiter screen: asked about visa timeline; concern about Kubernetes depth. Follow-up: bring a deployment example.";

const BASE = {
	company: "Acme",
	role: "Senior ML Engineer",
	stage: "technical",
	postingText: POSTING,
	stageHistoryText: HISTORY,
	profile: PROFILE,
};

describe("planInterviewPrep", () => {
	it("reports no missing logistics when all four are held", () => {
		const plan = planInterviewPrep({
			...BASE,
			logistics: {
				dateTime: "2026-04-02 10:00",
				format: "video",
				interviewers: "Jane Smith",
				location: "remote",
			},
		});
		assert.deepEqual(plan.missingLogistics, []);
	});

	it("asks only for the missing stage logistics", () => {
		const plan = planInterviewPrep({ ...BASE, logistics: { format: "video" } });
		assert.deepEqual(plan.missingLogistics, ["dateTime", "interviewers", "location"]);
	});

	it("orders questions feedback first, then gaps, posting, stage", () => {
		const plan = planInterviewPrep(BASE);
		const sources = plan.questions.map((question) => question.source);
		const firstFeedback = sources.indexOf("recorded-feedback");
		const firstGap = sources.indexOf("fit-gap");
		const firstPosting = sources.indexOf("posting-requirement");
		const firstStage = sources.indexOf("stage-type");
		assert.ok(firstFeedback >= 0, "expected recorded-feedback questions");
		assert.ok(firstGap >= 0, "expected fit-gap questions");
		assert.ok(firstPosting >= 0, "expected posting-requirement questions");
		assert.ok(firstStage >= 0, "expected stage-type questions");
		assert.ok(firstFeedback < firstGap, "feedback before gaps");
		assert.ok(firstGap < firstPosting, "gaps before posting");
		assert.ok(firstPosting < firstStage, "posting before stage");
	});

	it("bridges fit gaps honestly against profile evidence", () => {
		const plan = planInterviewPrep(BASE);
		const gap = plan.questions.find((question) => question.source === "fit-gap");
		assert.ok(gap, "expected a fit-gap question for Kubernetes");
		assert.ok(gap.question.includes("Kubernetes"));
		assert.ok(gap.bridge && gap.bridge.includes("Python"), "bridge pivots to profile evidence");
	});

	it("falls back explicitly without the posting and never invents requirements", () => {
		const plan = planInterviewPrep({
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
		});
		assert.ok(
			plan.fallbackNotes.some((note) => note.includes("posting")),
			"expected an explicit no-posting fallback note",
		);
		assert.ok(
			plan.questions.every((question) => question.source !== "fit-gap"),
			"no fit-gap questions without a posting",
		);
		assert.ok(
			plan.questions.every((question) => question.source !== "posting-requirement"),
			"no posting questions without a posting",
		);
	});

	it("maps STAR examples by Use-for tags and lists uncovered questions", () => {
		const plan = planInterviewPrep({
			...BASE,
			starExamples: [
				{
					title: "Fraud model rollout",
					situation: "Chargebacks spiked at R&D Corp.",
					task: "Cut review time with a model.",
					action: "Built a Python scoring pipeline.",
					result: "Review time fell 30%.",
					useFor: ["Python", "modelling"],
				},
			],
		});
		const mapping = plan.starMapping.find((entry) => entry.title === "Fraud model rollout");
		assert.ok(mapping, "expected the example to be mapped");
		assert.ok(mapping.covers.length > 0, "expected Use-for tags to cover questions");
		assert.ok(
			plan.uncoveredQuestions.includes("How would you handle Kubernetes given limited background?") ||
				plan.uncoveredQuestions.length > 0,
			"expected uncovered questions to be listed",
		);
	});

	it("drafts new STAR only from profile facts and flags candidate detail", () => {
		const plan = planInterviewPrep(BASE);
		assert.ok(plan.newStarDrafts.length > 0, "expected STAR drafts for uncovered questions");
		const union = JSON.stringify(PROFILE).toLowerCase();
		for (const draft of plan.newStarDrafts) {
			assert.equal(draft.needsCandidateDetail, true);
			const text = `${draft.situation} ${draft.task} ${draft.action}`.toLowerCase();
			const words = text.split(/[^a-z0-9+#]+/).filter((word) => word.length >= 4);
			for (const word of words) {
				assert.ok(
					union.includes(word) ||
						["your", "with", "from", "that", "this", "draw", "describe", "concrete", "example", "where", "applied"].includes(
							word,
						),
					`draft word '${word}' must trace to profile facts or scaffold wording`,
				);
			}
		}
	});

	it("turns every history line into feedback, even without keywords", () => {
		const plan = planInterviewPrep({
			company: "Acme",
			role: "Senior ML Engineer",
			profile: PROFILE,
			stageHistoryText: "María from HR liked the salary expectations.",
		});
		assert.ok(
			plan.questions.some(
				(question) =>
					question.source === "recorded-feedback" &&
					question.question.includes("María from HR liked the salary expectations."),
			),
			"keyword-free history still becomes a question",
		);
	});

	it("treats profile-checkable claims as probeable, not just quantified ones", () => {
		const plan = planInterviewPrep({
			...BASE,
			cvText: "Led Python migration at R&D Corp.\nBased in Test City.",
		});
		assert.ok(
			plan.probeableClaims.some((claim) => claim.includes("Led Python migration")),
			"profile-grounded claim is probeable without digits",
		);
		assert.ok(
			plan.probeableClaims.every((claim) => !claim.includes("Based in Test City")),
			"ungroundable filler stays out",
		);
	});

	it("lists probeable claims from the submitted documents", () => {
		const plan = planInterviewPrep({
			...BASE,
			cvText: "Cut losses by 12% with Python models for fraud detection.\nBased in Test City.",
		});
		assert.ok(
			plan.probeableClaims.some((claim) => claim.includes("12%")),
			"expected the quantified claim to be probeable",
		);
		assert.ok(
			plan.probeableClaims.every((claim) => !claim.includes("Based in Test City")),
			"unquantified lines stay out",
		);
	});

	it("customizes tough questions only with verified company hooks", () => {
		const withFacts = planInterviewPrep({ ...BASE, companyFacts: ["Acme processes payments across Europe."] });
		assert.ok(
			withFacts.toughQuestions.some((question) => question.includes("Acme processes payments across Europe.")),
			"expected the verified hook in a tough question",
		);
		const withoutFacts = planInterviewPrep(BASE);
		assert.ok(
			withoutFacts.fallbackNotes.some((note) => note.includes("company facts")),
			"expected an explicit no-hooks fallback note",
		);
		assert.ok(
			withoutFacts.toughQuestions.every((question) => !question.includes("processes payments")),
			"no invented company detail",
		);
	});

	it("resolves the per-stage pack path and offers a mock run", () => {
		const plan = planInterviewPrep(BASE);
		assert.equal(plan.packFile, "documents/applications/acme_senior-ml-engineer/technical-prep.md");
		assert.ok(plan.packMarkdown.includes("Mock run"), "expected a mock-run offer in the pack");
		assert.ok(plan.packMarkdown.includes(plan.packFile), "pack names its own save path");
	});

	it("picks stage-appropriate questions to ask", () => {
		const plan = planInterviewPrep(BASE);
		assert.ok(plan.questionsToAsk.length > 0);
		assert.ok(
			plan.questionsToAsk.some((question) => question.includes("deep-dive")),
			"expected a technical-stage question to ask",
		);
	});
});
