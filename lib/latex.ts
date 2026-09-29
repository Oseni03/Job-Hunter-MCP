/**
 * LaTeX safety and writing-ban checks shared by both document tools.
 * Rules mirror 05-cv-templates.md, 06-cover-letter-templates.md, and
 * the critical rules in 03-writing-style.md.
 */

const ESCAPES: Record<string, string> = {
	"\\": "\\textbackslash{}",
	"&": "\\&",
	"%": "\\%",
	$: "\\$",
	"#": "\\#",
	_: "\\_",
	"~": "\\textasciitilde{}",
	"^": "\\textasciicircum{}",
	"{": "\\{",
	"}": "\\}",
};

/** Escapes every special in the skill table, plus braces, in a single pass. */
export function escapeLatex(text: string): string {
	return text.replace(/[\\&%$#_~^{}]/g, (char) => ESCAPES[char]);
}

/**
 * Braces an itemize bullet whose text begins with a literal `[`,
 * which LaTeX would otherwise parse as an optional argument.
 */
export function braceItem(text: string): string {
	return text.trimStart().startsWith("[") ? `{${text}}` : text;
}

/**
 * Normalizes a `\cventry` date argument to an ASCII range: a single
 * hyphen, never `--` (renders as U+2013 and breaks ATS range splitting).
 */
export function toAsciiDateRange(dates: string): string {
	return dates.replace(/--|–|—/g, "-");
}

const CLICHES = [
	"I am passionate about",
	"I believe I would be a great fit",
	"leverage my skills",
	"hit the ground running",
	"drive results",
	"synergies",
];

const APOLOGETIC = [
	"I think I could",
	"I think I can",
	"I hope to",
	"I believe I could",
	"I believe I would",
];

/**
 * Flags writing-ban violations in generated prose: em-dashes, cliches
 * from the skill list, and apologetic hedging. Returns one message per
 * violation; empty means clean.
 */
export function checkWritingBans(text: string): string[] {
	const violations: string[] = [];
	if (/—|--/.test(text)) {
		violations.push("em-dash: use commas, periods, or restructure instead");
	}
	const lowered = text.toLowerCase();
	for (const cliche of CLICHES) {
		if (lowered.includes(cliche.toLowerCase())) {
			violations.push(`cliche: "${cliche}"`);
		}
	}
	for (const hedge of APOLOGETIC) {
		if (lowered.includes(hedge.toLowerCase())) {
			violations.push(`apologetic hedging: "${hedge}"`);
		}
	}
	return violations;
}

export interface SectionHeadings {
	competencies: string;
	experience: string;
	education: string;
	languages: string;
	publications: string;
	awards: string;
	references: string;
	referencesNote: string;
}

const ENGLISH_HEADINGS: SectionHeadings = {
	competencies: "Core Competencies",
	experience: "Professional Experience",
	education: "Education",
	languages: "Languages",
	publications: "Publications",
	awards: "Honors and Awards",
	references: "References",
	referencesNote: "More references are available upon request.",
};

/** Worked translations (es from 05-cv-templates.md; de/fr/da standard headings); unknown languages fall back to English. */
const TRANSLATED_HEADINGS: Record<string, SectionHeadings> = {
	es: {
		competencies: "Competencias Clave",
		experience: "Experiencia Profesional",
		education: "Educación",
		languages: "Idiomas",
		publications: "Publicaciones",
		awards: "Distinciones y Premios",
		references: "Referencias",
		referencesNote: "Disponibles a solicitud.",
	},
	de: {
		competencies: "Kernkompetenzen",
		experience: "Berufserfahrung",
		education: "Ausbildung",
		languages: "Sprachen",
		publications: "Publikationen",
		awards: "Auszeichnungen und Preise",
		references: "Referenzen",
		referencesNote: "Weitere Referenzen auf Anfrage.",
	},
	fr: {
		competencies: "Compétences clés",
		experience: "Expérience professionnelle",
		education: "Formation",
		languages: "Langues",
		publications: "Publications",
		awards: "Distinctions",
		references: "Références",
		referencesNote: "Références supplémentaires sur demande.",
	},
	da: {
		competencies: "Kernekompetencer",
		experience: "Erhvervserfaring",
		education: "Uddannelse",
		languages: "Sprog",
		publications: "Publikationer",
		awards: "Priser og udmærkelser",
		references: "Referencer",
		referencesNote: "Yderligere referencer kan fremskaffes.",
	},
};

/**
 * Section headings in the CV's language. Headings are literal template
 * text and never translate themselves, so every non-English CV must
 * swap each one.
 */
export function sectionHeadings(language: string): SectionHeadings {
	return TRANSLATED_HEADINGS[language.toLowerCase()] ?? ENGLISH_HEADINGS;
}
