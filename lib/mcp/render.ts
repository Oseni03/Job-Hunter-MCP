import type { Evaluation } from "../evaluate.ts";
import type { RefinementSource } from "../llm.ts";
import type { RequirementMatch } from "../tailor.ts";
import type { RecordPlan } from "../record.ts";
import type { PrepPlan } from "../prep.ts";
import type { StrategyPlan } from "../strategy.ts";
import type { FieldsPlan } from "../fields.ts";

export function renderMarkdown(
	evaluation: Evaluation,
	company: string | undefined,
	role: string | undefined,
	websiteUrl: string | null,
	fetchSteps: string[],
	discrepancies: string[],
	refinement: { source: RefinementSource; model: string | null; note: string },
): string {
	const researchLine = !company
		? "skipped (no company given)"
		: (websiteUrl ?? "attempted, no official site found");
	const lines: string[] = [
		`## Job Fit Evaluation: ${role ?? "Role"} at ${company ?? "Company"}`,
		"",
		"| Dimension | Score | Notes |",
		"|-----------|-------|-------|",
	];
	for (const dim of evaluation.dimensions) {
		const score = dim.score === null ? (dim.status ?? "") : `${dim.score}/100`;
		lines.push(`| ${dim.dimension} | ${score} | ${dim.notes} |`);
	}
	lines.push(
		"",
		`**Overall Score: ${evaluation.overallScore ?? "n/a"}/100** (weighted average of scored dimensions)`,
		"",
		`### Verdict: ${evaluation.verdict ?? "Not scored — a gate failed"}`,
		"",
		"### Key Strengths for This Role",
		...(evaluation.strengths.length > 0 ? evaluation.strengths.map((s) => `- ${s}`) : ["- none identified"]),
		"",
		"### Gaps to Address",
		...(evaluation.gaps.length > 0 ? evaluation.gaps.map((g) => `- ${g}`) : ["- none identified"]),
		"",
		"### Recommendation",
		evaluation.recommendation,
		"",
		"### Gates",
		`- Eligibility: ${evaluation.eligibility.verdict} — ${evaluation.eligibility.quote ?? evaluation.eligibility.note}`,
		`- Language: ${evaluation.languageGate.verdict} — ${evaluation.languageGate.quote ?? evaluation.languageGate.note}`,
		"",
		"### Pre-Application: Call the Employer",
		`- Suggest calling: ${evaluation.shouldCallEmployer.suggest ? "yes" : "no"} — ${evaluation.shouldCallEmployer.reason}`,
		"- needsConfirmation: true (confirm with the candidate before drafting)",
		"",
		"### Meta",
		`- Deadline: ${evaluation.deadline ?? "not stated"}`,
		`- Source: ${evaluation.source}`,
		`- Fetch escalation: ${fetchSteps.join(" > ")}`,
		`- Company research: ${researchLine}`,
		`- Refinement: ${refinement.source}${refinement.model ? ` (${refinement.model})` : ""} — ${refinement.note}`,
	);
	for (const discrepancy of discrepancies) {
		lines.push(`- Discrepancy: ${discrepancy}`);
	}
	return lines.join("\n");
}

export function coverageLines(coverage: RequirementMatch[]): string[] {
	return coverage.map(
		(item) =>
			`- [${item.status}] (${item.kind}) ${item.requirement}${item.evidence ? ` - ${item.evidence}` : ""}`,
	);
}

export function renderTailoredCvMarkdown(output: {
	slug: string;
	filePath: string;
	compileCommand: string;
	pageLimit: number;
	archiveDir: string;
	coverage: RequirementMatch[];
	warnings: {
		profileConsistency: string[];
		draftDrift: string[];
		stretchChoices: { bullet: string; reason: string }[];
		reframingWarning?: string;
		templateNote?: string;
		contactNote?: string;
	};
	banViolations: string[];
}): string {
	const lines = [
		`## Tailored CV: \`${output.filePath}\``,
		"",
		`- Slug: \`${output.slug}\` (shared with the cover letter and archive path)`,
		`- Archive: \`${output.archiveDir}/\` (record-application owns the write)`,
		`- Compile: \`${output.compileCommand}\` (exactly ${output.pageLimit} pages)`,
		"",
		"### Requirement coverage",
		...coverageLines(output.coverage),
		"",
		"### Stretch choices (keep, soften, or drop?)",
		...(output.warnings.stretchChoices.length > 0
			? output.warnings.stretchChoices.map((choice) => `- ${choice.bullet}: ${choice.reason}`)
			: ["- none"]),
	];
	if (output.warnings.reframingWarning) {
		lines.push("", `> ${output.warnings.reframingWarning}`);
	}
	for (const warning of [
		...output.warnings.profileConsistency,
		...output.warnings.draftDrift,
		...(output.warnings.templateNote ? [output.warnings.templateNote] : []),
		...(output.warnings.contactNote ? [output.warnings.contactNote] : []),
		...output.banViolations,
	]) {
		lines.push(`- Warning: ${warning}`);
	}
	return lines.join("\n");
}

export function renderCoverMarkdown(output: {
	slug: string;
	filePath: string;
	compileCommand: string;
	pageLimit: number;
	archiveDir: string;
	wordCount: number;
	coverage: RequirementMatch[];
	logistics: { workMode: string | null; deadline: string | null; referenceId: string | null };
	warnings: {
		profileConsistency: string[];
		draftDrift: string[];
		stretchChoices: { bullet: string; reason: string }[];
		wordCountNote?: string;
		templateNote?: string;
		contactNote?: string;
	};
	banViolations: string[];
}): string {
	const lines = [
		`## Cover Letter: \`${output.filePath}\``,
		"",
		`- Slug: \`${output.slug}\` (shared with the CV and archive path)`,
		`- Archive: \`${output.archiveDir}/\` (record-application owns the write)`,
		`- Words: ${output.wordCount} (band 250-300)`,
		`- Compile: \`${output.compileCommand}\` (exactly ${output.pageLimit} page)`,
		`- Logistics: ${output.logistics.workMode ?? "not stated"} | deadline ${output.logistics.deadline ?? "not stated"} | ref ${output.logistics.referenceId ?? "none"}`,
		"",
		"### Requirement coverage",
		...coverageLines(output.coverage),
		"",
		"### Stretch choices (keep, soften, or drop?)",
		...(output.warnings.stretchChoices.length > 0
			? output.warnings.stretchChoices.map((choice) => `- ${choice.bullet}: ${choice.reason}`)
			: ["- none"]),
	];
	for (const warning of [
		...output.warnings.profileConsistency,
		...output.warnings.draftDrift,
		...(output.warnings.wordCountNote ? [output.warnings.wordCountNote] : []),
		...(output.warnings.templateNote ? [output.warnings.templateNote] : []),
		...(output.warnings.contactNote ? [output.warnings.contactNote] : []),
		...output.banViolations,
	]) {
		lines.push(`- Warning: ${warning}`);
	}
	return lines.join("\n");
}

export function renderRecordMarkdown(plan: RecordPlan): string {
	const lines = [
		`## Record application: ${plan.action}`,
		"",
		`- Row: \`${plan.row}\``,
		...(plan.rowIndex === null ? [] : [`- Updated data row ${plan.rowIndex} (other rows untouched)`]),
		...(plan.appendedAlongsideFinal ? ["- Appended alongside final rows for the same company and role"] : []),
		...(plan.headerUpgraded ? ["- Legacy header upgraded with the deadline column"] : []),
		"",
		...(plan.archiveText !== null && plan.archiveFile
			? [`- Archive: \`${plan.archiveFile}\` (host writes unless it exists)`]
			: [`- Archive skipped: ${plan.archiveNote ?? "no archive file resolved"}`]),
		"",
		"- Host owns the writes: job_search_tracker.csv gets the returned tracker text verbatim; seen_jobs.json is never touched.",
	];
	return lines.join("\n");
}

/** The prep pack markdown is the content; the host saves it to packFile. */
export function renderPrepMarkdown(plan: PrepPlan): string {
	return plan.packMarkdown;
}

export function renderStrategyMarkdown(plan: StrategyPlan): string {
	const lines = [
		"## Career strategy",
		"",
		...plan.directions.flatMap((direction) => [
			`### ${direction.direction}`,
			...direction.why.map((reason) => `- ${reason}`),
			`- Evidence: ${direction.evidence.join(", ") || "none"}`,
			...(direction.gapsToClose.length > 0
				? [`- Gaps to close: ${direction.gapsToClose.join(" | ")}`]
				: ["- Gaps to close: none identified"]),
			`- Framework dimensions: ${direction.dimensions.join(", ")}`,
			"",
		]),
		...(plan.skipped.length > 0
			? ["### Honestly skipped (no grounding, never recommended)", ...plan.skipped.map((entry) => `- ${entry}`), ""]
			: []),
		...(plan.avoidNotes.length > 0
			? ["### Steer away", ...plan.avoidNotes.map((note) => `- ${note}`), ""]
			: []),
		`_${plan.frameworkNote}_`,
		...plan.warnings.map((warning) => `- Warning: ${warning}`),
	];
	return lines.join("\n");
}

/** The copy-paste file text is the content; the host saves it to filePath. */
export function renderFieldsMarkdown(plan: FieldsPlan): string {
	return plan.copyPasteText;
}
