import { checkWritingBans, sectionHeadings } from "@/lib/latex.ts";

/**
 * Server-side document safety signals (ticket 06). Pure checks over the
 * generated TeX: page budgets enforced by content shaping, LaTeX safety
 * signals, and layout signals mirroring tools/verify_layout.py. The
 * server never compiles; the host owns compilation and visual inspection.
 */

export type DocumentKind = "cv" | "letter";

export interface PageBudget {
	kind: DocumentKind;
	pageLimit: number;
	wordCount: number;
	wordBudgetMin: number | null;
	wordBudgetMax: number | null;
	overBudget: boolean;
	/** Content cuts in cutting order; never geometry squeezing. */
	shapingNotes: string[];
}

const CV_WORD_LIMIT = 950;
const LETTER_WORD_MIN = 250;
const LETTER_WORD_MAX = 300;

const CV_CUTTING_ORDER = [
	"Trim older experience bullets to one line each, oldest roles first.",
	"Cut publications beyond the most recent three.",
	"Reduce competencies to the 5-7 most relevant to the posting.",
	"Shorten the profile statement to three lines.",
];

/**
 * Prose text of a TeX source: commands stripped, braces dropped, newlines
 * kept (same shape the word count uses; shared with the prep probeable
 * pass so generated CVs read as prose, not markup).
 */
export function stripTexToProse(tex: string): string {
	return tex
		.replace(/\\[a-zA-Z]+\*?/g, " ")
		.replace(/[{}[\]%]/g, " ")
		.replace(/[^A-Za-z0-9+#'\s-]/g, " ");
}

/** Words of text content: commands stripped, braces dropped, whitespace split. */
export function countTexWords(tex: string): number {
	return stripTexToProse(tex)
		.split(/\s+/)
		.filter((word) => word.length > 0).length;
}

/**
 * Page-budget signals: CV two pages, letter one page with a 250-300 word
 * budget. Overruns report content cuts in cutting order; geometry is
 * never squeezed to fit.
 */
export function pageBudget(kind: DocumentKind, tex: string): PageBudget {
	const wordCount = countTexWords(tex);
	if (kind === "cv") {
		const overBudget = wordCount > CV_WORD_LIMIT;
		return {
			kind,
			pageLimit: 2,
			wordCount,
			wordBudgetMin: null,
			wordBudgetMax: CV_WORD_LIMIT,
			overBudget,
			shapingNotes: overBudget
				? [`${wordCount} words exceeds the ~${CV_WORD_LIMIT}-word two-page estimate.`, ...CV_CUTTING_ORDER]
				: [],
		};
	}
	const overBudget = wordCount > LETTER_WORD_MAX;
	const notes: string[] = [];
	if (overBudget) {
		notes.push(
			`${wordCount} words exceeds the 250-300 word one-page band; cut the weakest bullet first, then tighten the company connection.`,
		);
	} else if (wordCount < LETTER_WORD_MIN) {
		notes.push(
			`${wordCount} words is below the 250-300 word band; expand the task-solving bullets from verified specifics.`,
		);
	}
	return {
		kind,
		pageLimit: 1,
		wordCount,
		wordBudgetMin: LETTER_WORD_MIN,
		wordBudgetMax: LETTER_WORD_MAX,
		overBudget,
		shapingNotes: notes,
	};
}

export interface SafetyCheck {
	name: string;
	pass: boolean;
	detail: string;
}

export interface LatexSafety {
	passed: boolean;
	checks: SafetyCheck[];
}

function lineOf(tex: string, index: number): number {
	return tex.slice(0, index).split("\n").length;
}

/**
 * LaTeX safety signals: writing bans, bracket bracing, ASCII date
 * ranges, and translated headings. Reported alongside the TeX; the
 * host compiles.
 */
export function latexSafety(
	tex: string,
	options: { language?: string; sections?: string[] } = {},
): LatexSafety {
	const language = options.language ?? "en";
	const sections = options.sections ?? Object.values(sectionHeadings(language));
	const checks: SafetyCheck[] = [];

	const bans = checkWritingBans(tex);
	checks.push({
		name: "writing-bans",
		pass: bans.length === 0,
		detail: bans.length === 0 ? "No em-dashes, cliches, or apologetic hedging." : bans.join(" | "),
	});

	const unbraced: number[] = [];
	const itemPattern = /\\item\s*\[/g;
	let itemMatch: RegExpExecArray | null;
	while ((itemMatch = itemPattern.exec(tex)) !== null) {
		unbraced.push(lineOf(tex, itemMatch.index));
	}
	checks.push({
		name: "bracket-bracing",
		pass: unbraced.length === 0,
		detail:
			unbraced.length === 0
				? "No itemize bullet begins with an unbraced bracket."
				: `Unbraced \\item [ on line(s) ${unbraced.join(", ")}; wrap the bullet in braces.`,
	});

	const badDates: number[] = [];
	const entryPattern = /\\cventry(\[[^\]]*\])?\{([^{}]*)\}/g;
	let entryMatch: RegExpExecArray | null;
	while ((entryMatch = entryPattern.exec(tex)) !== null) {
		if (/--|–|—/.test(entryMatch[2])) {
			badDates.push(lineOf(tex, entryMatch.index));
		}
	}
	checks.push({
		name: "ascii-date-ranges",
		pass: badDates.length === 0,
		detail:
			badDates.length === 0
				? "Cventry date arguments use single-hyphen ASCII ranges."
				: `Non-ASCII date range on line(s) ${badDates.join(", ")}; use a single hyphen (breaks ATS range splitting otherwise).`,
	});

	const missing = sections.filter((heading) => !tex.includes(heading));
	const knownLanguages = ["en", "es", "de", "fr", "da"];
	const targetSet = new Set(Object.values(sectionHeadings(language)));
	const foreign = knownLanguages
		.filter((other) => other !== language)
		.flatMap((other) =>
			Object.values(sectionHeadings(other)).filter(
				(heading) => heading.length >= 4 && !targetSet.has(heading) && tex.includes(heading),
			),
		);
	const headingsPass = foreign.length === 0 && (sections.length === 0 || missing.length < sections.length);
	checks.push({
		name: "translated-headings",
		pass: headingsPass,
		detail:
			foreign.length > 0
				? `Wrong-language headings present: ${[...new Set(foreign)].join(" | ")}.`
				: missing.length === sections.length && sections.length > 0
					? `Missing headings: ${missing.join(" | ")}.`
					: `Section headings match the CV language (${language}).`,
	});

	return { passed: checks.every((check) => check.pass), checks };
}

export interface BBoxLine {
	top: number;
	bottom: number;
	left: number;
	height: number;
	text: string;
}

export interface BBoxPage {
	height: number;
	lines: BBoxLine[];
}

export interface LayoutSignals {
	degraded: boolean;
	note: string | null;
	problems: string[];
}

/** Thresholds mirror tools/verify_layout.py exactly. */
const GAP_LIMIT_PT = 100.0;
const BOTTOM_LIMIT_FRACTION = 0.25;
const LAST_PAGE_THIN_FRACTION = 0.35;
const FOOTER_BAND_PT = 90.0;
const INDENT_PT = 8.0;
const HEADING_HEIGHT_RATIO = 1.25;

function bodyLines(page: BBoxPage): BBoxLine[] {
	return page.lines.filter((line) => line.top < page.height - FOOTER_BAND_PT);
}

function medianHeight(lines: BBoxLine[]): number {
	const heights = lines.map((line) => line.height).sort((a, b) => a - b);
	return heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 0;
}

/**
 * Layout signals mirroring the mechanical checks. Without bounding-box
 * geometry the signal is explicitly degraded: no verdict is invented and
 * the host script is named.
 */
export function layoutSignals(bboxes?: BBoxPage[]): LayoutSignals {
	if (!bboxes) {
		return {
			degraded: true,
			note: "Bounding-box extraction is unavailable on the server; the host runs tools/verify_layout.py after compiling with the declared toolchain. No layout verdict invented.",
			problems: [],
		};
	}
	const problems: string[] = [];
	const bodies = bboxes.map(bodyLines);
	const docLines = bodies.flat();
	const docLeft = docLines.length > 0 ? Math.min(...docLines.map((line) => line.left)) : 0;

	bboxes.forEach((page, index) => {
		const pageNo = index + 1;
		const body = bodies[index];
		if (body.length === 0) {
			problems.push(`p${pageNo} contains no text`);
			return;
		}
		const tops = [...new Set(body.map((line) => Math.round(line.top * 10) / 10))].sort((a, b) => a - b);
		let gap = 0;
		let gapY = 0;
		for (let i = 0; i < tops.length - 1; i++) {
			if (tops[i + 1] - tops[i] > gap) {
				gap = tops[i + 1] - tops[i];
				gapY = tops[i];
			}
		}
		const bottomSpace = page.height - Math.max(...body.map((line) => line.bottom));
		const share = bottomSpace / page.height;
		if (gap > GAP_LIMIT_PT) {
			problems.push(`p${pageNo} has a ${gap.toFixed(0)}pt hole at y${gapY.toFixed(0)}. Shorten the entry that follows the hole.`);
		}
		if (index < bboxes.length - 1 && share > BOTTOM_LIMIT_FRACTION) {
			problems.push(`p${pageNo} ends ${(share * 100).toFixed(0)}% early although more pages follow.`);
		}
		const footerTops = new Set(
			page.lines.filter((line) => line.top >= page.height - FOOTER_BAND_PT).map((line) => Math.round(line.top * 10) / 10),
		);
		if (footerTops.size > 1) {
			problems.push(`p${pageNo} has body text inside the bottom margin band; cut content.`);
		}
		if (index === bboxes.length - 1 && bboxes.length > 1 && share > LAST_PAGE_THIN_FRACTION) {
			problems.push(`p${pageNo} is the last page and ${(share * 100).toFixed(0)}% empty; restore cut content.`);
		}
	});

	for (let i = 0; i < bboxes.length - 1; i++) {
		const here = bodies[i];
		const next = bodies[i + 1];
		if (here.length === 0 || next.length === 0) {
			continue;
		}
		const last = here[here.length - 1];
		const first = next[0];
		const median = medianHeight(here);
		if (median > 0 && last.height > median * HEADING_HEIGHT_RATIO) {
			problems.push(
				`p${i + 1} ends on the section heading '${last.text.trim()}' with its content on p${i + 2}.`,
			);
		} else if (last.left <= docLeft + INDENT_PT && first.left > docLeft + INDENT_PT) {
			if (!/\w/.test(last.text)) {
				problems.push(`p${i + 1} ends on a lone list marker whose text continues on p${i + 2}.`);
			} else {
				problems.push(
					`p${i + 1} ends on '${last.text.trim().slice(0, 60)}' while p${i + 2} opens with '${first.text.trim().slice(0, 60)}': entry header orphaned. Add \\needspace before that \\cventry, or shorten it`,
				);
			}
		}
	}

	return { degraded: false, note: null, problems };
}

export interface DocumentSignals {
	pageBudget: PageBudget;
	latexSafety: LatexSafety;
	layout: LayoutSignals;
}

/** Bundles every server-side signal for one generated document. */
export function documentSignals(
	kind: DocumentKind,
	tex: string,
	options: { language?: string; sections?: string[]; bboxes?: BBoxPage[] } = {},
): DocumentSignals {
	return {
		pageBudget: pageBudget(kind, tex),
		latexSafety: latexSafety(tex, options),
		layout: layoutSignals(options.bboxes),
	};
}
