import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	braceItem,
	checkWritingBans,
	escapeLatex,
	sectionHeadings,
	toAsciiDateRange,
} from "../latex.ts";

describe("escapeLatex", () => {
	it("escapes every special in the skill table", () => {
		assert.equal(
			escapeLatex("R&D costs 100% ($5) #1_rank ~v2.0 ^draft\\path"),
			"R\\&D costs 100\\% (\\$5) \\#1\\_rank \\textasciitilde{}v2.0 \\textasciicircum{}draft\\textbackslash{}path",
		);
	});

	it("leaves plain prose untouched", () => {
		assert.equal(escapeLatex("Built a fraud model."), "Built a fraud model.");
	});

	it("escapes braces without corrupting its own sequences", () => {
		assert.equal(escapeLatex("f(x) = {a} & {b}"), "f(x) = \\{a\\} \\& \\{b\\}");
		assert.equal(escapeLatex("\\"), "\\textbackslash{}");
	});
});

describe("braceItem", () => {
	it("braces bullets that begin with a literal bracket", () => {
		assert.equal(braceItem("[2024] Shipped X."), "{[2024] Shipped X.}");
	});

	it("leaves other bullets alone", () => {
		assert.equal(braceItem("Shipped X."), "Shipped X.");
	});
});

describe("toAsciiDateRange", () => {
	it("normalizes double-hyphen and unicode dashes to a single hyphen", () => {
		assert.equal(toAsciiDateRange("2016--2024"), "2016-2024");
		assert.equal(toAsciiDateRange("Mar 2016 – Jul 2016"), "Mar 2016 - Jul 2016");
		assert.equal(toAsciiDateRange("2020 — present"), "2020 - present");
	});

	it("leaves single-hyphen ranges alone", () => {
		assert.equal(toAsciiDateRange("2016-2024"), "2016-2024");
	});
});

describe("checkWritingBans", () => {
	it("flags em-dashes, cliches, and apologetic hedging", () => {
		const violations = checkWritingBans(
			"I am passionate about ML — I think I could leverage my skills to hit the ground running.",
		);
		assert.ok(violations.some((v) => v.includes("em-dash")));
		assert.ok(violations.some((v) => v.includes("I am passionate about")));
		assert.ok(violations.some((v) => v.includes("I think I could")));
		assert.ok(violations.some((v) => v.includes("hit the ground running")));
	});

	it("passes clean active first-person prose", () => {
		assert.deepEqual(checkWritingBans("I built a fraud model that cut losses by 12%."), []);
	});
});

describe("sectionHeadings", () => {
	it("returns English headings by default", () => {
		const headings = sectionHeadings("en");
		assert.equal(headings.experience, "Professional Experience");
		assert.equal(headings.referencesNote, "More references are available upon request.");
	});

	it("translates every heading for Spanish CVs", () => {
		const headings = sectionHeadings("es");
		assert.equal(headings.competencies, "Competencias Clave");
		assert.equal(headings.experience, "Experiencia Profesional");
		assert.equal(headings.education, "Educación");
		assert.equal(headings.referencesNote, "Disponibles a solicitud.");
	});

	it("translates headings for German, French, and Danish CVs", () => {
		assert.equal(sectionHeadings("de").experience, "Berufserfahrung");
		assert.equal(sectionHeadings("fr").experience, "Expérience professionnelle");
		assert.equal(sectionHeadings("da").experience, "Erhvervserfaring");
	});
});
