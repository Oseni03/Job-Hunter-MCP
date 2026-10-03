import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectAts } from "./detect.ts";
import type { ApplyContact, ApplyPack, Ats, CustomAnswers } from "./types.ts";

export class PackError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "PackError";
		this.code = code;
	}
}

export interface AssembleOptions {
	postingUrl: string;
	/** Explicit contact; the stored profile carries no email/phone, so these are required. */
	name: string;
	email: string;
	phone: string;
	location: string;
	linkedin?: string;
	github?: string;
	website?: string;
	resume: string;
	coverLetter?: string;
	/** draft-application-answers JSON (FieldsPlan); self-intros and pitches feed custom answers. */
	answersPath?: string;
	/** Repeatable Label=Value pairs for form questions without a standard mapping. */
	fields?: string[];
	ats?: Ats;
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
	} catch (error) {
		throw new PackError("bad-answers", `Cannot read JSON at ${path}: ${(error as Error).message}`);
	}
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Splits "Ada Lovelace" into first/last; single names keep last empty (filler skips it). */
export function splitName(name: string): { firstName: string; lastName: string } {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) throw new PackError("bad-contact", "--name must not be empty.");
	return { firstName: parts[0] as string, lastName: parts.slice(1).join(" ") };
}

function requireFile(path: string, flag: string): string {
	const abs = resolve(path);
	if (!existsSync(abs)) throw new PackError("missing-file", `${flag} not found: ${path}`);
	if (!abs.toLowerCase().endsWith(".pdf")) {
		throw new PackError("bad-file", `${flag} must be a PDF, got ${path}. Compile the LaTeX first.`);
	}
	return abs;
}

/**
 * Pulls paste-ready text out of a draft-application-answers plan without
 * depending on its exact schema: self-intros keyed by role type, pitches
 * keyed by context. Unknown shapes contribute nothing instead of failing.
 */
export function answersToCustomAnswers(answersPath: string): CustomAnswers {
	const out: CustomAnswers = {};
	const doc = asRecord(readJson(answersPath));
	const intros = Array.isArray(doc["selfIntros"]) ? (doc["selfIntros"] as unknown[]) : [];
	for (const intro of intros) {
		const entry = asRecord(intro);
		const label = asText(entry["roleType"]) || "self-introduction";
		const text = asText(entry["text"]);
		if (text) out[`Self-introduction (${label})`] = text;
	}
	const pitches = Array.isArray(doc["pitches"]) ? (doc["pitches"] as unknown[]) : [];
	for (const pitch of pitches) {
		const entry = asRecord(pitch);
		const text = asText(entry["text"]);
		const context = asText(entry["context"]);
		if (text && (entry["recommended"] === true || Object.keys(out).length === 0)) {
			out[`Short pitch${context ? ` (${context})` : ""}`] = text;
		}
		if (Object.keys(out).length >= 8) break;
	}
	return out;
}

export function parseFieldPair(raw: string): [string, string] {
	const cut = raw.indexOf("=");
	if (cut <= 0) throw new PackError("bad-args", `--field must be Label=Value, got ${JSON.stringify(raw)}.`);
	return [raw.slice(0, cut).trim(), raw.slice(cut + 1).trim()];
}

export function assemblePack(options: AssembleOptions): ApplyPack {
	const { firstName, lastName } = splitName(options.name);
	if (!options.email.includes("@")) throw new PackError("bad-contact", `--email looks invalid: ${options.email}`);
	if (!options.phone.trim()) throw new PackError("bad-contact", "--phone must not be empty.");
	if (!options.location.trim()) throw new PackError("bad-contact", "--location must not be empty.");
	const customAnswers: CustomAnswers = {};
	if (options.answersPath) Object.assign(customAnswers, answersToCustomAnswers(options.answersPath));
	for (const raw of options.fields ?? []) {
		const [label, value] = parseFieldPair(raw);
		if (value) customAnswers[label] = value;
	}
	const contact: ApplyContact = {
		firstName,
		lastName,
		email: options.email,
		phone: options.phone,
		location: options.location,
	};
	if (options.linkedin) contact.linkedin = options.linkedin;
	if (options.github) contact.github = options.github;
	if (options.website) contact.website = options.website;
	const pack: ApplyPack = {
		version: 1,
		postingUrl: options.postingUrl,
		ats: options.ats && options.ats !== "unknown" ? options.ats : detectAts(options.postingUrl),
		contact,
		customAnswers,
		uploads: { resume: requireFile(options.resume, "--resume") },
	};
	if (options.coverLetter) pack.uploads.coverLetter = requireFile(options.coverLetter, "--cover");
	return pack;
}

export function writePackFile(pack: ApplyPack, path: string): string {
	const abs = resolve(path);
	writeFileSync(abs, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
	return abs;
}

export function readPackFile(path: string): ApplyPack {
	const doc = asRecord(readJson(path));
	if (doc["version"] !== 1 || typeof doc["postingUrl"] !== "string") {
		throw new PackError("bad-pack", `Not an apply pack (version 1): ${path}`);
	}
	const contact = asRecord(doc["contact"]);
	for (const key of ["firstName", "email", "phone", "location"]) {
		if (!asText(contact[key])) throw new PackError("bad-pack", `Pack contact.${key} is empty: ${path}`);
	}
	const uploads = asRecord(doc["uploads"]);
	if (typeof uploads["resume"] !== "string" || !existsSync(resolve(uploads["resume"] as string))) {
		throw new PackError("bad-pack", `Pack resume PDF is missing: ${uploads["resume"] as string}`);
	}
	return doc as unknown as ApplyPack;
}
