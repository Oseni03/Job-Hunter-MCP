#!/usr/bin/env node
/**
 * Assisted /apply CLI: fill an employer's form, stop before Submit.
 *
 *   node job-apply/cli.ts pack --url <posting> --name "..." --email ... --phone ... --location ...
 *     --resume cv.pdf [--cover letter.pdf] [--answers portal-fields.json] [--field "Label=Value"...] [--out pack.json]
 *   node job-apply/cli.ts fill --pack pack.json [--ats greenhouse|lever] [--headless] [--profile-dir ...]
 *
 * Pack prints to stdout (or --out). Fill opens a headed browser, fills the
 * form, prints a field report, and waits: you review, click Submit, close
 * with Enter. Submit is never clicked programmatically.
 */
import { pathToFileURL } from "node:url";
import { parseAtsFlag } from "./detect.ts";
import { assemblePack, readPackFile, writePackFile } from "./pack.ts";
import { formatReport, runFill } from "./runner.ts";
import type { Ats } from "./types.ts";

export class CliError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "CliError";
		this.code = code;
	}
}

function takeValue(args: string[], index: number, flag: string): { value: string; next: number } {
	const value = args[index];
	if (value === undefined || value.startsWith("-")) {
		throw new CliError("bad-args", `${flag} requires a value.`);
	}
	return { value, next: index + 1 };
}

function printHelpAndExit(): never {
	process.stdout.write(
		[
			"Usage:",
			"  node job-apply/cli.ts pack --url <posting> --name <name> --email <email> --phone <phone>",
			"    --location <location> --resume <cv.pdf> [--cover <letter.pdf>]",
			'    [--answers <fields.json>] [--field "Label=Value"...] [--ats greenhouse|lever|linkedin] [--out pack.json]',
			"  node job-apply/cli.ts fill --pack <pack.json> [--ats greenhouse|lever|linkedin] [--headless]",
			"    [--profile-dir <dir>] [--screenshot <path>] [--accept-linkedin-risk]",
			"",
			"Fill opens a headed browser and stops before Submit. Review, submit,",
			"then record with the track-application tool. LinkedIn Easy Apply also",
			"needs --accept-linkedin-risk (authenticated automation is against",
			"LinkedIn's ToS and can restrict your account).",
			"",
		].join("\n"),
	);
	process.exit(0);
}

interface PackCliOptions {
	url: string;
	name: string;
	email: string;
	phone: string;
	location: string;
	linkedin?: string;
	github?: string;
	website?: string;
	resume: string;
	cover?: string;
	answers?: string;
	fields: string[];
	ats: Ats;
	out?: string;
}

function parsePackArgs(rest: string[]): PackCliOptions {
	const options: PackCliOptions = {
		url: "",
		name: "",
		email: "",
		phone: "",
		location: "",
		resume: "",
		fields: [],
		ats: "unknown",
	};
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i] as string;
		const take = (flag: string): string => {
			const taken = takeValue(rest, i + 1, flag);
			i = taken.next - 1;
			return taken.value;
		};
		if (arg === "--url") options.url = take(arg);
		else if (arg === "--name") options.name = take(arg);
		else if (arg === "--email") options.email = take(arg);
		else if (arg === "--phone") options.phone = take(arg);
		else if (arg === "--location") options.location = take(arg);
		else if (arg === "--linkedin") options.linkedin = take(arg);
		else if (arg === "--github") options.github = take(arg);
		else if (arg === "--website") options.website = take(arg);
		else if (arg === "--resume") options.resume = take(arg);
		else if (arg === "--cover") options.cover = take(arg);
		else if (arg === "--answers") options.answers = take(arg);
		else if (arg === "--field") options.fields.push(take(arg));
		else if (arg === "--ats") options.ats = parseAtsFlag(take(arg));
		else if (arg === "--out" || arg === "-o") options.out = take(arg);
		else throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)} for pack.`);
	}
	for (const [flag, value] of [
		["--url", options.url],
		["--name", options.name],
		["--email", options.email],
		["--phone", options.phone],
		["--location", options.location],
		["--resume", options.resume],
	] as const) {
		if (!value) throw new CliError("bad-args", `${flag} is required.`);
	}
	return options;
}

interface FillCliOptions {
	packPath: string;
	ats: Ats;
	headless: boolean;
	profileDir: string;
	screenshot?: string;
	acceptLinkedinRisk: boolean;
}

function parseFillArgs(rest: string[]): FillCliOptions {
	const options: FillCliOptions = {
		packPath: "",
		ats: "unknown",
		headless: false,
		profileDir: ".scratch/apply-chrome/",
		acceptLinkedinRisk: false,
	};
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i] as string;
		const take = (flag: string): string => {
			const taken = takeValue(rest, i + 1, flag);
			i = taken.next - 1;
			return taken.value;
		};
		if (arg === "--pack") options.packPath = take(arg);
		else if (arg === "--ats") options.ats = parseAtsFlag(take(arg));
		else if (arg === "--headless") options.headless = true;
		else if (arg === "--accept-linkedin-risk") options.acceptLinkedinRisk = true;
		else if (arg === "--profile-dir") options.profileDir = take(arg);
		else if (arg === "--screenshot") options.screenshot = take(arg);
		else throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)} for fill.`);
	}
	if (!options.packPath) throw new CliError("bad-args", "--pack is required.");
	return options;
}

export async function main(argv: string[]): Promise<void> {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") printHelpAndExit();
	if (command === "pack") {
		const options = parsePackArgs(rest);
		const pack = assemblePack({
			postingUrl: options.url,
			name: options.name,
			email: options.email,
			phone: options.phone,
			location: options.location,
			linkedin: options.linkedin,
			github: options.github,
			website: options.website,
			resume: options.resume,
			coverLetter: options.cover,
			answersPath: options.answers,
			fields: options.fields,
			ats: options.ats,
		});
		if (options.out) {
			const saved = writePackFile(pack, options.out);
			process.stdout.write(`Saved apply pack to ${saved} (ATS: ${pack.ats}).\n`);
		} else {
			process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
		}
		return;
	}
	if (command === "fill") {
		const options = parseFillArgs(rest);
		const pack = readPackFile(options.packPath);
		if (options.ats !== "unknown") pack.ats = options.ats;
		const result = await runFill({
			pack,
			headless: options.headless,
			profileDir: options.profileDir,
			screenshotPath: options.screenshot,
			acceptLinkedinRisk: options.acceptLinkedinRisk,
		});
		process.stdout.write(`${formatReport(result)}\n`);
		if (result.submitted) {
			throw new CliError("unexpected-submit", "The page reports a submission; investigate before proceeding.");
		}
		return;
	}
	throw new CliError("bad-args", `Unknown command ${JSON.stringify(command)}. See --help.`);
}

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
	main(process.argv.slice(2)).catch((error: unknown) => {
		const code = error instanceof CliError ? error.code : "error";
		process.stderr.write(`${JSON.stringify({ error: (error as Error).message, code })}\n`);
		process.exit(1);
	});
}
