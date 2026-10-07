import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer";

import { escapeHtml } from "@/lib/job-hunter/render-tailored-cv.ts";

export const ACTIVE_COVER_TEMPLATE = "letter-modern-fixed-v1";

export interface TailoredCoverRenderInput {
	name: string;
	headline?: string;
	location?: string;
	email?: string;
	phone?: string;
	linkedin?: string;
	github?: string;
	salutation: string;
	opening: string;
	intro: string;
	bullets: Array<{ label: string; text: string }>;
	results?: string;
	bridge?: string;
	companyParagraph: string;
	focus?: string;
	fit: string;
	logistics?: string;
	closing: string;
}

function paragraph(value: string | undefined): string {
	return value ? `<p>${escapeHtml(value)}</p>` : "";
}

export function buildTailoredCoverLetterHtml(input: TailoredCoverRenderInput): string {
	const contact = [input.location, input.phone, input.email, input.linkedin ? `LinkedIn: ${input.linkedin}` : "", input.github ? `GitHub: ${input.github}` : ""]
		.filter(Boolean)
		.map(escapeHtml)
		.join(" · ");
	const bullets = input.bullets
		.map((bullet) => `<li><strong>${escapeHtml(bullet.label)}</strong>: ${escapeHtml(bullet.text)}</li>`)
		.join("");

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>${escapeHtml(input.name)} - Cover Letter</title>
	<style>
		@page { size: A4; margin: 20mm 23mm; }
		:root { --accent: #1d4ed8; --text: #172033; --muted: #596579; --rule: #d9dee8; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: var(--text); font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; }
		body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		h1, h2, p { margin: 0; }
		header { border-bottom: 3px solid var(--accent); padding-bottom: 11px; margin-bottom: 24px; }
		h1 { color: var(--accent); font-size: 24pt; line-height: 1.1; }
		.contact { margin-top: 8px; color: var(--muted); font-size: 9pt; }
		.letter { max-width: 720px; }
		p { margin-bottom: 12px; }
		.salutation { margin-bottom: 16px; }
		ul { margin: 0 0 14px 20px; padding: 0; }
		li { margin-bottom: 7px; }
		strong { color: var(--accent); }
		footer { margin-top: 22px; }
		.closing { margin-bottom: 20px; }
	</style>
</head>
<body>
	<header>
		<h1>${escapeHtml(input.name)}</h1>
		${input.headline ? `<div>${escapeHtml(input.headline)}</div>` : ""}
		<div class="contact">${contact}</div>
	</header>
	<main class="letter">
		<p class="salutation">${escapeHtml(input.salutation)}</p>
		${paragraph(input.opening)}
		${paragraph(input.intro)}
		<ul>${bullets}</ul>
		${paragraph(input.results)}
		${paragraph(input.bridge)}
		${paragraph(input.companyParagraph)}
		${paragraph(input.focus)}
		${paragraph(input.fit)}
		${paragraph(input.logistics)}
		<p>I look forward to hearing from you.</p>
		<footer>
			<p class="closing">${escapeHtml(input.closing)}</p>
			<p>${escapeHtml(input.name)}</p>
		</footer>
	</main>
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
	return (await PDFDocument.load(pdf)).getPageCount();
}
