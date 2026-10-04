import type { Page } from "playwright-core";
import type { ApplyPack, FieldReport } from "../types.ts";
import { fillLabeledFields, fillTextField, pushManual, uploadInto } from "./shared.ts";

/**
 * Fills Greenhouse hosted application forms (boards.job-boards /
 * job-boards.greenhouse.io). Standard fields carry stable ids
 * (#first_name, #last_name, #email, #phone); everything else goes
 * through the shared label matcher. Demographic/EEO blocks and
 * anything unrecognized are reported for manual handling.
 */
export async function fillGreenhouse(page: Page, pack: ApplyPack): Promise<FieldReport[]> {
	const reports: FieldReport[] = [];
	const { contact } = pack;

	const known: Array<[string, string, string]> = [
		["#first_name", contact.firstName, "First name"],
		["#last_name", contact.lastName, "Last name"],
		["#email", contact.email, "Email"],
		["#phone", contact.phone, "Phone"],
	];
	const handled = new Set(["first_name", "last_name", "email", "phone"]);
	for (const [selector, value, name] of known) {
		const input = page.locator(selector).first();
		if ((await input.count()) === 0 || !value.trim()) {
			if ((await input.count()) > 0 && !value.trim()) pushManual(reports, name, "no value in pack");
			continue;
		}
		await fillTextField(page, input, name, value, reports);
	}

	const form = page.locator("form").first();
	await fillLabeledFields((await form.count()) > 0 ? form : page, pack, reports, handled);

	const files = page.locator('input[type="file"]');
	const fileCount = await files.count();
	const visible: number[] = [];
	for (let i = 0; i < fileCount; i += 1) {
		if (await files.nth(i).isVisible().catch(() => false)) visible.push(i);
	}
	if (visible.length > 0) {
		await uploadInto(page, files.nth(visible[0] as number), "Resume upload", pack.uploads.resume, reports);
	}
	if (visible.length > 1 && pack.uploads.coverLetter) {
		await uploadInto(page, files.nth(visible[1] as number), "Cover letter upload", pack.uploads.coverLetter, reports);
	} else if (pack.uploads.coverLetter && visible.length <= 1) {
		pushManual(reports, "Cover letter upload", "no second file input on this form — attach it yourself");
	}
	return reports;
}
