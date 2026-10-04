import type { Locator, Page } from "playwright-core";
import type { ApplyContact, ApplyPack, CustomAnswers, FieldReport } from "../types.ts";

/**
 * Shared fill engine. Hard rules, enforced by construction:
 * - Only text-like inputs, textareas, selects, and file inputs are touched.
 * - Checkboxes, radios, and buttons are never actuated (attestations and
 *   the submit button live there). There is no click/press/submit call
 *   anywhere in this directory; a source-grep test locks that in.
 * - Anything matching SKIP_LABEL (EEO/demographic material) is left for
 *   the human, always.
 */
export const SKIP_LABEL =
	/equal employment|voluntary self|disability|veteran status|gender|race\/ethnicity|ethnicity|demographic|pronouns|date of birth|\bage\b|marital|national origin|sexual orientation/i;

const CONTACT_MATCHERS: Array<{ pattern: RegExp; pick: (c: ApplyContact) => string | undefined; name: string }> = [
	{ pattern: /^first.?name$|given.?name/, pick: (c) => c.firstName, name: "First name" },
	{ pattern: /last.?name|family.?name|surname/, pick: (c) => c.lastName, name: "Last name" },
	{ pattern: /^(full.?name|name)$/, pick: (c) => `${c.firstName} ${c.lastName}`.trim(), name: "Full name" },
	{ pattern: /email/, pick: (c) => c.email, name: "Email" },
	{ pattern: /phone|mobile|telephone/, pick: (c) => c.phone, name: "Phone" },
	{ pattern: /location|city|country/, pick: (c) => c.location, name: "Location" },
	{ pattern: /linkedin/, pick: (c) => c.linkedin, name: "LinkedIn URL" },
	{ pattern: /github/, pick: (c) => c.github, name: "GitHub URL" },
	{ pattern: /portfolio|website|personal.?site|\bblog\b/, pick: (c) => c.website, name: "Website" },
];

export function normalizeLabel(text: string): string {
	return text.toLowerCase().replace(/[*:?\s]+/g, " ").trim();
}

function preview(value: string): string {
	return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

/** Matches a visible label against caller-written answers: exact, then substring either way. */
export function matchAnswer(label: string, answers: CustomAnswers): string | undefined {
	const norm = normalizeLabel(label);
	for (const [key, value] of Object.entries(answers)) {
		if (normalizeLabel(key) === norm && value.trim()) return value;
	}
	for (const [key, value] of Object.entries(answers)) {
		const k = normalizeLabel(key);
		if (value.trim() && k.length > 4 && norm.length > 4 && (norm.includes(k) || k.includes(norm))) return value;
	}
	return undefined;
}

export function matchContact(label: string, contact: ApplyContact): { value: string; name: string } | undefined {
	const norm = normalizeLabel(label);
	for (const matcher of CONTACT_MATCHERS) {
		if (!matcher.pattern.test(norm)) continue;
		const value = matcher.pick(contact);
		if (value && value.trim()) return { value, name: matcher.name };
		return undefined;
	}
	return undefined;
}

/** Visible label text for a field (original casing): <label for>, wrapping label, aria-label, placeholder, name. */
export async function labelFor(input: Locator): Promise<string> {
	const id = await input.getAttribute("id").catch(() => null);
	if (id) {
		const owner = input.page().locator(`label[for="${id}"]`).first();
		if ((await owner.count()) > 0) {
			const text = ((await owner.innerText().catch(() => "")) ?? "").trim();
			if (text) return text;
		}
	}
	const wrap = input.locator("xpath=ancestor::label[1]");
	if ((await wrap.count()) > 0) {
		const text = ((await wrap.first().innerText().catch(() => "")) ?? "").trim();
		if (text) return text;
	}
	for (const attr of ["aria-label", "placeholder", "name"]) {
		const raw = await input.getAttribute(attr).catch(() => null);
		if (raw && raw.trim()) return raw.trim();
	}
	return "(unlabeled field)";
}

async function fillText(page: Page, input: Locator, value: string): Promise<boolean> {
	try {
		await input.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
		await input.fill(value, { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

export async function fillTextField(
	page: Page,
	input: Locator,
	label: string,
	value: string,
	reports: FieldReport[],
): Promise<void> {
	if (SKIP_LABEL.test(label)) {
		reports.push({ field: label, status: "skipped", detail: "EEO/demographic — fill in yourself" });
		return;
	}
	const ok = await fillText(page, input, value);
	reports.push(
		ok
			? { field: label, status: "filled", detail: preview(value) }
			: { field: label, status: "manual", detail: "field rejected programmatic fill" },
	);
}

export async function fillSelectField(
	page: Page,
	select: Locator,
	label: string,
	value: string,
	reports: FieldReport[],
): Promise<void> {
	if (SKIP_LABEL.test(label)) {
		reports.push({ field: label, status: "skipped", detail: "EEO/demographic — fill in yourself" });
		return;
	}
	try {
		const options = await select.locator("option").allInnerTexts().catch(() => [] as string[]);
		const want = value.toLowerCase();
		const hit = options.find((text) => {
			const t = text.toLowerCase().trim();
			return t.length > 0 && (t === want || want.includes(t) || t.includes(want));
		});
		if (!hit) {
			reports.push({ field: label, status: "manual", detail: `no option matched ${JSON.stringify(preview(value))}` });
			return;
		}
		await select.selectOption({ label: hit }, { timeout: 5000 });
		reports.push({ field: label, status: "filled", detail: `selected ${JSON.stringify(preview(hit))}` });
	} catch {
		reports.push({ field: label, status: "manual", detail: "select rejected programmatic fill" });
	}
}

export async function uploadInto(
	page: Page,
	input: Locator,
	label: string,
	filePath: string,
	reports: FieldReport[],
): Promise<void> {
	try {
		await input.setInputFiles(filePath, { timeout: 15000 });
		reports.push({ field: label, status: "filled", detail: `uploaded ${filePath.split(/[\\/]/).pop()}` });
	} catch {
		reports.push({ field: label, status: "manual", detail: `upload failed for ${filePath}` });
	}
}

export function pushManual(reports: FieldReport[], field: string, detail: string): void {
	reports.push({ field, status: "manual", detail });
}

export function pushSkipped(reports: FieldReport[], field: string, detail: string): void {
	reports.push({ field, status: "skipped", detail });
}

const TEXTISH = 'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea, select';

/**
 * Fills every free-text field under a scope (whole page or one modal step):
 * contact keywords, cover text for letter-ish boxes, caller answers matched
 * by visible label. Choice inputs (radio/checkbox) are reported, never
 * actuated. Shared by the Greenhouse and LinkedIn adapters so matching
 * rules cannot drift between them.
 */
export async function fillLabeledFields(
	root: Page | Locator,
	pack: ApplyPack,
	reports: FieldReport[],
	handledIds: Set<string> = new Set(),
): Promise<void> {
	const fields = root.locator(TEXTISH);
	const count = await fields.count();
	for (let i = 0; i < count; i += 1) {
		const input = fields.nth(i);
		const id = (await input.getAttribute("id").catch(() => null)) ?? "";
		if (handledIds.has(id)) continue;
		if (!(await input.isVisible().catch(() => false))) continue;
		const tag = (await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => "")) as string;
		const label = await labelFor(input);
		if (/cover.?letter|additional information|anything else|comments/i.test(label) && tag !== "select" && pack.coverText) {
			await fillTextField(pageOf(root), input, label, pack.coverText, reports);
			continue;
		}
		if (tag === "select") {
			const contactHit = matchContact(label, pack.contact);
			if (contactHit) {
				await fillSelectField(pageOf(root), input, label, contactHit.value, reports);
			} else if (SKIP_LABEL.test(label)) {
				pushSkipped(reports, label, "EEO/demographic — fill in yourself");
			} else {
				pushManual(reports, label, "dropdown with no pack mapping");
			}
			continue;
		}
		const contactHit = matchContact(label, pack.contact);
		if (contactHit) {
			await fillTextField(pageOf(root), input, label, contactHit.value, reports);
			continue;
		}
		const answer = matchAnswer(label, pack.customAnswers);
		if (answer) {
			await fillTextField(pageOf(root), input, label, answer, reports);
			continue;
		}
		pushManual(reports, label, "no pack mapping — paste from the apply pack");
	}
	await reportChoiceGroups(root, reports);
}

function pageOf(root: Page | Locator): Page {
	const asLocator = root as Locator;
	if (typeof asLocator.page === "function") return asLocator.page();
	return root as Page;
}

/** Reports radio/checkbox groups (never actuated): EEO groups as skipped, the rest as manual. */
async function reportChoiceGroups(root: Page | Locator, reports: FieldReport[]): Promise<void> {
	const inputs = root.locator('input[type="radio"], input[type="checkbox"]');
	const seen = new Set<string>();
	const count = await inputs.count();
	for (let i = 0; i < count; i += 1) {
		const input = inputs.nth(i);
		if (!(await input.isVisible().catch(() => false))) continue;
		const name = (await input.getAttribute("name").catch(() => null)) ?? `choice-${i}`;
		if (seen.has(name)) continue;
		seen.add(name);
		const fieldset = input.locator("xpath=ancestor::fieldset[1]");
		const legend =
			((await fieldset.locator("legend").first().innerText().catch(() => "")) ?? "").trim() ||
			(await labelFor(input));
		if (SKIP_LABEL.test(legend)) {
			pushSkipped(reports, legend, "EEO/demographic — fill in yourself");
		} else {
			pushManual(reports, legend, "choice field — pick it yourself");
		}
	}
}

export type { Page };
