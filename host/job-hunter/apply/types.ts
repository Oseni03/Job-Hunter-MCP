/**
 * Shared shapes for assisted apply: the host assembles an ApplyPack from
 * caller-held facts (contact, tailored answers, compiled PDFs) and the
 * headed filler copies it into the employer's form. The filler never
 * submits; the human reviews and clicks Submit.
 */
export type Ats = "greenhouse" | "lever" | "linkedin" | "unknown";

export interface ApplyUploads {
	/** Compiled CV PDF; uploaded to the resume file input. */
	resume: string;
	/** Compiled cover-letter PDF; uploaded only when the form has a second file input. */
	coverLetter?: string;
}

export interface ApplyContact {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	/** Free-text location ("City, Country"); matched against location inputs/selects. */
	location: string;
	linkedin?: string;
	github?: string;
	website?: string;
}

/**
 * Free-text answers keyed by the question label as the candidate wrote it
 * (e.g. "Why do you want to work here?"). The filler matches them against
 * visible form labels case-insensitively; unmatched answers are reported
 * for manual paste, never forced into the wrong field.
 */
export type CustomAnswers = Record<string, string>;

export interface ApplyPack {
	version: 1;
	postingUrl: string;
	ats: Ats;
	contact: ApplyContact;
	/** Long-form text for "cover letter / additional information" textareas. */
	coverText?: string;
	customAnswers: CustomAnswers;
	uploads: ApplyUploads;
}

export interface FieldReport {
	/** What the filler believed the field to be, e.g. "Email" or "Resume upload". */
	field: string;
	status: "filled" | "skipped" | "manual";
	/** Value preview (truncated) for filled, reason for skipped/manual. */
	detail: string;
}

export interface FillResult {
	ats: Ats;
	url: string;
	fields: FieldReport[];
	screenshotPath: string;
	/** True when the page navigated or a submit trap fired; always false by design. */
	submitted: boolean;
}
