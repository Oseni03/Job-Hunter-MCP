import { sanitizeQuote } from "@/lib/job-hunter/evaluate.ts";
import type { Profile } from "@/lib/job-hunter/profile.ts";
import {
	primarySkillNames,
	secondarySkillNames,
	strongDomainNames,
	weakSkillNames,
} from "@/lib/job-hunter/profile.ts";

/**
 * Host-led job research. Hosts (Claude, ChatGPT) search better than the
 * server's fetch escalation, so this planner never fetches: it structures
 * host-gathered findings into an interview-ready brief, labels every claim
 * with its source, cross-checks the profile for fit evidence, and always
 * returns suggested queries so the host can research further. With no
 * findings it degrades to brief mode: guidance only, never invented facts.
 */

export type ResearchTopic = "company" | "role" | "salary" | "culture" | "interview" | "news";

export const RESEARCH_TOPICS: ResearchTopic[] = ["company", "role", "salary", "culture", "interview", "news"];

export interface HostFinding {
	topic: ResearchTopic;
	claim: string;
	sourceUrl?: string;
	sourceType?: string;
}

export interface JobResearchInput {
	profile: Profile;
	company: string;
	role: string;
	postingText?: string;
	findings: HostFinding[];
}

export interface BriefFinding {
	topic: ResearchTopic;
	claim: string;
	sourceLabel: string;
	sourceUrl?: string;
}

export interface JobResearchSourcing {
	sourcedCount: number;
	unsourcedCount: number;
	sources: string[];
	droppedEmpty: number;
}

export interface JobResearchPlan {
	company: string;
	role: string;
	briefMode: boolean;
	snapshot: BriefFinding[];
	fitNotes: string[];
	redFlags: string[];
	questionsToAsk: string[];
	suggestedQueries: string[];
	sourcing: JobResearchSourcing;
	warnings: string[];
}

/** Currency-figure heuristic (symbol-led or magnitude-led); flags pay claims that need a source before citing. */
const PAY_FIGURE = /([$€£₦]\s?\d|\b\d+\s?(k\b|USD|EUR|NGN|GBP))/i;

const TOPIC_LABELS: Record<ResearchTopic, string> = {
	company: "Company",
	role: "Role",
	salary: "Salary",
	culture: "Culture",
	interview: "Interview",
	news: "News",
};

export function topicLabel(topic: ResearchTopic): string {
	return TOPIC_LABELS[topic];
}

function clean(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function fitEvidence(profile: Profile, haystack: string): string[] {
	const lower = haystack.toLowerCase();
	const notes: string[] = [];
	const seen = new Set<string>();
	const check = (skills: string[], kind: string): void => {
		for (const skill of skills) {
			const name = skill.trim();
			if (name.length < 3 || seen.has(name.toLowerCase())) continue;
			if (lower.includes(name.toLowerCase())) {
				seen.add(name.toLowerCase());
				notes.push(`"${name}" appears in the findings and matches your ${kind}`);
			}
		}
	};
	check(primarySkillNames(profile), "core strengths");
	check(secondarySkillNames(profile), "secondary skills");
	check(strongDomainNames(profile), "strong domains");
	for (const weak of weakSkillNames(profile)) {
		const name = weak.trim();
		if (name.length < 3 || seen.has(`watch:${name.toLowerCase()}`)) continue;
		if (lower.includes(name.toLowerCase())) {
			seen.add(`watch:${name.toLowerCase()}`);
			notes.push(`Watch: "${name}" appears in the findings and is a growth area — prepare a bridge answer`);
		}
	}
	return notes.slice(0, 8);
}

function suggestedQueriesFor(company: string, role: string): string[] {
	return [
		`"${company}" "${role}" salary band`,
		`"${company}" "${role}" interview process`,
		`"${company}" employee reviews engineering culture`,
		`"${company}" layoffs OR funding OR news`,
	];
}

function questionsFor(topics: Set<ResearchTopic>): string[] {
	const questions: string[] = [];
	if (!topics.has("salary")) {
		questions.push("What is the salary band and review cycle for this role?");
	}
	if (!topics.has("interview")) {
		questions.push("What are the interview stages and the hiring timeline?");
	}
	if (!topics.has("culture")) {
		questions.push("How are on-call, scope, and growth handled on this team?");
	}
	return questions.slice(0, 4);
}

export function planJobResearch(input: JobResearchInput): JobResearchPlan {
	const company = clean(input.company);
	const role = clean(input.role);
	const snapshot: BriefFinding[] = [];
	const sources: string[] = [];
	let droppedEmpty = 0;

	for (const finding of input.findings ?? []) {
		const claim = clean(finding.claim);
		if (claim === "") {
			droppedEmpty += 1;
			continue;
		}
		const url = clean(finding.sourceUrl);
		const sourceType = clean(finding.sourceType);
		if (url !== "" && !sources.includes(url)) {
			sources.push(url);
		}
		snapshot.push({
			topic: finding.topic,
			claim: sanitizeQuote(claim),
			sourceLabel:
				url !== ""
					? `Sourced via ${sourceType !== "" ? sourceType : "host search"}`
					: sourceType !== ""
						? `${sourceType} (no URL — unverified)`
						: "Unsourced host note (lead only, never cite)",
			...(url !== "" ? { sourceUrl: url } : {}),
		});
	}

	const briefMode = snapshot.length === 0;
	const topics = new Set(snapshot.map((entry) => entry.topic));
	const haystack = snapshot.map((entry) => entry.claim).join("\n");
	const warnings: string[] = [];
	if (droppedEmpty > 0) {
		warnings.push(`Dropped ${droppedEmpty} empty finding${droppedEmpty === 1 ? "" : "s"}`);
	}

	const redFlags: string[] = [];
	for (const entry of snapshot) {
		if (entry.topic === "salary" && !entry.sourceUrl && PAY_FIGURE.test(entry.claim)) {
			redFlags.push(`Unverified pay figure — confirm before citing: "${entry.claim.slice(0, 120)}"`);
		}
	}
	if (!briefMode && sources.length === 0) {
		redFlags.push("No finding carries a source URL — treat every claim as a lead, never as fact");
	}

	return {
		company,
		role,
		briefMode,
		snapshot,
		fitNotes: fitEvidence(input.profile, haystack),
		redFlags: redFlags.slice(0, 6),
		questionsToAsk: questionsFor(topics),
		suggestedQueries: suggestedQueriesFor(company || "the company", role || "the role"),
		sourcing: {
			sourcedCount: snapshot.filter((entry) => entry.sourceUrl).length,
			unsourcedCount: snapshot.filter((entry) => !entry.sourceUrl).length,
			sources,
			droppedEmpty,
		},
		warnings,
	};
}
