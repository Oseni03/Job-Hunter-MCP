import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { detectAts } from "@/job-apply/detect.ts";
import { answersToCustomAnswers, assemblePack, parseFieldPair, readPackFile, splitName } from "@/job-apply/pack.ts";
import { formatReport, runFill } from "@/job-apply/runner.ts";
import type { ApplyPack } from "@/job-apply/types.ts";

const FIXTURES = resolve("job-apply/fixtures");
const RESUME = join(FIXTURES, "resume.pdf");

test("detectAts recognizes Greenhouse and Lever, refuses the rest", () => {
	assert.equal(detectAts("https://job-boards.greenhouse.io/acme/jobs/123"), "greenhouse");
	assert.equal(detectAts("https://boards.greenhouse.io/embed/job_app?token=x"), "greenhouse");
	assert.equal(detectAts("https://acme.lever.co/engineer/abc"), "lever");
	assert.equal(detectAts("https://jobs.lever.co/acme/abc"), "lever");
	assert.equal(detectAts("https://www.workday.com/jobs/1"), "unknown");
	assert.equal(detectAts("not a url"), "unknown");
});

test("splitName and --field parsing", () => {
	assert.deepEqual(splitName("Ada Lovelace"), { firstName: "Ada", lastName: "Lovelace" });
	assert.deepEqual(splitName("  Madonna  "), { firstName: "Madonna", lastName: "" });
	assert.deepEqual(parseFieldPair("Why here?=Because reasons"), ["Why here?", "Because reasons"]);
	assert.throws(() => splitName("   "), /--name/);
	assert.throws(() => parseFieldPair("no-equals"), /Label=Value/);
});

test("assemblePack validates contact, files, and ATS", () => {
	const pack = assemblePack({
		postingUrl: "https://acme.lever.co/ml/1",
		name: "Ada Lovelace",
		email: "ada@example.com",
		phone: "+234 800 000 0000",
		location: "Lagos, Nigeria",
		linkedin: "https://linkedin.com/in/ada",
		resume: RESUME,
		fields: ["Why here?=I love models"],
	});
	assert.equal(pack.ats, "lever");
	assert.equal(pack.contact.firstName, "Ada");
	assert.equal(pack.customAnswers["Why here?"], "I love models");

	assert.throws(() => assemblePack({ postingUrl: "https://x.lever.co/a", name: "A B", email: "nope", phone: "1", location: "L", resume: RESUME }), /email/);
	assert.throws(() => assemblePack({ postingUrl: "https://x.lever.co/a", name: "A B", email: "a@b.c", phone: "1", location: "L", resume: "nope.pdf" }), /not found/);
	assert.throws(() => assemblePack({ postingUrl: "https://x.lever.co/a", name: "A B", email: "a@b.c", phone: "1", location: "L", resume: "package.json" }), /must be a PDF/);
});

test("answersToCustomAnswers pulls intros and pitches defensively", () => {
	const path = join(mkdtempSync(join(tmpdir(), "apply-")), "fields.json");
	writeFileSync(
		path,
		JSON.stringify({
			selfIntros: [{ roleType: "technical", text: "I build models." }],
			pitches: [{ text: "Short pitch here.", context: "application-summary", recommended: true }],
		}),
		"utf8",
	);
	const answers = answersToCustomAnswers(path);
	assert.equal(answers["Self-introduction (technical)"], "I build models.");
	assert.equal(answers["Short pitch (application-summary)"], "Short pitch here.");
	assert.throws(() => answersToCustomAnswers(join(tmpdir(), "apply-no-such-dir", "missing.json")), /Cannot read JSON/);
});

test("readPackFile rejects non-packs and missing PDFs", () => {
	const dir = mkdtempSync(join(tmpdir(), "apply-"));
	const bad = join(dir, "bad.json");
	writeFileSync(bad, JSON.stringify({ version: 2 }), "utf8");
	assert.throws(() => readPackFile(bad), /Not an apply pack/);
	const missingPdf = join(dir, "pack.json");
	writeFileSync(
		missingPdf,
		JSON.stringify({ version: 1, postingUrl: "https://x", contact: { firstName: "A", email: "a@b.c", phone: "1", location: "L" }, uploads: { resume: join(dir, "gone.pdf") } }),
		"utf8",
	);
	assert.throws(() => readPackFile(missingPdf), /resume PDF is missing/);
});

test("no-submit guardrail: actuation primitives are banned; Next-stepping is fenced", () => {
	const dir = resolve("job-apply");
	const files: string[] = [];
	const walk = (path: string): void => {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const full = join(path, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== "fixtures") walk(full);
			} else if (entry.name.endsWith(".ts")) {
				files.push(full);
			}
		}
	};
	walk(dir);
	assert.ok(files.length >= 7, `expected filler sources, found ${files.length}`);
	const linkedin = files.find((f) => f.endsWith("linkedin.ts"));
	assert.ok(linkedin, "expected the LinkedIn adapter source");
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		for (const pattern of [/\.dblclick\(/, /\.press\(/, /\.check\(/, /\.submit\(/, /request\.post/, /dispatchEvent\(/]) {
			assert.ok(!pattern.test(source), `${file} contains forbidden ${pattern}.`);
		}
		if (file !== linkedin) {
			assert.ok(!/\.click\(/.test(source), `${file} contains .click() — only the LinkedIn adapter may advance steps.`);
		}
	}
	const code = readFileSync(linkedin as string, "utf8");
	const decommented = code
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|\s)\/\/.*$/gm, "$1");
	for (const line of decommented.split("\n")) {
		if (/\.click\(/.test(line)) {
			assert.ok(/nextButton\.click\(/.test(line), `LinkedIn click escapes the next-step fence: ${line.trim()}`);
		}
	}
	const literals: string[] = [];
	for (const match of decommented.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
		literals.push(match[1] ?? match[2] ?? match[3] ?? "");
	}
	assert.ok(literals.length > 0, "expected string literals in the LinkedIn adapter");
	for (const literal of literals) {
		assert.ok(!/submit/i.test(literal), `LinkedIn adapter names the final action: ${JSON.stringify(literal)}`);
	}
});

function fixturePack(ats: "greenhouse" | "lever" | "linkedin", page: string): ApplyPack {
	return {
		version: 1,
		postingUrl: pathToFileURL(join(FIXTURES, page)).href,
		ats,
		contact: {
			firstName: "Ada",
			lastName: "Lovelace",
			email: "ada@example.com",
			phone: "+234 800 000 0000",
			location: "Lagos, Nigeria",
			linkedin: "https://linkedin.com/in/ada",
			github: "https://github.com/ada",
		},
		coverText: "Dear team, I love models.",
		customAnswers: { "Why do you want to work here?": "Because models.", "What is your strongest ML project?": "Fraud detection." },
		uploads: { resume: RESUME },
	};
}

test("greenhouse fixture: fills contact + answers, skips EEO, never submits", async () => {
	const dir = mkdtempSync(join(tmpdir(), "apply-"));
	const screenshot = join(dir, "gh.png");
	const result = await runFill({
		pack: fixturePack("greenhouse", "greenhouse.html"),
		headless: true,
		profileDir: join(dir, "chrome"),
		screenshotPath: screenshot,
		noWait: true,
	});
	assert.equal(result.submitted, false);
	assert.ok(existsSync(screenshot));
	const byField = new Map(result.fields.map((f) => [f.field, f]));
	assert.equal(byField.get("First name")?.status, "filled");
	assert.equal(byField.get("Email")?.status, "filled");
	assert.equal(byField.get("Why do you want to work here?")?.status, "filled");
	assert.equal(byField.get("Location (City)")?.status, "filled");
	const gender = result.fields.find((f) => /gender/i.test(f.field));
	assert.ok(gender, "expected the EEO gender field to be reported");
	assert.equal(gender?.status, "skipped");
	assert.ok(result.fields.some((f) => f.field === "Resume upload" && f.status === "filled"));
	const report = formatReport(result);
	assert.match(report, /Submit was NOT clicked/);
});

test("lever fixture: fills contact + urls + question, skips EEO and org, never submits", async () => {
	const dir = mkdtempSync(join(tmpdir(), "apply-"));
	const result = await runFill({
		pack: fixturePack("lever", "lever.html"),
		headless: true,
		profileDir: join(dir, "chrome"),
		screenshotPath: join(dir, "lever.png"),
		noWait: true,
	});
	assert.equal(result.submitted, false);
	const byField = new Map(result.fields.map((f) => [f.field, f]));
	assert.equal(byField.get("Full name")?.status, "filled");
	assert.equal(byField.get("Email")?.status, "filled");
	assert.equal(byField.get("LinkedIn Profile")?.status, "filled");
	assert.equal(byField.get("What is your strongest ML project?")?.status, "filled");
	assert.equal(byField.get("Additional information")?.status, "filled");
	assert.equal(byField.get("Current company")?.status, "manual");
	assert.ok(!result.fields.some((f) => /equal employment/i.test(f.field) && f.status === "filled"));
});

test("runFill refuses unknown ATS instead of guessing", async () => {
	const pack = fixturePack("greenhouse", "greenhouse.html");
	pack.ats = "unknown";
	await assert.rejects(() => runFill({ pack, headless: true, profileDir: tmpdir(), noWait: true }), /ATS not recognized/);
});

test("linkedin fixture: steps through, skips EEO, stops at review, never submits", async () => {
	const dir = mkdtempSync(join(tmpdir(), "apply-"));
	const pack = fixturePack("linkedin", "linkedin.html");
	pack.customAnswers["Describe your ML experience"] = "Fraud detection at scale.";
	const result = await runFill({
		pack,
		headless: true,
		profileDir: join(dir, "chrome"),
		screenshotPath: join(dir, "linkedin.png"),
		noWait: true,
		acceptLinkedinRisk: true,
	});
	assert.equal(result.submitted, false);
	assert.ok(existsSync(join(dir, "linkedin.png")));
	const byField = new Map(result.fields.map((f) => [f.field, f]));
	assert.equal(byField.get("First name")?.status, "filled");
	assert.equal(byField.get("Email address")?.status, "filled");
	assert.equal(byField.get("Describe your ML experience")?.status, "filled");
	assert.ok(result.fields.some((f) => f.field === "Resume upload" && f.status === "filled"));
	const gender = result.fields.find((f) => /gender/i.test(f.field));
	assert.ok(gender, "expected the EEO gender group to be reported");
	assert.equal(gender?.status, "skipped");
	assert.equal(byField.get("Veteran status")?.status, "skipped");
	assert.equal(byField.get("Review step")?.status, "manual");
});

test("linkedin requires explicit risk acceptance", async () => {
	const dir = mkdtempSync(join(tmpdir(), "apply-"));
	await assert.rejects(
		() => runFill({ pack: fixturePack("linkedin", "linkedin.html"), headless: true, profileDir: join(dir, "chrome"), noWait: true }),
		/authenticated LinkedIn session/,
	);
});

test("linkedin without an Easy Apply modal refuses instead of guessing", async () => {
	const dir = mkdtempSync(join(tmpdir(), "apply-"));
	await assert.rejects(
		() =>
			runFill({
				pack: fixturePack("linkedin", "greenhouse.html"),
				headless: true,
				profileDir: join(dir, "chrome"),
				noWait: true,
				acceptLinkedinRisk: true,
			}),
		/no Easy Apply modal/,
	);
});

test("linkedin.com URLs stay unknown until explicit opt-in", () => {
	assert.equal(detectAts("https://www.linkedin.com/jobs/view/12345/"), "unknown");
});
