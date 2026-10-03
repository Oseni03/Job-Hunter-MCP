import type { Page } from "playwright-core";
import type { ApplyPack, FieldReport } from "../types.ts";
import {
	fillSelectField,
	fillTextField,
	labelFor,
	matchAnswer,
	matchContact,
	pushManual,
	pushSkipped,
	SKIP_LABEL,
	uploadInto,
} from "./shared.ts";

/**
 * Fills Lever application forms (lever.co). Lever uses name attributes
 * (name, email, phone, org), urls[name] link inputs, a comments textarea,
 * .application-question custom blocks, and a walled-off EEO section that
 * is never touched. Same contract as Greenhouse: fill contact, uploads,
 * and matched answers; everything else is reported for manual handling.
 */
export async function fillLever(page: Page, pack: ApplyPack): Promise<FieldReport[]> {
	const reports: FieldReport[] = [];
	const { contact } = pack;
	const fullName = `${contact.firstName} ${contact.lastName}`.trim();

	const known: Array<[string, string, string]> = [
		['input[name="name"]', fullName, "Full name"],
		['input[name="email"]', contact.email, "Email"],
		['input[name="phone"]', contact.phone, "Phone"],
	];
	for (const [selector, value, name] of known) {
		const input = page.locator(selector).first();
		if ((await input.count()) === 0) continue;
		if (!value.trim()) {
			pushManual(reports, name, "no value in pack");
			continue;
		}
		await fillTextField(page, input, name, value, reports);
	}

	const org = page.locator('input[name="org"]').first();
	if ((await org.count()) > 0) {
		pushManual(reports, "Current company", "not in the pack — type it yourself");
	}

	const urls = page.locator('input[name^="urls"]');
	for (let i = 0; i < (await urls.count()); i += 1) {
		const input = urls.nth(i);
		if (!(await input.isVisible().catch(() => false))) continue;
		const label = await labelFor(input);
		const hit = matchContact(label, contact);
		if (hit) {
			await fillTextField(page, input, label, hit.value, reports);
		} else {
			pushManual(reports, label, "link with no pack value — paste it yourself");
		}
	}

	const comments = page.locator('textarea[name="comments"]').first();
	if ((await comments.count()) > 0) {
		if (pack.coverText) {
			await fillTextField(page, comments, "Additional information", pack.coverText, reports);
		} else {
			pushManual(reports, "Additional information", "no cover text in pack");
		}
	}

	const questions = page.locator(".application-question");
	for (let i = 0; i < (await questions.count()); i += 1) {
		const block = questions.nth(i);
		if (!(await block.isVisible().catch(() => false))) continue;
		const label = ((await block.locator("label").first().innerText().catch(() => "")) ?? "").trim() || "(custom question)";
		if (SKIP_LABEL.test(label)) {
			pushSkipped(reports, label, "EEO/demographic — fill in yourself");
			continue;
		}
		const field = block.locator('input[type="text"], input:not([type]), textarea, select').first();
		if ((await field.count()) === 0) {
			pushManual(reports, label, "not a text field — handle it yourself");
			continue;
		}
		const tag = (await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => "")) as string;
		const contactHit = matchContact(label, contact);
		if (contactHit && tag !== "select") {
			await fillTextField(page, field, label, contactHit.value, reports);
			continue;
		}
		if (contactHit) {
			await fillSelectField(page, field, label, contactHit.value, reports);
			continue;
		}
		const answer = matchAnswer(label, pack.customAnswers);
		if (answer) {
			await fillTextField(page, field, label, answer, reports);
			continue;
		}
		pushManual(reports, label, "no pack mapping — paste from the apply pack");
	}

	const eeo = page.locator("#eeo-form, .eeo").first();
	if ((await eeo.count()) > 0 && (await eeo.isVisible().catch(() => false))) {
		pushSkipped(reports, "EEO section", "equal-opportunity questions — fill in yourself");
	}

	const resume = page.locator('input[name="resume"], input[type="file"]').first();
	if ((await resume.count()) > 0) {
		await uploadInto(page, resume, "Resume upload", pack.uploads.resume, reports);
	} else {
		pushManual(reports, "Resume upload", "no file input found — attach it yourself");
	}
	if (pack.uploads.coverLetter) {
		const cover = page.locator('input[name="coverLetter"]').first();
		if ((await cover.count()) > 0 && (await cover.isVisible().catch(() => false))) {
			await uploadInto(page, cover, "Cover letter upload", pack.uploads.coverLetter, reports);
		} else {
			pushManual(reports, "Cover letter upload", "no cover-letter input on this form — attach it yourself");
		}
	}
	return reports;
}
