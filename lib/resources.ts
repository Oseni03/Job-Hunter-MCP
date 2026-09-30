import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_PROFILE } from "@/lib/profile.ts";
import { RESEARCH_TTL_DAYS } from "@/lib/research-company.ts";

/**
 * Versioned resource and prompt catalog (ticket 06). Private server
 * defaults are embedded here; a per-call override always wins. Missing
 * entries degrade to explicit errors, never guesses. The host owns every
 * write and all compilation; the server only serves text plus signals.
 */

export interface ResourceDescriptor {
	uri: string;
	name: string;
	title: string;
	description: string;
	version: number;
	mimeType: string;
}

interface ResourceBody extends ResourceDescriptor {
	text: string;
}

function profileText(): string {
	const lines = [
		"# Candidate profile (server default v1)",
		"",
		`Name: ${DEFAULT_PROFILE.name}`,
		`Location: ${DEFAULT_PROFILE.location} (${DEFAULT_PROFILE.constraints})`,
		`Work country: ${DEFAULT_PROFILE.workCountry}`,
		`Citizenships: ${DEFAULT_PROFILE.citizenships.join(", ") || "undeclared"}`,
		`Permit classes: ${DEFAULT_PROFILE.permitClasses.join(", ") || "undeclared"}`,
		`Languages: ${DEFAULT_PROFILE.languages.map((entry) => `${entry.language} (${entry.level})`).join(", ") || "undeclared"}`,
		`Primary skills: ${DEFAULT_PROFILE.primarySkills.join(", ") || "unset; run /setup"}`,
		`Secondary skills: ${DEFAULT_PROFILE.secondarySkills.join(", ") || "unset"}`,
		`Strong domains: ${DEFAULT_PROFILE.strongDomains.join(", ") || "unset"}`,
		`Adjacent domains: ${DEFAULT_PROFILE.adjacentDomains.join(", ") || "unset"}`,
		`Career goals: ${DEFAULT_PROFILE.careerGoals.join(", ") || "unset"}`,
		"",
		"Per-call profile overrides replace these defaults field by field.",
	];
	return lines.join("\n");
}

const RESOURCES: ResourceBody[] = [
	{
		uri: "job-hunter://profile/candidate",
		name: "candidate-profile",
		title: "Candidate profile",
		description: "Identity, skills, domains, goals, and constraints every tool grounds its output in.",
		version: 1,
		mimeType: "text/markdown",
		text: profileText(),
	},
	{
		uri: "job-hunter://profile/behavioral",
		name: "behavioral-profile",
		title: "Behavioral profile",
		description: "Energizing and draining tasks plus strengths used for behavioral scoring and steer-away notes.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Behavioral profile (server default v1)",
			"",
			`Energizing tasks: ${DEFAULT_PROFILE.energizingTasks.join(", ") || "unset; run /setup"}`,
			`Draining tasks: ${DEFAULT_PROFILE.drainingTasks.join(", ") || "unset"}`,
			"",
			"Energizing tasks add to the behavioral score; draining tasks subtract and become steer-away notes.",
		].join("\n"),
	},
	{
		uri: "job-hunter://rules/writing",
		name: "writing-rules",
		title: "Writing rules",
		description: "Bans and voice rules enforced on every generated document.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Writing rules (server default v1)",
			"",
			"- No em-dashes; use commas, periods, or restructure.",
			"- No cliches (passionate about, hit the ground running, synergies, ...).",
			"- No apologetic hedging (I think I could, I hope to, ...).",
			"- Active first-person voice throughout.",
			"- No unverified company claims; caller-verified specifics only.",
			"- LaTeX safety: escape specials, brace leading-bracket bullets, ASCII date ranges.",
		].join("\n"),
	},
	{
		uri: "job-hunter://framework/evaluation",
		name: "evaluation-framework",
		title: "Evaluation framework",
		description: "Five-dimension weights, verdict bands, and gates shared by evaluation and triage.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Evaluation framework (server default v1)",
			"",
			"- Dimensions and weights: Technical 30, Experience 25, Behavioral 15, Career 30.",
			"- Location is PASS/FAIL/FLAG and never weighted.",
			"- Verdict bands: 75 Strong Fit, 60 Good Fit, 45 Moderate Fit, 30 Weak Fit, below Poor Fit.",
			"- Gates run first: Eligibility (citizenship/clearance FAIL stops), Language Gate (undeclared FAIL, higher-bar FLAG).",
		].join("\n"),
	},
	{
		uri: "job-hunter://templates/cv",
		name: "cv-template",
		title: "CV template guidance",
		description: "Stock moderncv banking contract: two pages, translated headings, lualatex toolchain.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# CV template guidance (server default v1)",
			"",
			"- Stock template: moderncv banking, compiled by the host with lualatex to exactly 2 pages.",
			"- Section headings follow the CV language; every non-English CV swaps each one.",
			"- No orphaned \\cventry titles: \\needspace before long entries, \\enlargethispage sparingly.",
			"- An active custom template override (source extension, compile command, page limit, style rules) wins over this guidance.",
		].join("\n"),
	},
	{
		uri: "job-hunter://templates/cover-letter",
		name: "cover-template",
		title: "Cover letter template guidance",
		description: "Stock cover.cls contract: one page, 250-300 words, xelatex toolchain.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Cover letter template guidance (server default v1)",
			"",
			"- Stock template: cover.cls, compiled by the host with xelatex to exactly 1 page.",
			"- Forward-looking task-solving: opening plus bullets plus company connection plus fit plus close, 250-300 words.",
			"- Salutation and structure follow the posting language.",
			"- An active custom template override wins over this guidance.",
		].join("\n"),
	},
	{
		uri: "job-hunter://reference/cv-master",
		name: "cv-master-reference",
		title: "CV master reference",
		description: "Master CV factual source: the audit union member every claim traces to.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# CV master reference (server default v1)",
			"",
			"- The master CV joins the factual-audit union with the candidate profile and workspace profile; every generated claim traces to at least one member.",
			"- Caller-supplied masterCvText wins over any server copy; generation never depends on server disk.",
			"- Structure only: competencies, experience, education. Never invent dates, titles, or outcomes.",
			"- Template version: stock moderncv banking v1 (lualatex, exactly 2 pages); framework version: evaluation v1.",
		].join("\n"),
	},
	{
		uri: "job-hunter://reference/cover-example",
		name: "cover-example",
		title: "Cover letter structural example",
		description: "Structural reference for cover.cls letters plus the one-page compile contract.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Cover example (server default v1)",
			"",
			"- Host file: cover_letters/cover_example.tex (structural reference only, never a fact source).",
			"- Pattern: itemize sits OUTSIDE \\lettercontent{} and is wrapped in Raleway-Medium so the bullet font matches the body.",
			"- Contract: xelatex to exactly 1 page, 250-300 words; signature fits without orphaned lines.",
			"- Template version: cover.cls v1; framework version: evaluation v1.",
		].join("\n"),
	},
	{
		uri: "job-hunter://strategy/search-queries",
		name: "search-query-strategy",
		title: "Search query strategy",
		description: "Function-based, per-language query strategy with the 14-day window and portal-first order.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Search query strategy (server default v1)",
			"",
			"- Organize by function, not title; render every category in every profile language.",
			"- Scope: last 14 days; unknown dates flagged, never dropped; result cap 20 per call.",
			"- Order: installed portal CLIs first, BrightData when configured, web-search fallback otherwise.",
			"- Never scrape people-search pages; never fabricate postings.",
			"- Framework version: evaluation v1.",
		].join("\n"),
	},
	{
		uri: "job-hunter://templates/cv-variants",
		name: "cv-variant-listing",
		title: "Base CV variant listing",
		description: "Listable base variants plus single-variant fetch with caller-supplied fallback.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Base CV variants (server default v1)",
			"",
			"- moderncv-banking: stock banking preamble for English CVs (lualatex, 2 pages).",
			"- moderncv-classic: classic preamble alternative (lualatex, 2 pages).",
			"- Fetch one variant with getCvVariant(name); pass caller base content via resolveBaseContent so tailoring never depends on server disk.",
			"- Template version: moderncv stock v1.",
		].join("\n"),
	},
	{
		uri: "job-hunter://state/seen-keys",
		name: "seen-keys-pointer",
		title: "Seen-keys state pointer",
		description: "Caller-held dedup identifiers and counts only; never full backlog contents.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Seen-keys pointer (server default v1)",
			"",
			"- The host owns seen_jobs.json; tools accept caller-passed seenKeys[] and return stability-ready keys plus seenSkipped counts.",
			"- This resource carries identifiers and counts only, never full backlog contents (state-through-tool invariant).",
			"- Missing store degrades to an explicit message; nothing is guessed.",
		].join("\n"),
	},
	{
		uri: "job-hunter://state/tracker",
		name: "tracker-pointer",
		title: "Application tracker pointer",
		description: "Caller-held application tracker pointer; portable rows only, never full contents.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Tracker pointer (server default v1)",
			"",
			"- The host owns job_search_tracker.csv; record-application returns a portable row plus full tracker text for verbatim write.",
			"- This resource carries identifiers and counts only, never full tracker contents (state-through-tool invariant).",
			"- Missing tracker degrades to an explicit message; nothing is guessed.",
		].join("\n"),
	},
	{
		uri: "job-hunter://research/companies",
		name: "research-pointer",
		title: "Per-company research pointer",
		description: "Pattern for per-company entries: job-hunter://research/company/<slug> with TTL and caller fallback.",
		version: 1,
		mimeType: "text/markdown",
		text: [
			"# Per-company research pointer (server default v1)",
			"",
			"- Per-company entries live at job-hunter://research/company/<slug> (slug: lowercase hyphen, e.g. acme-corp).",
			"- Backed by company_research/<slug>.json with a 30-day TTL; stale or missing entries degrade to explicit messages, never guesses.",
			"- Caller-supplied cache content wins over server disk so generation never depends on it.",
			"- Framework version: evaluation v1.",
		].join("\n"),
	},
];

export function listResources(): ResourceDescriptor[] {
	return RESOURCES.map(({ text: _text, ...descriptor }) => descriptor);
}

export type ResourceRead =
	| { ok: true; uri: string; version: number; text: string; overridden: boolean }
	| { ok: false; uri: string; error: string };

/** Server default text, or the per-call override when one is supplied. */
export function getResource(uri: string, override?: string): ResourceRead {
	const entry = RESOURCES.find((resource) => resource.uri === uri);
	if (!entry) {
		return { ok: false, uri, error: `Unknown resource ${uri}; no default exists and nothing was guessed.` };
	}
	if (override !== undefined) {
		return { ok: true, uri, version: entry.version, text: override, overridden: true };
	}
	return { ok: true, uri, version: entry.version, text: entry.text, overridden: false };
}

export interface CvVariantDescriptor {
	name: string;
	description: string;
}

const CV_VARIANTS: Record<string, { description: string; content: string }> = {
	"moderncv-banking": {
		description: "Stock moderncv banking preamble for English CVs (lualatex, 2 pages).",
		content: [
			"\\documentclass[11pt,a4paper]{moderncv}",
			"\\moderncvstyle{banking}",
			"\\moderncvcolor{blue}",
			"% Host compiles with lualatex to exactly 2 pages.",
		].join("\n"),
	},
	"moderncv-classic": {
		description: "Stock moderncv classic preamble as a base variant alternative.",
		content: [
			"\\documentclass[11pt,a4paper]{moderncv}",
			"\\moderncvstyle{classic}",
			"\\moderncvcolor{blue}",
			"% Host compiles with lualatex to exactly 2 pages.",
		].join("\n"),
	},
};

/** Base CV variants are listable and fetchable without touching server disk. */
export function listCvVariants(): CvVariantDescriptor[] {
	return Object.entries(CV_VARIANTS).map(([name, variant]) => ({ name, description: variant.description }));
}

export type VariantRead =
	| { ok: true; name: string; text: string; fromCaller: boolean }
	| { ok: false; name: string; error: string };

export function getCvVariant(name: string): VariantRead {
	const variant = CV_VARIANTS[name];
	if (!variant) {
		return {
			ok: false,
			name,
			error: `Unknown base variant ${name}; available: ${Object.keys(CV_VARIANTS).join(", ")}.`,
		};
	}
	return { ok: true, name, text: variant.content, fromCaller: false };
}

/**
 * Direct passthrough of caller-supplied base content as fallback, so
 * tailoring never depends on server disk. Caller content always wins.
 */
export function resolveBaseContent(name: string, callerContent?: string): VariantRead {
	if (callerContent !== undefined && callerContent.trim() !== "") {
		return { ok: true, name, text: callerContent, fromCaller: true };
	}
	return getCvVariant(name);
}

export interface ResearchResourceOptions {
	cacheDir?: string;
	callerContent?: string;
	now?: Date;
}

export type ResearchResourceRead =
	| { ok: true; slug: string; uri: string; version: number; text: string; fromCaller: boolean }
	| { ok: false; slug: string; uri: string; error: string };

function normalizeSlug(slug: string): string {
	return slug
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function researchFresh(fetchedDate: string, now: Date): boolean {
	const fetched = new Date(`${fetchedDate}T00:00:00Z`).getTime();
	if (Number.isNaN(fetched)) {
		return false;
	}
	return now.getTime() - fetched <= RESEARCH_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Per-company research entries with caller-supplied fallback, so
 * generation never depends on server disk. Stale or missing entries
 * degrade to explicit messages rather than guesses, preserving the
 * state-through-tool invariant (identifiers and counts only elsewhere).
 */
export function getCompanyResearchResource(
	slug: string,
	options: ResearchResourceOptions = {},
): ResearchResourceRead {
	const normalized = normalizeSlug(slug);
	const uri = `job-hunter://research/company/${normalized || slug}`;
	const now = options.now ?? new Date();
	if (options.callerContent !== undefined && options.callerContent.trim() !== "") {
		try {
			const entry = JSON.parse(options.callerContent) as { fetched_date?: string };
			if (entry.fetched_date && researchFresh(entry.fetched_date, now)) {
				return { ok: true, slug: normalized, uri, version: 1, text: options.callerContent, fromCaller: true };
			}
			return {
				ok: false,
				slug: normalized,
				uri,
				error: `Research entry for ${slug} is stale or undated in caller content; re-run research-company. Nothing was guessed.`,
			};
		} catch {
			return {
				ok: false,
				slug: normalized,
				uri,
				error: `Caller research content for ${slug} is unparseable; re-run research-company. Nothing was guessed.`,
			};
		}
	}
	if (options.cacheDir) {
		const path = join(options.cacheDir, `${normalized}.json`);
		if (!existsSync(path)) {
			return {
				ok: false,
				slug: normalized,
				uri,
				error: `No research entry for ${slug} at ${path}; run research-company first. Nothing was guessed.`,
			};
		}
		try {
			const text = readFileSync(path, "utf-8");
			const entry = JSON.parse(text) as { fetched_date?: string };
			if (entry.fetched_date && researchFresh(entry.fetched_date, now)) {
				return { ok: true, slug: normalized, uri, version: 1, text, fromCaller: false };
			}
			return {
				ok: false,
				slug: normalized,
				uri,
				error: `Research entry for ${slug} is stale (fetched ${entry.fetched_date ?? "unknown"}); re-run research-company. Nothing was guessed.`,
			};
		} catch {
			return {
				ok: false,
				slug: normalized,
				uri,
				error: `Research entry for ${slug} is unparseable; re-run research-company. Nothing was guessed.`,
			};
		}
	}
	return {
		ok: false,
		slug: normalized,
		uri,
		error: `No research entry for ${slug} held; supply caller content or a cache dir, or run research-company. Nothing was guessed.`,
	};
}

export interface PromptDescriptor {
	name: string;
	title: string;
	description: string;
	version: number;
}

interface PromptBody extends PromptDescriptor {
	text: string;
}

const PROMPTS: PromptBody[] = [
	{
		name: "apply",
		title: "Apply workflow",
		description: "End-to-end application flow from fetch to record.",
		version: 1,
		text: "Apply: fetch with escalation and host verification, gate then score, ask to proceed, draft with coverage and grounding audit, revise, mandatory compile and inspect, text-layer and keyword verification, then record. Full step checklist lands with ticket 11.",
	},
	{
		name: "rank",
		title: "Rank workflow",
		description: "Batch triage flow from focus text to shortlist.",
		version: 1,
		text: "Rank: parse focus and limits, load state, batch fetch-or-expired with escalation, aggregate with weights vetoes urgency sweep and staleness, present shortlist and route picks to full evaluation. Full step checklist lands with ticket 11.",
	},
	{
		name: "interview",
		title: "Interview workflow",
		description: "Stage-prep flow from archive to mock run.",
		version: 1,
		text: "Interview: match the tracked application, load the archive with no sibling globs, cache-first research, stage pack with STAR map and logistics, optional mock, close via outcome logging. Full step checklist lands with ticket 11.",
	},
	{
		name: "scrape-health",
		title: "Scrape health workflow",
		description: "Portal-health check flow with bounded probing.",
		version: 1,
		text: "Scrape-health: bounded free-pass scan plus a single sentinel probe with retry; verdicts only from observed output. Full step checklist lands with ticket 11.",
	},
	{
		name: "tailor-flow",
		title: "Tailor workflow",
		description: "Document tailoring flow with page budgets and cutting order.",
		version: 1,
		text: "Tailor-flow: resolve the active template override, read one structural reference each, tailor per section rules with page budgets and cutting order, compile and verify before presenting. Full step checklist lands with ticket 11.",
	},
];

export function listPrompts(): PromptDescriptor[] {
	return PROMPTS.map(({ text: _text, ...descriptor }) => descriptor);
}

export type PromptRead =
	| { ok: true; name: string; version: number; text: string; overridden: boolean }
	| { ok: false; name: string; error: string };

/** Server default prompt text, or the per-call override when one is supplied. */
export function getPrompt(name: string, override?: string): PromptRead {
	const entry = PROMPTS.find((prompt) => prompt.name === name);
	if (!entry) {
		return { ok: false, name, error: `Unknown prompt ${name}; nothing was guessed.` };
	}
	if (override !== undefined) {
		return { ok: true, name, version: entry.version, text: override, overridden: true };
	}
	return { ok: true, name, version: entry.version, text: entry.text, overridden: false };
}
