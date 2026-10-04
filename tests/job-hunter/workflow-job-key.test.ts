import assert from "node:assert/strict";
import test from "node:test";

import { auditState, CliError, parseArgs } from "@/host/job-hunter/workflow/job-key.ts";

test("parseArgs handles key and audit forms", () => {
	assert.deepEqual(parseArgs(["--company", "Acme", "--title", "SOC Analyst", "--url", "https://x/1"]), {
		command: "key",
		company: "Acme",
		title: "SOC Analyst",
		url: "https://x/1",
	});
	const auditDefault = parseArgs(["--audit"]);
	assert.equal(auditDefault.command, "audit");
	assert.ok((auditDefault as { statePath: string }).statePath.endsWith("seen_jobs.json"));
	const auditExplicit = parseArgs(["--audit", "state.json"]);
	assert.ok((auditExplicit as { statePath: string }).statePath.endsWith("state.json"));
	assert.throws(() => parseArgs([]), /--company and --title/);
	assert.throws(() => parseArgs(["--company", "A"]), /--company and --title/);
	assert.throws(() => parseArgs(["--audit", "--company", "A"]), /--company\/--title/);
	assert.throws(() => parseArgs(["--nope"]), /Unexpected argument/);
	assert.ok(parseArgs(["--company", "A", "--title", "B"]) instanceof Object);
});

test("auditState reports clean state without violations", () => {
	const { report, violations } = auditState({
		seen: {
			acme_soc: { company: "Acme", title: "SOC", url: "https://x/1" },
		},
	});
	assert.equal(report.entries, 1);
	assert.deepEqual(report.malformed_keys, []);
	assert.deepEqual(report.legacy_three_part_keys, []);
	assert.deepEqual(report.duplicate_urls, {});
	assert.equal(violations, false);
});

test("auditState flags malformed keys, legacy shapes, duplicate urls, and drift", () => {
	const { report, violations } = auditState({
		seen: {
			"deloitte_junior-cybersecurity-analyst-(ot/iot)": { company: "Deloitte", title: "Junior", url: "https://d/1" },
			acme_corp_copenhagen: { company: "Acme Corp", title: "Copenhagen", url: "https://a/1" },
			"acme_soc-analyst": { company: "Acme", title: "SOC Analyst", url: "https://a/2" },
			"acme_soc-analyst-l2": { company: "Acme", title: "SOC Analyst L2", url: "https://a/2/" },
			wrong_soc: { company: "Acme", title: "SOC", url: "https://a/3" },
		},
	});
	assert.deepEqual(report.malformed_keys, ["deloitte_junior-cybersecurity-analyst-(ot/iot)"]);
	assert.deepEqual(report.legacy_three_part_keys, ["acme_corp_copenhagen"]);
	assert.deepEqual(report.duplicate_urls, { "https://a/2": ["acme_soc-analyst", "acme_soc-analyst-l2"] });
	assert.equal(report.keys_not_matching_current_rule, 1);
	assert.equal(violations, true);
});

test("auditState accepts a bare map and rejects non-objects", () => {
	const { violations } = auditState({ acme_soc: { company: "Acme", title: "SOC", url: "https://x/1" } });
	assert.equal(violations, false);
	assert.throws(() => auditState(null), CliError);
	assert.throws(() => auditState([]), CliError);
	assert.throws(() => auditState({ seen: [] }), CliError);
});
