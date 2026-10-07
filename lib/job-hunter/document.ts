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
		awards: "Auszeichnungen",
		references: "Referenzen",
		referencesNote: "Referenzen auf Anfrage verfügbar.",
	},
	fr: {
		competencies: "Compétences clés",
		experience: "Expérience professionnelle",
		education: "Formation",
		languages: "Langues",
		publications: "Publications",
		awards: "Distinctions et prix",
		references: "Références",
		referencesNote: "Références disponibles sur demande.",
	},
	da: {
		competencies: "Kernekompetencer",
		experience: "Erhvervserfaring",
		education: "Uddannelse",
		languages: "Sprog",
		publications: "Publikationer",
		awards: "Hædersbevisninger og priser",
		references: "Referencer",
		referencesNote: "Referencer kan oplyses efter anmodning.",
	},
};

export function sectionHeadings(language = "en"): SectionHeadings {
	return TRANSLATED_HEADINGS[language.toLowerCase()] ?? ENGLISH_HEADINGS;
}

const CLICHES = [
	"I am passionate about",
	"I believe I would be a great fit",
	"leverage my skills",
	"hit the ground running",
	"drive results",
	"synergies",
];

const APOLOGETIC = ["I think I could", "I think I can", "I hope to", "I believe I could", "I believe I would"];

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

export function normalizeDateRange(value: string): string {
	return value.replace(/--|–|—/g, "-");
}
