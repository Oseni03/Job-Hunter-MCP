import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { fillGreenhouse } from "./adapters/greenhouse.ts";
import { fillLever } from "./adapters/lever.ts";
import { fillLinkedin } from "./adapters/linkedin.ts";
import { FillError } from "./errors.ts";
import type { ApplyPack, Ats, FieldReport, FillResult } from "./types.ts";

export { FillError } from "./errors.ts";

export interface RunOptions {
	pack: ApplyPack;
	/** Headed by default so the human watches; headless only for CI/fixture runs. */
	headless: boolean;
	/** Persistent Chrome profile dir (stays logged in between runs). */
	profileDir: string;
	screenshotPath?: string;
	formTimeoutMs?: number;
	/** Skip the Enter-to-close wait (tests). */
	noWait?: boolean;
	/** Required for ats linkedin: acknowledges the LinkedIn ToS risk. CLI flag --accept-linkedin-risk. */
	acceptLinkedinRisk?: boolean;
}

function candidateChromePaths(): string[] {
	const fromEnv = process.env["CHROME_PATH"] ?? process.env["CHROME_BIN"] ?? "";
	const paths = fromEnv ? [fromEnv] : [];
	if (process.platform === "win32") {
		paths.push(
			"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		);
	} else if (process.platform === "darwin") {
		paths.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
	} else {
		paths.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");
	}
	return paths;
}

/** Resolves a usable Chrome/Edge binary; playwright-core drives it, no browser download needed. */
export function resolveChromePath(): string {
	for (const path of candidateChromePaths()) {
		if (path && existsSync(path)) return path;
	}
	throw new FillError(
		"no-chrome",
		"Found no Chrome/Edge binary. Set CHROME_PATH to your browser executable and retry.",
	);
}

function waitForEnter(): Promise<void> {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		rl.question("", () => {
			rl.close();
			resolve();
		});
	});
}

/**
 * Opens the posting in a headed browser, fills what the pack covers, and
 * stops: the browser stays open on the filled form until the human presses
 * Enter. The filler has no submit path by construction — review the form,
 * click Submit yourself, then record the application with track-application.
 */
export async function runFill(options: RunOptions): Promise<FillResult> {
	const { pack } = options;
	if (pack.ats === "unknown") {
		throw new FillError(
			"unknown-ats",
			`Cannot fill ${pack.postingUrl}: ATS not recognized (Greenhouse and Lever are supported; LinkedIn Easy Apply needs explicit --ats linkedin). ` +
				`Re-run with --ats greenhouse|lever|linkedin only if you verified the form matches that layout.`,
		);
	}
	if (pack.ats === "linkedin" && !options.acceptLinkedinRisk) {
		throw new FillError(
			"linkedin-risk",
			"Refusing LinkedIn Easy Apply: driving your authenticated LinkedIn session is against LinkedIn's " +
				"Terms of Service and can restrict your account. If you accept that risk, re-run with " +
				"--accept-linkedin-risk. Log in to LinkedIn in the opened browser first; the session persists.",
		);
	}
	const ats: Ats = pack.ats;
	if (ats === "linkedin") {
		process.stdout.write(
			"LinkedIn Easy Apply runs against LinkedIn's ToS — low volume, watch the browser, expect challenges.\n",
		);
	}
	const executablePath = resolveChromePath();
	const context = await chromium.launchPersistentContext(options.profileDir, {
		executablePath,
		headless: options.headless,
		args: ["--disable-blink-features=AutomationControlled"],
	});
	const page = context.pages()[0] ?? (await context.newPage());
	try {
		await page.goto(pack.postingUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
		await page.locator("form").first().waitFor({ state: "visible", timeout: options.formTimeoutMs ?? 15000 });
		const fields: FieldReport[] =
			ats === "greenhouse"
				? await fillGreenhouse(page, pack)
				: ats === "lever"
					? await fillLever(page, pack)
					: await fillLinkedin(page, pack);
		const screenshotPath =
			options.screenshotPath ?? join(tmpdir(), `apply-${Date.now()}.png`);
		await page.screenshot({ path: screenshotPath, fullPage: false });
		const submitted = (await page.evaluate(() => (window as { __submitted?: unknown }).__submitted).catch(
			() => false,
		)) === true;
		if (!options.noWait) {
			process.stdout.write(
				"\nForm filled — REVIEW it in the browser, fix the manual items, click Submit yourself.\nPress Enter here to close the browser.\n",
			);
			await waitForEnter();
		}
		return { ats, url: pack.postingUrl, fields, screenshotPath, submitted };
	} finally {
		await context.close().catch(() => undefined);
	}
}

export function formatReport(result: FillResult): string {
	const lines = [`ATS: ${result.ats}`, `URL: ${result.url}`, ""];
	for (const field of result.fields) {
		const mark = field.status === "filled" ? "✓" : field.status === "skipped" ? "○" : "!";
		lines.push(`  ${mark} [${field.status}] ${field.field} — ${field.detail}`);
	}
	const manual = result.fields.filter((f) => f.status === "manual").length;
	lines.push("", `Screenshot: ${result.screenshotPath}`);
	lines.push(
		manual > 0
			? `${manual} field(s) need you. Submit was NOT clicked — that part is yours.`
			: "All mapped fields filled. Submit was NOT clicked — review and click it yourself.",
	);
	return lines.join("\n");
}
