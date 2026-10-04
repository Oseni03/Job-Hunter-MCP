import { createHash } from "node:crypto";

/**
 * Canonical dedup key for a job posting (ported from tools/job_key.py, which
 * it replaces). The key is a pure, deterministic function of the posting:
 * truncation is length-capped *and* disambiguated by a hash of the full
 * slug, so a long title always produces the same key and two different long
 * titles never collide. Anything outside [a-z0-9-] becomes a separator, so
 * keys are safe as archive folder names (no "/" splits, no "," surprises).
 * This module also derives the same `<company>_<role>` slug for CV, cover
 * letter, and archive paths so every tool shares one slug without shelling
 * out. The `key`/`audit` CLI surface lives in
 * host/job-hunter/workflow/job-key.ts.
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

/** The canonical key for one posting. */
export function makeKey(company: string, title: string, url = ""): string {
	let companySlug = cap(slugify(company), COMPANY_MAX);
	if (!companySlug) {
		// Python str.casefold() has no JS equivalent; approximate the cases
		// that occur in real company names (ß→ss, İ→i̇, ſ→s, common
		// ligatures) and fall back to toLowerCase for the rest. CJK and
		// other caseless scripts are unaffected either way.
		const name = casefoldApprox(company || "")
			.trim()
			.normalize("NFC");
		companySlug = name ? `company-${sha6(name)}` : "unknown-company";
	}
	let titleSlug = cap(slugify(title), TITLE_MAX);
	if (!titleSlug) {
		const match = JOB_ID.exec(url || "");
		if (match) {
			titleSlug = match[1];
		} else {
			const basis = slugify((title || url || "").normalize("NFKD"));
			// Hash the URL alone when there is one. The URL is the posting's
			// identity; the title is not. Including the title made the key
			// change whenever a portal re-listed the same posting with the
			// title altered, which stores one job twice.
			const digestBasis = url ? `${url}` : `${title}`;
			titleSlug = basis || `untitled-${sha6(digestBasis)}`;
		}
	}
	return `${companySlug}_${titleSlug}`;
}

/** Approximation of Python's str.casefold for company-name hashing. */
export function casefoldApprox(text: string): string {
	return text
		.replace(/ß/g, "ss")
		.replace(/İ/g, "i̇")
		.replace(/ſ/g, "s")
		.replace(/ﬀ/g, "ff")
		.replace(/ﬁ/g, "fi")
		.replace(/ﬂ/g, "fl")
		.replace(/ﬃ/g, "ffi")
		.replace(/ﬄ/g, "ffl")
		.replace(/ﬅ/g, "st")
		.replace(/ﬆ/g, "st")
		.toLowerCase();
}

/** Safe as a dedup key and as an archive folder name. */
export function isCanonical(key: string): boolean {
	return Boolean(key) && CANONICAL.test(key);
}

/**
 * Old three-part "company_title_location" keys. Harmless — no path-breaking
 * character — but not what makeKey produces, so a later run would store the
 * same job under a new key and reintroduce a duplicate. Reported apart from
 * real damage so the fix stays a decision rather than an automatic rename.
 */
export function isLegacyShape(key: string): boolean {
	if (!key || (key.match(/_/g) ?? []).length <= 1) return false;
	return key
		.split("_")
		.filter((part) => part.length > 0)
		.every((part) => /^[a-z0-9][a-z0-9-]*$/.test(part));
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
