import { createHash } from "node:crypto";

/**
 * TypeScript mirror of tools/job_key.py. The Python script stays the
 * canonical rule for seen_jobs.json; this module derives the same
 * `<company>_<role>` slug for CV, cover letter, and archive paths so
 * both tools share one slug without shelling out.
 */

const COMPANY_MAX = 40;
const TITLE_MAX = 60;
const HASH_LEN = 6;
const JOB_ID = /(\d{6,})/;
const CANONICAL = /^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*$/;

function sha6(text: string): string {
	return createHash("sha1").update(text, "utf8").digest("hex").slice(0, HASH_LEN);
}

/** Lowercase ASCII slug. Non-Latin scripts legitimately reduce to "". */
export function slugify(text: string): string {
	if (!text) {
		return "";
	}
	const asciiOnly = text
		.normalize("NFKD")
		.replace(/[^\x00-\x7f]/g, "");
	return asciiOnly
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Caps length with a hash of the full slug so truncation is deterministic. */
function cap(slug: string, limit: number): string {
	if (slug.length <= limit) {
		return slug;
	}
	return `${slug.slice(0, limit).replace(/-+$/, "")}-${sha6(slug)}`;
}

/** The canonical key for one posting (mirrors make_key in job_key.py). */
export function makeKey(company: string, title: string, url = ""): string {
	let companySlug = cap(slugify(company), COMPANY_MAX);
	if (!companySlug) {
		const name = (company || "").normalize("NFC").trim().toLowerCase();
		companySlug = name ? `company-${sha6(name)}` : "unknown-company";
	}
	let titleSlug = cap(slugify(title), TITLE_MAX);
	if (!titleSlug) {
		const match = JOB_ID.exec(url || "");
		if (match) {
			titleSlug = match[1];
		} else {
			const basis = slugify((title || url || "").normalize("NFKD"));
			titleSlug = basis || `untitled-${sha6(`${title}${url}`)}`;
		}
	}
	return `${companySlug}_${titleSlug}`;
}

/** Safe as a dedup key and as an archive folder name. */
export function isCanonical(key: string): boolean {
	return Boolean(key) && CANONICAL.test(key);
}

export const EMPTY_SLUG_ERROR =
	"EMPTY_SLUG: give a company, a role, or a posting URL so a file slug can be derived. No TeX was generated.";

/**
 * The shared `<company>_<role>` slug for CV, letter, and archive path.
 * Returns "" when there is nothing to derive it from; both document
 * tools treat that as a hard error and emit no TeX.
 */
export function makeJobSlug(company?: string, role?: string, url = ""): string {
	if (!company?.trim() && !role?.trim() && !url?.trim()) {
		return "";
	}
	return makeKey(company ?? "", role ?? "", url);
}
