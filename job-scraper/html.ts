import * as cheerio from "cheerio";
import type { Job } from "./types.ts";
import { absoluteUrl, cleanText, firstNonEmpty, inferRemote, makeId, parseRelativeDate } from "./helpers.ts";

export interface HtmlAdapterConfig {
  source: string;
  baseUrl: string;
  jobLinkSelector: string;
  selectors: {
    card: string;
    title: string;
    company: string;
    location: string;
    description: string;
    postedAt: string;
  };
  buildSearchUrl: (keywords: string, location: string | undefined, page: number) => string;
  maxPages: number;
}

export interface HtmlJobParserContext {
  $: any;
  card: any;
  href: string;
  source: string;
  baseUrl: string;
}

export function extractHtmlJobs(html: string, config: HtmlAdapterConfig): Job[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const jobs: Job[] = [];

  $(config.jobLinkSelector).each((_index: number, element: any) => {
    const anchor = $(element);
    const href = absoluteUrl(anchor.attr("href"), config.baseUrl);
    if (!href || seen.has(href)) return;
    seen.add(href);

    const card = findCard($, anchor, config.selectors.card);
    const ctx: HtmlJobParserContext = {
      $,
      card,
      href,
      source: config.source,
      baseUrl: config.baseUrl,
    };

    const title = firstNonEmpty(ctx.card.find(config.selectors.title).first().text(), anchor.text());
    const company = firstNonEmpty(ctx.card.find(config.selectors.company).first().text(), inferCompanyFromCard($, card, title));
    if (!title || !company) return;

    const location = firstNonEmpty(ctx.card.find(config.selectors.location).first().text(), inferLocationFromCard(ctx.card.text()));
    const description = cleanText(ctx.card.find(config.selectors.description).first().text());
    const postedRaw = firstNonEmpty(ctx.card.find(config.selectors.postedAt).first().text());
    const postedAt = postedRaw ? parseRelativeDate(postedRaw) : undefined;

    jobs.push({
      id: makeId(config.source, href),
      source: config.source,
      title: cleanText(title),
      company: cleanText(company),
      ...(location ? { location: cleanText(location) } : {}),
      remote: inferRemote(location, ctx.card.text()),
      url: href,
      ...(description ? { description } : {}),
      ...(postedAt ? { postedAt } : {}),
    });
  });

  return jobs;
}

function findCard($: any, anchor: any, selector: string): any {
	const explicit = anchor.closest(selector);
	if (explicit.length) return explicit;

	const semantic = anchor.closest("article, li");
	if (semantic.length) return semantic;

	// Climb through wrappers that contain only the link text (Jobberman nests
	// its title link inside title-only divs) until the container also holds
	// sibling fields like company and location. Bounded so a missing card can
	// never swallow the whole page.
	const linkText = cleanText(anchor.text());
	let node = anchor.parent();
	for (let level = 0; level < 4 && node.length; level += 1) {
		const text = cleanText(node.text());
		if (text.length > 3000) return anchor;
		if (text && text !== linkText) return node;
		node = node.parent();
	}
	return anchor;
}

function inferCompanyFromCard($: any, card: any, title?: string): string | undefined {
  const text = cleanText(card.text());
  if (!text) return undefined;

  const parts = text
    .split(/\n|•|\||·/) // preserve common list/card separators
    .map(cleanText)
    .filter(Boolean)
    .filter((value) => value !== cleanText(title));

  return parts[0];
}

function inferLocationFromCard(text: string): string | undefined {
  const cleaned = cleanText(text);
  const locationPatterns = [
    /Remote(?:\s*\([^)]*\))?/i,
    /Lagos/i,
    /Abuja/i,
    /Port Harcourt/i,
    /Ibadan/i,
    /Kano/i,
    /Enugu/i,
    /Nigeria/i,
  ];

  for (const pattern of locationPatterns) {
    const match = cleaned.match(pattern);
    if (match) return match[0];
  }
  return undefined;
}
