import type { DashboardData, DashboardItem, DashboardView } from "./types.ts";

/**
 * Maps each job-hunter tool's call (arguments + structured result + markdown
 * text fallback) to the shared dashboard view model. Every mapper degrades
 * gracefully: missing fields yield shorter sections, never guesses. Unknown
 * tools fall back to the markdown text any tool already returns.
 */

export const TOOL_NAMES = [
	"analyze-job",
	"tailor-resume",
	"generate-cover-letter",
	"track-application",
	"prepare-interview",
	"career-strategy",
	"draft-application-answers",
	"rank-jobs",
	"research-company",
	"research-job",
	"search-jobs",
	"setup-profile",
	"due-followups",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_LABELS: Record<string, string> = {
	"analyze-job": "Analyze job",
	"tailor-resume": "Tailor resume",
	"generate-cover-letter": "Generate cover letter",
	"track-application": "Track application",
	"prepare-interview": "Prepare interview",
	"career-strategy": "Career strategy",
	"draft-application-answers": "Draft application answers",
	"rank-jobs": "Rank jobs",
	"research-company": "Research company",
	"research-job": "Research job",
	"search-jobs": "Search jobs",
	"setup-profile": "Setup profile",
	"due-followups": "Due follow-ups",
};

const TOOL_VIEWS: Record<string, DashboardView> = {
	"analyze-job": "analysis",
	"rank-jobs": "rank",
	"search-jobs": "search",
	"prepare-interview": "interview",
	"due-followups": "followups",
};

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
	return typeof value === "object" && value !== null ? (value as Rec) : {};
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
	return list(value).filter((entry): entry is string => typeof entry === "string");
}

function text(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const DESCRIPTION_EXCERPT_LIMIT = 2000;

function excerpt(value: unknown, limit: number): string | undefined {
	const str = text(value);
	if (str.trim() === "") return undefined;
	if (str.length <= limit) return str;
	return `${str.slice(0, limit)}\n\n…truncated to the first ${limit} characters`;
}

function prettyJson(value: Rec): string | undefined {
	if (Object.keys(value).length === 0) return undefined;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return undefined;
	}
}

function postingTitle(role?: string, company?: string, fallback = "Result"): string {
	if (role && company) return `${role} at ${company}`;
	return role ?? company ?? fallback;
}

function companyRole(args: Rec): { company?: string; role?: string } {
	const company = text(args["company"]) || undefined;
	const role = text(args["role"]) || undefined;
	return { company, role };
}

function coverageItems(coverage: unknown): DashboardItem[] {
	return list(coverage).map((entry) => {
		const item = rec(entry);
		const kind = text(item["kind"]);
		const evidence = text(item["evidence"]);
		return {
			title: text(item["requirement"], "Requirement"),
			verdict: text(item["status"]) || undefined,
			note: [kind, evidence ? `— ${evidence}` : ""].filter((part) => part !== "").join(" ") || undefined,
		};
	});
}

function documentActions(structured: Rec): string[] {
	const warnings = rec(structured["warnings"]);
	const stretch = list(warnings["stretchChoices"]).length;
	const actions = strings(structured["banViolations"]).map((violation) => `Fix: ${violation}`);
	if (stretch > 0) {
		actions.push(`Decide keep, soften, or drop on ${stretch} stretch choice${stretch === 1 ? "" : "s"}`);
	}
	return actions;
}

function mapAnalysis(args: Rec, structured: Rec, markdown?: string): DashboardData {
	const { company, role } = companyRole(args);
	const verdict = text(structured["verdict"]) || null;
	const score = num(structured["overallScore"]);
	const eligibility = rec(structured["eligibility"]);
	const languageGate = rec(structured["languageGate"]);
	const dimensions = list(structured["dimensions"]);
	const call = rec(structured["shouldCallEmployer"]);
	const postingUrl = text(args["postingUrl"]);
	const description =
		excerpt(args["postingText"], DESCRIPTION_EXCERPT_LIMIT) ??
		(postingUrl !== "" ? `Full posting: ${postingUrl}` : undefined);
	const actions: string[] = [];
	if (call["suggest"] === true && text(call["reason"]) !== "") {
		actions.push(`Call the employer: ${text(call["reason"])}`);
	}
	actions.push("Confirm with the candidate before drafting tailored documents");
	return {
		view: "analysis",
		title: postingTitle(role, company, "Job Fit Evaluation"),
		summary: [
			`${verdict ?? "Not scored"}${score !== undefined ? ` ${score}/100` : ""}`,
			`Eligibility ${text(eligibility["verdict"], "?")} · Language ${text(languageGate["verdict"], "?")}`,
		].join(" · "),
		description,
		items: dimensions.map((entry) => {
			const dimension = rec(entry);
			return {
				title: text(dimension["dimension"], "Dimension"),
				score: num(dimension["score"]),
				note: text(dimension["notes"]) || undefined,
			};
		}),
		markdown: prettyJson(structured) ?? markdown,
		actions,
	};
}

function mapRank(structured: Rec, markdown?: string): DashboardData {
	const shortlist = list(structured["shortlist"]);
	const excluded = list(structured["excluded"]);
	const closingSoon = list(structured["closingSoon"]);
	return {
		view: "rank",
		title: "Ranked shortlist",
		summary: [
			`Eligible ${num(structured["eligibleCount"]) ?? shortlist.length}`,
			`shortlisted ${shortlist.length}`,
			`excluded ${excluded.length}`,
			`deferred ${num(structured["deferredCount"]) ?? 0}`,
		].join(" · "),
		items: shortlist.map((entry) => {
			const item = rec(entry);
			const deadline = text(item["deadline"]);
			return {
				title: text(item["title"], "Posting"),
				company: text(item["company"]) || undefined,
				score: num(item["score"]),
				verdict: text(item["verdict"]) || undefined,
				url: text(item["url"]) || undefined,
				note:
					[
						`Location ${text(item["locationVerdict"], "?")}`,
						`language ${text(item["languageGate"], "?")}`,
						deadline !== "" ? `deadline ${deadline}` : "",
					]
						.filter((part) => part !== "")
						.join(" · ") || undefined,
			};
		}),
		markdown,
		actions: [
			...closingSoon.map((entry) => {
				const item = rec(entry);
				return `Closing soon: ${postingTitle(text(item["title"]) || undefined, text(item["company"]) || undefined)} — deadline ${text(item["deadline"], "unknown")}`;
			}),
			"Run analyze-job on a shortlisted pick for a full evaluation before drafting",
		],
	};
}

function mapSearch(structured: Rec, markdown?: string): DashboardData {
	const candidates = list(structured["candidates"]);
	const filters = rec(structured["filters"]);
	const keywords = text(filters["keywords"]);
	const cursor = text(structured["nextCursor"]);
	return {
		view: "search",
		title: "Job search results",
		summary: [
			keywords !== "" ? `"${keywords}"` : "auto queries",
			`${candidates.length} candidates`,
			`seen skipped ${num(structured["seenSkipped"]) ?? 0}`,
			`applied skipped ${num(structured["appliedSkipped"]) ?? 0}`,
		].join(" · "),
		items: candidates.map((entry) => {
			const candidate = rec(entry);
			const fit = rec(candidate["quickFit"]);
			const language = rec(candidate["language"]);
			return {
				title: text(candidate["title"], "Posting"),
				company: text(candidate["company"]) || undefined,
				score: num(fit["score"]),
				verdict: text(fit["band"]) || undefined,
				url: text(candidate["url"]) || undefined,
				note:
					[`Language ${text(language["verdict"], "?")}`, text(candidate["portal"])].filter((part) => part !== "").join(" · ") ||
					undefined,
			};
		}),
		markdown,
		actions: [
			"Run analyze-job on a pick for a full evaluation before drafting",
			...(cursor !== "" ? ["Resume the remaining results with the returned cursor"] : []),
		],
	};
}

function mapInterview(args: Rec, structured: Rec, markdown?: string): DashboardData {
	const company = text(structured["company"]) || text(args["company"]) || undefined;
	const role = text(structured["role"]) || text(args["role"]) || undefined;
	const questions = list(structured["questions"]);
	const starMapping = list(structured["starMapping"]);
	const missing = strings(structured["missingLogistics"]);
	return {
		view: "interview",
		title: `Interview prep: ${postingTitle(role, company, "role")}`,
		summary: [
			text(structured["stage"], "interview"),
			`${questions.length} likely questions`,
			`${starMapping.length} STAR examples mapped`,
		].join(" · "),
		items: questions.map((entry) => {
			const question = rec(entry);
			const bridge = text(question["bridge"]);
			return {
				title: text(question["question"], "Question"),
				note:
					[`Source: ${text(question["source"], "general")}`, bridge !== "" ? `Bridge: ${bridge}` : ""]
						.filter((part) => part !== "")
						.join(" · ") || undefined,
			};
		}),
		markdown: text(structured["packMarkdown"]) || markdown,
		actions: [
			...missing.map((item) => `Provide missing logistics: ${item}`),
			"Log the outcome afterwards for calibration",
		],
	};
}

function mapTailoredCv(structured: Rec, markdown?: string): DashboardData {
	const coverage = list(structured["coverage"]);
	const matched = coverage.filter((entry) => rec(entry)["status"] === "matched").length;
	const bridged = coverage.filter((entry) => rec(entry)["status"] === "bridged").length;
	const gaps = coverage.filter((entry) => rec(entry)["status"] === "gap").length;
	return {
		view: "overview",
		title: `Tailored CV (${text(structured["slug"], "draft")})`,
		summary: [
			`${matched} matched · ${bridged} bridged · ${gaps} gaps`,
			`Puppeteer A4 render, target ${num(structured["pageLimit"]) ?? 2} pages`,
		].join(" · "),
		items: coverageItems(coverage),
		markdown,
		actions: documentActions(structured),
	};
}

function mapCoverLetter(structured: Rec, markdown?: string): DashboardData {
	return {
		view: "overview",
		title: `Cover letter (${text(structured["slug"], "draft")})`,
		summary: [
			`${num(structured["wordCount"]) ?? "?"} words (band 250-300), Puppeteer A4 render`,
			`${text(structured["compileCommand"], "xelatex")} to exactly 1 page`,
		].join(" · "),
		items: coverageItems(structured["coverage"]),
		markdown,
		actions: documentActions(structured),
	};
}

function mapTrack(args: Rec, structured: Rec, markdown?: string): DashboardData {
	const { company, role } = companyRole(args);
	const action = text(structured["action"], "record");
	const hash = text(structured["trackerHash"]);
	const archiveFile = text(structured["archiveFile"]);
	const openMatches = num(structured["openMatchCount"]) ?? 0;
	return {
		view: "overview",
		title: `Record application: ${action}`,
		summary: `${action === "append" ? "Appended" : "Updated"} tracker row${hash !== "" ? ` · hash ${hash.slice(0, 8)}` : ""}`,
		items: [
			{
				title: postingTitle(role, company, "Application"),
				note: archiveFile !== "" ? `Archive: ${archiveFile}` : text(structured["archiveNote"]) || undefined,
			},
		],
		markdown,
		actions: [
			...(openMatches > 1
				? [`Deduplicate: ${openMatches} open rows match this company and role`]
				: []),
			"Check due-followups to schedule the next nudge",
		],
	};
}

function mapStrategy(structured: Rec, markdown?: string): DashboardData {
	const directions = list(structured["directions"]);
	const priorityGaps = strings(structured["priorityGaps"]);
	return {
		view: "overview",
		title: "Career strategy",
		summary:
			priorityGaps.length > 0
				? `Priority gaps: ${priorityGaps.join("; ")}`
				: `${directions.length} grounded direction${directions.length === 1 ? "" : "s"}`,
		items: directions.map((entry) => {
			const direction = rec(entry);
			const why = strings(direction["why"]);
			const gapsToClose = strings(direction["gapsToClose"]);
			return {
				title: text(direction["direction"], "Direction"),
				note:
					[why[0] ?? "", gapsToClose.length > 0 ? `Gaps to close: ${gapsToClose.join("; ")}` : ""]
						.filter((part) => part !== "")
						.join(" · ") || undefined,
			};
		}),
		markdown,
		actions: priorityGaps.map((gap) => `Close priority gap: ${gap}`),
	};
}

function mapFields(structured: Rec, markdown?: string): DashboardData {
	const intros = list(structured["selfIntros"]);
	const projects = list(structured["projectEntries"]);
	const pitches = list(structured["pitches"]);
	const ungrounded = strings(structured["ungrounded"]);
	return {
		view: "overview",
		title: "Application answers",
		summary: `${intros.length} self-intros · ${projects.length} project entries · ${pitches.length} pitches`,
		items: [
			...intros.map((entry) => {
				const intro = rec(entry);
				const target = intro["targetWords"];
				const targetNote = typeof target === "number" ? ` (target ${target})` : "";
				const trim = text(intro["trimNote"]);
				return {
					title: `Self-intro (${text(intro["roleType"], "general")})`,
					note: `${num(intro["wordCount"]) ?? "?"} words${targetNote}${trim !== "" ? ` · ${trim}` : ""}`,
				};
			}),
			...pitches.map((entry) => {
				const pitch = rec(entry);
				return {
					title: `Pitch (${text(pitch["context"], "general")})`,
					note: `${num(pitch["charCount"]) ?? "?"} chars${pitch["recommended"] === true ? " · recommended" : ""}`,
				};
			}),
		],
		markdown: text(structured["copyPasteText"]) || markdown,
		actions:
			ungrounded.length > 0
				? ungrounded.map((claim) => `Resolve ungrounded claim: ${claim}`)
				: ["Paste the file text into the portal; it is ephemeral scratch, never a record"],
	};
}

function mapResearch(structured: Rec, markdown?: string): DashboardData {
	const claims = list(structured["claims"]);
	const sourcing = rec(structured["sourcing"]);
	return {
		view: "overview",
		title: `Company research: ${text(structured["company"], "company")}`,
		summary: [
			structured["cached"] === true ? "Cache hit" : "Fresh research",
			`${claims.length} sourced claims`,
			`${num(sourcing["droppedCount"]) ?? 0} dropped`,
		].join(" · "),
		items: claims.map((entry) => {
			const claim = rec(entry);
			const url = text(claim["sourceUrl"]);
			return {
				title: text(claim["text"], "Claim"),
				url: url !== "" ? url : undefined,
				note: url !== "" ? `Sourced from ${url} (${text(claim["sourcedFrom"])})` : undefined,
			};
		}),
		markdown,
		actions: ["Re-fetch the listed URLs before landing any claim in a letter or prep pack"],
	};
}

const RESEARCH_TOPIC_LABELS: Record<string, string> = {
	company: "Company",
	role: "Role",
	salary: "Salary",
	culture: "Culture",
	interview: "Interview",
	news: "News",
};

function mapJobResearch(args: Rec, structured: Rec, markdown?: string): DashboardData {
	const company = text(structured["company"]) || text(args["company"]) || undefined;
	const role = text(structured["role"]) || text(args["role"]) || undefined;
	const snapshot = list(structured["snapshot"]);
	const sourcing = rec(structured["sourcing"]);
	const questions = strings(structured["questionsToAsk"]);
	const queries = strings(structured["suggestedQueries"]);
	const briefMode = structured["briefMode"] === true;
	return {
		view: "overview",
		title: `Job brief: ${postingTitle(role, company, "role")}`,
		summary: [
			briefMode ? "Research brief — no findings yet" : `${snapshot.length} findings`,
			`${num(sourcing["sourcedCount"]) ?? 0} sourced`,
			`${strings(structured["redFlags"]).length} red flags`,
		].join(" · "),
		items: [
			...snapshot.map((entry) => {
				const finding = rec(entry);
				const url = text(finding["sourceUrl"]);
				const topic = text(finding["topic"]);
				const sourceLabel = text(finding["sourceLabel"]);
				return {
					title: text(finding["claim"], "Finding"),
					url: url !== "" ? url : undefined,
					note:
						[RESEARCH_TOPIC_LABELS[topic] ?? topic, sourceLabel].filter((part) => part !== "").join(" · ") ||
						undefined,
				};
			}),
			...strings(structured["fitNotes"]).map((note) => ({ title: note })),
			...strings(structured["redFlags"]).map((flag) => ({ title: flag, verdict: "Verify" })),
		],
		markdown,
		actions: [
			...questions.map((question) => `Ask: ${question}`),
			...(briefMode ? queries.map((query) => `Research: ${query}`) : []),
		],
	};
}

function mapProfile(structured: Rec, markdown?: string): DashboardData {
	const profile = rec(structured["profile"]);
	const unified = list(profile["skills"])
		.map((entry) => text(rec(entry)["name"]))
		.filter((name) => name !== "");
	const skills = unified.length > 0 ? unified : strings(profile["primarySkills"]);
	const projects = list(profile["projects"]).flatMap((entry) => {
		const project = rec(entry);
		const name = text(project["name"]);
		if (name === "") return [];
		return [
			{
				title: name,
				note: excerpt(project["description"], DESCRIPTION_EXCERPT_LIMIT),
				url: text(project["url"]) || text(project["github"]) || undefined,
			},
		];
	});
	const experience = list(profile["experience"]).flatMap((entry) => {
		const role = rec(entry);
		const position = text(role["position"]);
		const company = text(role["company"]);
		const title = [position, company ? `at ${company}` : ""].filter((part) => part !== "").join(" ");
		if (title === "") return [];
		return [{ title, note: excerpt(role["description"], DESCRIPTION_EXCERPT_LIMIT) }];
	});
	return {
		view: "overview",
		title: "Profile setup",
		summary: [text(profile["name"]) || "Profile", text(profile["location"]), skills.length > 0 ? skills.join(", ") : "no primary skills yet"]
			.filter((part) => part !== "")
			.join(" · "),
		items: [...experience, ...projects],
		markdown,
		actions: [],
	};
}

function mapFollowups(structured: Rec, markdown?: string): DashboardData {
	const due = list(structured["due"]);
	const checked = num(structured["checked"]) ?? due.length;
	return {
		view: "followups",
		title: "Due follow-ups",
		summary:
			due.length > 0
				? `${due.length} due of ${checked} checked`
				: "Nothing due. No open application is stale or near deadline.",
		items: due.map((entry) => {
			const item = rec(entry);
			return {
				title: `${text(item["company"], "Company")} — ${text(item["role"], "role")}`,
				verdict: text(item["status"]) || undefined,
				note: `${text(item["reason"])} · Action: ${text(item["suggestedAction"])}`,
			};
		}),
		markdown,
		actions: [],
	};
}

export function mapToolToDashboard(
	toolName: string,
	args: unknown,
	structuredContent: unknown,
	textContent: string | null,
): DashboardData {
	const a = rec(args);
	const s = rec(structuredContent);
	const markdown = typeof textContent === "string" && textContent.trim() !== "" ? textContent : undefined;
	switch (toolName) {
		case "analyze-job":
			return mapAnalysis(a, s, markdown);
		case "tailor-resume":
			return mapTailoredCv(s, markdown);
		case "generate-cover-letter":
			return mapCoverLetter(s, markdown);
		case "track-application":
			return mapTrack(a, s, markdown);
		case "prepare-interview":
			return mapInterview(a, s, markdown);
		case "career-strategy":
			return mapStrategy(s, markdown);
		case "draft-application-answers":
			return mapFields(s, markdown);
		case "rank-jobs":
			return mapRank(s, markdown);
		case "research-company":
			return mapResearch(s, markdown);
		case "research-job":
			return mapJobResearch(a, s, markdown);
		case "search-jobs":
			return mapSearch(s, markdown);
		case "setup-profile":
			return mapProfile(s, markdown);
		case "due-followups":
			return mapFollowups(s, markdown);
		default:
			return {
				view: TOOL_VIEWS[toolName] ?? "overview",
				title: TOOL_LABELS[toolName] ?? toolName,
				markdown,
			};
	}
}
