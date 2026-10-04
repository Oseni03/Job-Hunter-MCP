import assert from "node:assert/strict";
import test from "node:test";

import {
	anglicize,
	collectValidationIssues,
	extractCoreWords,
	formatEntry,
	matchScore,
	normalize,
	parseArgs,
	renderList,
	renderResults,
	renderValidationReport,
	searchCompany,
} from "@/host/job-hunter/workflow/salary-lookup.ts";
import type { SalaryData } from "@/host/job-hunter/workflow/salary-lookup.ts";

const DATA: SalaryData = {
	metadata: { index_label: "Index", index_baseline: 100, baseline_description: "Index 100 = national average" },
	companies: [
		{ company: "Novo Nordisk A/S", city: "Bagsværd", categories: { software_engineer: { count: 42, index: 118.4 } } },
		{ company: "Maersk", city: "Copenhagen", categories: { data_scientist: { count: 3 } } },
		{ company: "Beta ApS", city: "Aarhus", categories: {} },
	],
};

test("normalize strips legal suffixes and noise for matching", () => {
	assert.equal(normalize("Novo Nordisk A/S"), "novonordisk");
	assert.equal(normalize("Beta ApS (VG), Denmark"), "beta");
	assert.equal(anglicize("København"), "kobenhavn");
	assert.deepEqual(extractCoreWords("A Nordic Bank A/S"), ["bank"]);
});

test("matchScore tiers exact, substring, anglicized, and word matches", () => {
	assert.equal(matchScore("Novo Nordisk", "Novo Nordisk A/S"), 100);
	assert.ok(matchScore("Novo", "Novo Nordisk A/S") >= 80);
	assert.equal(matchScore("Maersk", "Mærsk"), 85);
	assert.ok(matchScore("Nordisk Novo", "Novo Nordisk A/S") >= 30);
	assert.equal(matchScore("", "Acme"), 0);
	assert.equal(matchScore("Acme", ""), 0);
	assert.ok(matchScore("Copenhagen IT", "Copenhagen IT ApS") >= 80);
});

test("short names need word overlap to avoid false positives", () => {
	assert.ok(matchScore("Novo Nordisk A/S", "Novo") >= 80);
	assert.equal(matchScore("zzzqqq", "Novo Nordisk A/S"), 0);
});

test("searchCompany filters by city, ranks, and cuts below 30", () => {
	const all = searchCompany(DATA, "Novo");
	assert.equal(all.length, 1);
	assert.equal(all[0]?.company, "Novo Nordisk A/S");
	assert.deepEqual(searchCompany(DATA, "Maersk", "Aarhus"), []);
	assert.equal(searchCompany(DATA, "Maersk", "Copenhagen").length, 1);
	assert.equal(searchCompany(DATA, "Maersk", "kobenhavn").length, 0);
	assert.deepEqual(searchCompany(DATA, "zzzqqq"), []);
});

test("formatEntry renders the benchmark table with privacy footnotes", () => {
	const text = formatEntry(
		{ company: "Novo Nordisk A/S", city: "Bagsværd", categories: { software_engineer: { count: 42, index: 118.4 } } },
		{ index_label: "Index", index_baseline: 100 },
	);
	assert.match(text, /Software Engineer/);
	assert.match(text, /118\.4/);
	assert.match(text, /\+18\.4%/);
	const suppressed = formatEntry(
		{ company: "Maersk", city: "Copenhagen", categories: { data_scientist: { count: 3 } } },
		{},
	);
	assert.match(suppressed, /N\/A\*/);
	assert.match(suppressed, /Too few employees/);
	assert.match(suppressed, /Index 100 = baseline/);
});

test("collectValidationIssues separates errors from warnings", () => {
	assert.deepEqual(collectValidationIssues({ companies: [] }).errors, []);
	const { errors } = collectValidationIssues({ companies: [{ company: "" }] });
	assert.ok(errors.length > 0);
	const dupes = collectValidationIssues({ companies: [{ company: "A" }, { company: "a" }] });
	assert.deepEqual(dupes.errors, []);
	assert.equal(dupes.warnings.length, 1);
	const badCat = collectValidationIssues({ companies: [{ company: "A", categories: { x: { count: "many" } } }] });
	assert.ok(badCat.errors.some((msg) => msg.includes("count must be a number")));
	const notObject = collectValidationIssues([]);
	assert.deepEqual(notObject.errors, ["top-level JSON value must be an object"]);
});

test("renderValidationReport exits 0 on warnings alone", () => {
	assert.deepEqual(renderValidationReport([], []), { text: "OK - no issues found.", code: 0 });
	assert.equal(renderValidationReport([], ["w"]).code, 0);
	assert.equal(renderValidationReport(["e"], ["w"]).code, 1);
});

test("renderList and renderResults join entries", () => {
	assert.equal(renderList([{ company: "A", city: "B" }, { company: "C" }]), "A (B)\nC");
	const results = renderResults([{ company: "A" }], {});
	assert.match(results, /A/);
});

test("parseArgs routes modes and validates flags", () => {
	assert.deepEqual(parseArgs(['"Acme"', "--city", "C", "--json"]), {
		company: '"Acme"',
		city: "C",
		json: true,
		listAll: false,
		validate: false,
	});
	assert.equal(parseArgs(["--list-all"]).listAll, true);
	assert.equal(parseArgs(["--validate"]).validate, true);
	assert.throws(() => parseArgs(["--city"]), /requires a value/);
	assert.throws(() => parseArgs(["a", "b"]), /Unexpected argument/);
	assert.throws(() => parseArgs(["--nope"]), /Unexpected argument/);
});
