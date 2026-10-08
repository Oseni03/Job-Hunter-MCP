import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";

import type { SectionHeadings } from "@/lib/job-hunter/document.ts";

export const ACTIVE_TEMPLATE = "modern-fixed-v1";

/**
 * The LLM output contract for a tailored CV: everything
 * buildTailoredCvHtml needs, nothing it doesn't. The model fills this
 * shape; the builder validates it before rendering.
 */
export const TailoredCvRenderSchema = z
	.object({
		name: z.string().min(1),
		headline: z.string().optional(),
		location: z.string().optional(),
		email: z.string().optional(),
		phone: z.string().optional(),
		linkedin: z.string().optional(),
		github: z.string().optional(),
		statement: z.string().min(1),
		competencies: z
			.array(z.object({ label: z.string().min(1), body: z.string().min(1) }).strict())
			.min(1),
		experience: z
			.array(
				z
					.object({
						title: z.string().min(1),
						company: z.string().min(1),
						period: z.string().min(1),
						bullets: z.array(z.string()),
					})
					.strict(),
			)
			.default([]),
		education: z
			.array(
				z
					.object({
						degree: z.string().min(1),
						period: z.string().min(1),
						institution: z.string().min(1),
						inProgress: z.boolean().optional(),
						expectedDate: z.string().optional(),
					})
					.strict(),
			)
			.default([]),
		languages: z
			.array(z.object({ language: z.string().min(1), level: z.string().min(1) }).strict())
			.default([]),
		headings: z
			.object({
				competencies: z.string().min(1),
				experience: z.string().min(1),
				education: z.string().min(1),
				languages: z.string().min(1),
				publications: z.string().min(1),
				awards: z.string().min(1),
				references: z.string().min(1),
				referencesNote: z.string().min(1),
			})
			.strict(),
		experienceFirst: z.boolean().optional(),
	})
	.strict();

export type TailoredCvRenderInput = z.infer<typeof TailoredCvRenderSchema>;

export function escapeHtml(value: string | undefined | null): string {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderList(items: string[]): string {
    return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function asciiDateRange(value: string): string {
    return value.replace(/--|–|—/g, "-");
}

export function buildTailoredCvHtml(input: TailoredCvRenderInput): string {
    const contact = [
        input.location,
        input.phone,
        input.email,
        input.linkedin ? `LinkedIn: ${input.linkedin}` : "",
        input.github ? `GitHub: ${input.github}` : "",
    ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ");

    const competencies = input.competencies
        .map(
            (item) => `
				<li>
					<strong>${escapeHtml(item.label)}</strong>
					<span>${escapeHtml(item.body)}</span>
				</li>`,
        )
        .join("");

    const experience = input.experience
        .map(
            (entry) => `
				<section class="entry">
					<div class="entry-heading">
						<div>
							<h3>${escapeHtml(entry.title)}</h3>
							<div class="company">${escapeHtml(entry.company)}</div>
						</div>
						<div class="period">${escapeHtml(asciiDateRange(entry.period))}</div>
					</div>
					<ul>${renderList(entry.bullets)}</ul>
				</section>`,
        )
        .join("");

    const education = input.education
        .map(
            (entry) => `
				<section class="entry">
					<div class="entry-heading">
						<div>
							<h3>${escapeHtml(entry.degree)}</h3>
							<div class="company">${escapeHtml(entry.institution)}</div>
						</div>
						<div class="period">${escapeHtml(asciiDateRange(entry.period))}</div>
					</div>
					${entry.inProgress ? `<p>In progress${entry.expectedDate ? `, expected ${escapeHtml(entry.expectedDate)}` : ""}.</p>` : ""}
				</section>`,
        )
        .join("");

    const languages = input.languages
        .map(
            (entry) => `<div class="language"><strong>${escapeHtml(entry.language)}</strong><span>${escapeHtml(entry.level)}</span></div>`,
        )
        .join("");

    const section = (heading: string, body: string): string => `
	<section>
		<h2>${escapeHtml(heading)}</h2>
		${body}
	</section>`;
    const experienceSection = section(input.headings.experience, experience || "<p>No experience entries provided.</p>");
    const educationSection = section(input.headings.education, education || "<p>No education entries provided.</p>");
    const orderedSections = input.experienceFirst === false ? `${educationSection}${experienceSection}` : `${experienceSection}${educationSection}`;

    return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>${escapeHtml(input.name)} - Resume</title>
	<style>
		@page { size: A4; margin: 14mm 16mm; }
		:root { --accent: #1d4ed8; --text: #172033; --muted: #596579; --rule: #d9dee8; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: var(--text); font-family: Arial, Helvetica, sans-serif; font-size: 10.2pt; line-height: 1.38; }
		body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		h1, h2, h3, p { margin: 0; }
		header { border-bottom: 3px solid var(--accent); padding-bottom: 11px; margin-bottom: 16px; }
		h1 { font-size: 27pt; line-height: 1; color: var(--accent); }
		.headline { margin-top: 5px; font-size: 12pt; color: var(--muted); }
		.contact { margin-top: 8px; color: var(--muted); font-size: 8.8pt; }
		section { margin-bottom: 14px; }
		h2 { margin-bottom: 7px; padding-bottom: 3px; border-bottom: 1px solid var(--rule); color: var(--accent); font-size: 11pt; text-transform: uppercase; letter-spacing: 0.8px; }
		.statement { margin-bottom: 14px; }
		.competencies { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 18px; padding-left: 17px; }
		.competencies li { padding-left: 2px; }
		.competencies span { display: block; color: var(--muted); font-size: 9pt; }
		.entry { break-inside: avoid; margin-bottom: 10px; }
		.entry-heading { display: flex; justify-content: space-between; gap: 12px; }
		h3 { font-size: 10.5pt; }
		.company, .period { color: var(--muted); }
		.period { white-space: nowrap; font-size: 9pt; }
		.entry ul { margin: 4px 0 0 17px; padding: 0; }
		.language { display: inline-flex; gap: 5px; margin-right: 18px; }
		.language span, .references-note { color: var(--muted); }
		.references-note { font-style: italic; }
	</style>
</head>
<body>
	<header>
		<h1>${escapeHtml(input.name)}</h1>
		${input.headline ? `<div class="headline">${escapeHtml(input.headline)}</div>` : ""}
		<div class="contact">${contact}</div>
	</header>
	<section class="statement"><p>${escapeHtml(input.statement)}</p></section>
	${section(input.headings.competencies, `<ul class="competencies">${competencies}</ul>`)}
	${orderedSections}
	${section(input.headings.languages, languages || "<p>No languages declared.</p>")}
	${section(input.headings.references, `<p class="references-note">${escapeHtml(input.headings.referencesNote)}</p>`)}
</body>
</html>`;
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await page.emulateMediaType("print");
        return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    } finally {
        await browser.close();
    }
}

export async function countPdfPages(pdf: Uint8Array): Promise<number> {
    const document = await PDFDocument.load(pdf);
    return document.getPageCount();
}
