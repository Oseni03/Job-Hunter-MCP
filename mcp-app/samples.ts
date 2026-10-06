/**
 * Minimal sample calls per tool for the standalone preview. Each sample flows
 * through the same `mapToolToDashboard` mapper as live MCP results, so the
 * preview exercises the real rendering path with representative fields only.
 */

export interface SampleCall {
	args: unknown;
	structured: unknown;
	text: string;
}

export const SAMPLE_TOOLS = [
	"analyze-job",
	"tailor-resume",
	"generate-cover-letter",
	"track-application",
	"prepare-interview",
	"career-strategy",
	"draft-application-answers",
	"rank-jobs",
	"research-company",
	"search-jobs",
	"setup-profile",
	"due-followups",
] as const;

export const SAMPLE_CALLS: Record<(typeof SAMPLE_TOOLS)[number], SampleCall> = {
	"analyze-job": {
		args: { company: "Acme Corp", role: "Backend Engineer" },
		structured: {
			scored: true,
			eligibility: { verdict: "PASS", note: "Work authorization covers the posting country." },
			languageGate: { verdict: "PASS", note: "Posting language matches a declared language." },
			dimensions: [
				{ dimension: "Technical", score: 85, notes: "Python and API ownership match." },
				{ dimension: "Experience", score: 80, notes: "Four years of backend delivery." },
				{ dimension: "Behavioral", score: 75, notes: "Incident ownership is energizing." },
				{ dimension: "Career", score: 88, notes: "Direct step toward platform goals." },
			],
			overallScore: 82,
			verdict: "Strong Fit",
			strengths: ["Production Python ownership"],
			gaps: ["No Kubernetes exposure"],
			recommendation: "Proceed to drafting.",
			shouldCallEmployer: { suggest: false, reason: "Posting answers the open questions." },
			needsConfirmation: true,
			deadline: null,
		},
		text: "## Job Fit Evaluation: Backend Engineer at Acme Corp\n\n**Overall Score: 82/100**\n\n### Verdict: Strong Fit",
	},
	"tailor-resume": {
		args: { company: "Acme Corp", role: "Backend Engineer", postingText: "Build Python APIs." },
		structured: {
			slug: "acme-corp_backend-engineer",
			filePath: "cv/main_acme-corp_backend-engineer.tex",
			compileCommand: "lualatex",
			pageLimit: 2,
			coverage: [
				{ requirement: "Python APIs", kind: "essential", status: "matched", evidence: "Shipped billing API" },
				{ requirement: "Kubernetes", kind: "nice-to-have", status: "gap" },
			],
			droppedBullets: [],
			warnings: {
				profileConsistency: [],
				draftDrift: [],
				stretchChoices: [{ bullet: "Led migration", reason: "Scope is larger than the evidence" }],
			},
			banViolations: [],
		},
		text: "## Tailored CV: `cv/main_acme-corp_backend-engineer.tex`\n\n- Compile: `lualatex` (exactly 2 pages)",
	},
	"generate-cover-letter": {
		args: { company: "Acme Corp", role: "Backend Engineer", postingText: "Build Python APIs." },
		structured: {
			slug: "acme-corp_backend-engineer",
			filePath: "cover_letters/cover_acme-corp_backend-engineer.tex",
			compileCommand: "xelatex",
			pageLimit: 1,
			wordCount: 278,
			coverage: [
				{ requirement: "Python APIs", kind: "essential", status: "matched", evidence: "Billing API" },
			],
			logistics: { workMode: "hybrid", deadline: null, referenceId: null },
			warnings: { profileConsistency: [], draftDrift: [], stretchChoices: [] },
			banViolations: [],
		},
		text: "## Cover Letter: `cover_letters/cover_acme-corp_backend-engineer.tex`\n\n- Words: 278 (band 250-300)",
	},
	"track-application": {
		args: { company: "Acme Corp", role: "Backend Engineer" },
		structured: {
			action: "append",
			row: "2026-10-01,Acme Corp,,Backend Engineer,,,,applied,,,,,,",
			rowIndex: null,
			trackerHash: "abc123def456",
			archiveFile: "documents/applications/acme-corp_backend-engineer/posting.md",
			archiveNote: null,
			openMatchCount: 1,
		},
		text: "## Record application: append\n\n- Tracker hash: `abc123def456`",
	},
	"prepare-interview": {
		args: { company: "Acme Corp", role: "Backend Engineer" },
		structured: {
			company: "Acme Corp",
			role: "Backend Engineer",
			stage: "recruiter-screen",
			packFile: "documents/applications/acme-corp_backend-engineer/prep_recruiter-screen.md",
			packMarkdown: "## Interview pack: recruiter-screen\n\n### Likely questions\n- Tell me about a production incident you owned",
			missingLogistics: ["interview date"],
			fallbackNotes: [],
			questions: [
				{
					question: "Tell me about a production incident you owned",
					source: "fit-gap",
					bridge: "Use the billing outage example.",
				},
			],
			starMapping: [{ title: "Billing outage", useFor: ["ownership"], covers: ["Tell me about a production incident you owned"] }],
			uncoveredQuestions: [],
			newStarDrafts: [],
			probeableClaims: [],
			toughQuestions: ["Why Acme now?"],
			questionsToAsk: ["How is on-call scoped for this team?"],
			warnings: [],
		},
		text: "## Interview pack: recruiter-screen",
	},
	"career-strategy": {
		args: {},
		structured: {
			directions: [
				{
					direction: "Backend engineering",
					why: ["Four years of API ownership"],
					evidence: ["Billing API delivery"],
					gapsToClose: ["Kubernetes exposure"],
					dimensions: ["Technical", "Experience"],
				},
			],
			skipped: [],
			priorityGaps: ["Kubernetes exposure"],
			avoidNotes: [],
			frameworkNote: "Grounded in profile evidence.",
			warnings: [],
		},
		text: "## Career strategy\n\n### Backend engineering\n- Four years of API ownership",
	},
	"draft-application-answers": {
		args: { company: "Acme Corp" },
		structured: {
			filePath: "documents/portal_answers.txt",
			copyPasteText: "Self-introduction (technical, 120 words): ...",
			selfIntros: [{ roleType: "technical", text: "...", wordCount: 120, targetWords: 150, trimNote: null }],
			projectEntries: [],
			pitches: [{ text: "...", charCount: 140, context: "LinkedIn", recommended: true }],
			datesReference: [],
			scopeNotes: [],
			ungrounded: [],
			warnings: [],
		},
		text: "Self-introduction (technical, 120 words): ...",
	},
	"rank-jobs": {
		args: {},
		structured: {
			eligibleCount: 2,
			deferredCount: 0,
			trackerExcludedCount: 0,
			focusSkippedCount: 0,
			nextCursor: null,
			profileHash: "abc123",
			ranked: [],
			shortlist: [
				{
					key: "acme-backend",
					title: "Backend Engineer",
					company: "Acme Corp",
					url: "https://example.com/jobs/1",
					portal: "site",
					score: 82,
					verdict: "Strong Fit",
					locationVerdict: "PASS",
					languageGate: "PASS",
					deadline: null,
					flags: [],
				},
			],
			belowThreshold: [],
			excluded: [],
			closingSoon: [],
			sweptExpired: [],
			sweptClosingSoon: [],
			stateUpdates: [],
			limits: { limit: 10, top: 5 },
			notes: [],
			errors: [],
		},
		text: "## Ranked shortlist (triage only)\n\n- Eligible: 2 | shortlisted: 1",
	},
	"research-company": {
		args: { company: "Acme Corp" },
		structured: {
			company: "Acme Corp",
			cached: true,
			cacheFile: "company_research/acme-corp.json",
			claims: [
				{
					text: "Acme runs a usage-based billing platform.",
					fetched: true,
					sourceUrl: "https://acme.example/about",
					sourcedFrom: "company-domain",
				},
			],
			sourcing: { sourcedCount: 1, droppedCount: 0, sources: ["https://acme.example/about"], notes: [] },
			fetchSteps: ["cache-hit"],
			trustNote: "Sourced means the sentence appeared on a fetched page, never that it is true.",
		},
		text: "## Company research: Acme Corp (cache hit)",
	},
	"search-jobs": {
		args: { keywords: "backend", location: "Berlin" },
		structured: {
			filters: { keywords: "backend", location: "Berlin", limit: 10 },
			queries: [],
			candidates: [
				{
					key: "acme-backend",
					title: "Backend Engineer",
					company: "Acme Corp",
					url: "https://example.com/jobs/1",
					postedDate: "2026-09-28",
					deadline: null,
					dateUnknown: false,
					status: "active",
					portal: "site",
					quickFit: { score: 78, band: "high", strengths: ["Python"], gaps: [] },
					language: { verdict: "PASS", note: "English posting." },
				},
			],
			staleCount: 0,
			seenSkipped: 1,
			appliedSkipped: 0,
			queriesRun: ["backend Berlin"],
			nextCursor: null,
			notes: [],
			errors: [],
		},
		text: "## Job search results\n\n- Candidates: 1 | seen skipped: 1",
	},
	"setup-profile": {
		args: { resumeText: "Ada Example, Berlin. Python engineer." },
		structured: {
			profile: {
				name: "Ada Example",
				location: "Berlin",
				primarySkills: ["Python", "APIs"],
				strongDomains: ["backend"],
				careerGoals: ["platform engineering"],
			},
			resumeHash: "def456",
			notes: ["Derived from the uploaded resume."],
			warnings: [],
			dbNote: "Host owns persistence.",
		},
		text: "## Profile setup (from uploaded resume)\n\n- Name: Ada Example",
	},
	"due-followups": {
		args: {},
		structured: {
			due: [
				{
					jobKey: "acme-backend",
					company: "Acme Corp",
					role: "Backend Engineer",
					status: "applied",
					daysStale: 9,
					reason: "untouched for 9 days",
					suggestedAction: "Send a short check-in.",
				},
			],
			checked: 4,
			staleDays: 7,
			deadlineWithinDays: 3,
			note: "Open rows untouched past the threshold or with a near deadline.",
		},
		text: "## Due follow-ups (1 of 4 checked)",
	},
};
