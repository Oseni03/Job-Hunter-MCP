import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	applyResults,
	bandFor,
	CliError,
	entryLocationVerdict,
	loadState,
	norm,
	overallScore,
	parseArgs,
	parseIso,
	saveState,
	selectCandidates,
	sweepRanked,
	trackerPairs,
} from "@/host/job-hunter/workflow/rank-state.ts";

test("parseIso accepts real dates and rejects everything else", () => {
	assert.equal(parseIso("2026-10-03"), "2026-10-03");
	assert.equal(parseIso(" 2026-01-05 "), "2026-01-05");
	assert.equal(parseIso("2026-02-30"), null);
	assert.equal(parseIso("2026-13-01"), null);
	assert.equal(parseIso("10/03/2026"), null);
	assert.equal(parseIso(""), null);
	assert.equal(parseIso(null), null);
	assert.equal(parseIso(20261003), null);
});

test("norm ignores case and separators but keeps combining marks", () => {
	assert.equal(norm("Acme Corp!"), "acmecorp");
	assert.equal(norm("Straße"), "strasse");
	assert.equal(norm("  "), "");
	assert.ok(norm("नमस्ते").length > 0);
});

test("trackerPairs strips BOM, parses quotes, and skips empty companies", () => {
	const pairs = trackerPairs(
		"﻿date,company,sector,role\n2026-01-01,Acme,,ML Engineer\n2026-01-02,\"Beta, Inc\",,Dev\n2026-01-03,,,Nope\n",
	);
	assert.ok(pairs.has("acme||mlengineer"));
	assert.ok(pairs.has("betainc||dev"));
	assert.equal(pairs.size, 2);
});

test("selectCandidates filters by status, tracker, focus, and limit", () => {
	const seen = {
		a: { status: "new", company: "Acme", title: "ML Engineer", strengths: ["Python"], gaps: [] },
		b: { status: "new", company: "Beta", title: "Dev", strengths: [], gaps: [] },
		c: { status: "ranked", company: "Gamma", title: "DS", strengths: [], gaps: [] },
		d: { status: "skipped", company: "Delta", title: "FE", strengths: [], gaps: [] },
	};
	const excluded = new Set(["beta||dev"]);
	const base = { all: false, focus: "", limit: 10 };
	const fresh = selectCandidates(structuredClone(seen), excluded, base);
	assert.deepEqual(fresh.eligible.map((row) => row.key), ["a"]);
	assert.equal(fresh.excluded_by_tracker, 1);
	assert.equal(fresh.total_entries, 4);
	const all = selectCandidates(structuredClone(seen), new Set(), { ...base, all: true });
	assert.deepEqual(all.eligible.map((row) => row.key), ["a", "b", "c"]);
	const focused = selectCandidates(structuredClone(seen), new Set(), { ...base, focus: "python" });
	assert.deepEqual(focused.eligible.map((row) => row.key), ["a"]);
	const limited = selectCandidates(structuredClone(seen), new Set(), { ...base, limit: 1 });
	assert.equal(limited.eligible.length, 2);
});

test("entryLocationVerdict prefers the new field, falls back to legacy PASS/FAIL/FLAG", () => {
	assert.equal(entryLocationVerdict({ location_verdict: "FLAG", location: "PASS" }), "FLAG");
	assert.equal(entryLocationVerdict({ location: "FAIL" }), "FAIL");
	assert.equal(entryLocationVerdict({ location: "Berlin" }), null);
	assert.equal(entryLocationVerdict({}), null);
});

test("sweepRanked expires the past, flags the urgent, and never guesses", () => {
	const seen = {
		past: { status: "ranked", deadline: "2026-09-01", title: "A", company: "A", url: "https://a" },
		soon: { status: "ranked", deadline: "2026-10-05", title: "B", company: "B", url: "https://b" },
		later: { status: "ranked", deadline: "2026-12-01", title: "C", company: "C", url: "https://c" },
		blank: { status: "ranked", deadline: "", title: "D", company: "D", url: "https://d" },
		none: { status: "ranked", title: "E", company: "E", url: "https://e" },
		weird: { status: "ranked", deadline: "next Friday", title: "F", company: "F", url: "https://f" },
		fresh: { status: "new", deadline: "2026-09-01", title: "G", company: "G", url: "https://g" },
	};
	const out = sweepRanked(structuredClone(seen), "2026-10-03", new Set());
	assert.equal(out.checked, 6);
	assert.deepEqual(out.expired.map((row) => row.key), ["past"]);
	assert.deepEqual(out.closing.map((row) => row.key), ["soon"]);
	assert.deepEqual(out.unparseable.map((row) => row.key), ["weird"]);
	const excluded = sweepRanked(structuredClone(seen), "2026-10-03", new Set(["past"]));
	assert.deepEqual(excluded.expired, []);
});

test("overallScore weights 30/25/15/30 and rejects non-scores", () => {
	assert.equal(overallScore({ technical: 80, experience: 60, behavioral: 70, career: 90 }), 77);
	assert.equal(bandFor(77), "Strong Fit");
	assert.equal(bandFor(60), "Good Fit");
	assert.equal(bandFor(30), "Weak Fit");
	assert.equal(bandFor(29), "Poor Fit");
	assert.throws(() => overallScore({ technical: true, experience: 60, behavioral: 70, career: 90 }), /between 0 and 100/);
	assert.throws(() => overallScore({ technical: 80 }), /experience/);
	assert.throws(() => overallScore({ technical: 101, experience: 60, behavioral: 70, career: 90 }), /between 0 and 100/);
});

test("applyResults scores, migrates legacy fields, and splits vetoes", () => {
	const seen = {
		good: { status: "new", company: "Acme", title: "ML", location: "PASS", deadline: "2026-11-01" },
		bad: { status: "new", company: "Beta", title: "Dev" },
		gone: { status: "new", company: "Gamma", title: "DS" },
	};
	const outcome = applyResults(structuredClone(seen), [
		{ key: "good", scores: { technical: 80, experience: 80, behavioral: 80, career: 80 }, location_verdict: "PASS", language_gate: "PASS", strengths: ["a", "b", "c", "d"], gaps: [] },
		{ key: "bad", scores: { technical: 90, experience: 90, behavioral: 90, career: 90 }, location_verdict: "FAIL", language_gate: "PASS" },
		{ key: "gone", status: "expired" },
		{ key: "missing", scores: { technical: 10, experience: 10, behavioral: 10, career: 10 } },
	], "2026-10-03");
	assert.equal(outcome.ranked.length, 1);
	assert.equal(outcome.ranked[0]?.key, "good");
	assert.equal(outcome.ranked[0]?.score, 80);
	assert.equal(outcome.vetoed.length, 1);
	assert.equal(outcome.expired.length, 1);
	assert.equal(outcome.errors.length, 1);
	assert.deepEqual(outcome.ranked[0]?.strengths, ["a", "b", "c"]);
});

test("applyResults never blanks a stored deadline on absence and drops PASS notes", () => {
	const seen = {
		keep: { status: "ranked", company: "A", title: "T", deadline: "2026-11-01", language_note: "old" },
	};
	const outcome = applyResults(structuredClone(seen), [
		{ key: "keep", scores: { technical: 50, experience: 50, behavioral: 50, career: 50 }, language_gate: "PASS" },
	], "2026-10-03");
	assert.equal(outcome.ranked[0]?.deadline, "2026-11-01");
	assert.equal(outcome.ranked[0]?.language_note, null);
	assert.equal(outcome.ranked[0]?.location_verdict, "PASS");
});

test("loadState and saveState round-trip atomically with loud failures", () => {
	const dir = mkdtempSync(join(tmpdir(), "rank-state-"));
	const path = join(dir, "seen.json");
	writeFileSync(path, JSON.stringify({ seen: { a: { status: "new" } } }), "utf8");
	const loaded = loadState(path);
	assert.deepEqual(Object.keys(loaded.seen), ["a"]);
	loaded.doc["extra"] = 1;
	saveState(path, loaded.doc);
	assert.equal((JSON.parse(readFileSync(path, "utf8")) as { extra: number }).extra, 1);
	assert.throws(() => loadState(join(dir, "missing.json")), /run \/scrape first/);
	writeFileSync(path, "{nope", "utf8");
	assert.throws(() => loadState(path), /not valid JSON/);
	writeFileSync(path, JSON.stringify({ seen: { a: 42 } }), "utf8");
	assert.throws(() => loadState(path), /not an object/);
});

test("parseArgs routes subcommands and validates values", () => {
	const cand = parseArgs(["candidates", "--all", "--focus", "ml", "--limit", "5"]);
	assert.equal(cand.command, "candidates");
	if (cand.command === "candidates") {
		assert.equal(cand.all, true);
		assert.equal(cand.focus, "ml");
		assert.equal(cand.limit, 5);
	}
	assert.throws(() => parseArgs(["candidates", "--limit", "banana"]), /non-negative/);
	assert.throws(() => parseArgs(["candidates", "--limit", "-1"]), /requires a value/);
	assert.throws(() => parseArgs(["sweep", "--today", "yesterday"]), /YYYY-MM-DD/);
	assert.throws(() => parseArgs(["apply"]), /--results/);
	assert.throws(() => parseArgs(["nope"]), /Unknown command/);
	const sweep = parseArgs(["sweep", "--write", "--exclude", "a,b"]);
	if (sweep.command === "sweep") assert.equal(sweep.exclude, "a,b");
});
