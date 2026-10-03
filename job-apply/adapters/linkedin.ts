import type { Locator, Page } from "playwright-core";
import { FillError } from "../errors.ts";
import type { ApplyPack, FieldReport } from "../types.ts";
import { fillLabeledFields, pushManual, uploadInto } from "./shared.ts";

/**
 * Fills LinkedIn Easy Apply modals step by step and stops at the review
 * step. Requires an explicit `--ats linkedin` opt-in plus
 * --accept-linkedin-risk (enforced in the runner): driving an
 * authenticated LinkedIn session is against LinkedIn's Terms of Service
 * and can get the account restricted.
 *
 * Safety is structural. The ONLY actuation primitive used here advances
 * the modal to its next step (Next/Continue buttons); the final review
 * and application buttons are detected but never touched. The suite
 * locks this in: no .click() outside this file, every .click() here
 * targets the next-step button by variable name, and no string literal
 * in this file names the final action.
 */
const MODAL_SELECTORS = [".jobs-easy-apply-modal", "[data-test-modal-id='easy-apply-modal']"];

/** Step-advance buttons only. A runtime guard below rejects any overreach. */
const NEXT_SELECTORS = ['button[aria-label="Continue to next step"]', 'button[aria-label="Continue"]'];

const MAX_STEPS = 10;

for (const selector of NEXT_SELECTORS) {
	if (/review/i.test(selector)) {
		throw new Error("Adapter bug: a step-advance selector reaches past its remit.");
	}
}

async function findModal(page: Page): Promise<Locator | null> {
	for (const selector of MODAL_SELECTORS) {
		const candidate = page.locator(selector).first();
		if ((await candidate.count()) > 0 && (await candidate.isVisible().catch(() => false))) return candidate;
	}
	return null;
}

async function findNextButton(modal: Locator): Promise<Locator | null> {
	for (const selector of NEXT_SELECTORS) {
		const all = modal.locator(selector);
		for (let i = 0; i < (await all.count()); i += 1) {
			const candidate = all.nth(i);
			if (await candidate.isVisible().catch(() => false)) return candidate;
		}
	}
	return null;
}

async function anyVisible(locator: Locator): Promise<boolean> {
	const count = await locator.count();
	for (let i = 0; i < count; i += 1) {
		if (await locator.nth(i).isVisible().catch(() => false)) return true;
	}
	return false;
}

async function atReviewStep(modal: Locator): Promise<boolean> {
	if (await anyVisible(modal.getByText(/review your application/i))) return true;
	return anyVisible(modal.locator('button[aria-label="Review your application"]'));
}

export async function fillLinkedin(page: Page, pack: ApplyPack): Promise<FieldReport[]> {
	const reports: FieldReport[] = [];
	const modal = await findModal(page);
	if (!modal) {
		throw new FillError(
			"no-easy-apply",
			"Found no Easy Apply modal on this page. The posting probably applies on the company website " +
				"instead — open it yourself and use the greenhouse|lever adapter if it matches, or fill it by hand.",
		);
	}
	let resumeUploaded = false;
	for (let step = 1; step <= MAX_STEPS; step += 1) {
		await fillLabeledFields(modal, pack, reports);
		if (!resumeUploaded) {
			const file = modal.locator('input[type="file"]').first();
			if ((await file.count()) > 0 && (await file.isVisible().catch(() => false))) {
				await uploadInto(page, file, "Resume upload", pack.uploads.resume, reports);
				resumeUploaded = true;
			}
		}
		if (await atReviewStep(modal)) {
			pushManual(
				reports,
				"Review step",
				"reached the final review — check every answer and finish it yourself in the browser",
			);
			return reports;
		}
		const nextButton = await findNextButton(modal);
		if (!nextButton) {
			pushManual(reports, "Application flow", "no further step found and not at review — continue yourself");
			return reports;
		}
		try {
			await nextButton.click({ timeout: 5000 });
		} catch {
			pushManual(reports, "Application flow", "could not advance to the next step — continue yourself");
			return reports;
		}
		await page.waitForTimeout(1500);
	}
	pushManual(reports, "Application flow", `still stepping after ${MAX_STEPS} steps — continue yourself`);
	return reports;
}
