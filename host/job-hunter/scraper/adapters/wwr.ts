import { XMLParser } from "fast-xml-parser";
import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { absoluteUrl, applyQueryAndLimit, cleanText, firstNonEmpty, inferRemote, makeId, parseDate, htmlToText } from "../helpers.ts";

const WWR_RSS_URL = "https://weworkremotely.com/remote-jobs.rss";
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

interface WwrItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  guid?: string | { "#text"?: string };
  region?: string;
  country?: string;
  state?: string;
}

function parseCompanyAndTitle(rawTitle: string): { company?: string; title?: string } {
  const separatorIndex = rawTitle.indexOf(":");
  if (separatorIndex > 0) {
    const company = cleanText(rawTitle.slice(0, separatorIndex));
    const title = cleanText(rawTitle.slice(separatorIndex + 1));
    if (company && title) return { company, title };
  }
  return { title: rawTitle };
}

export const wwr: Adapter = {
  name: "wwr",
  async search(q) {
    const xml = await get(WWR_RSS_URL);
    const parsed = parser.parse(xml) as { rss?: { channel?: { item?: WwrItem | WwrItem[] } } };
    const items = parsed.rss?.channel?.item ?? [];
    const list = Array.isArray(items) ? items : [items];

    const jobs = list.flatMap((item): Job[] => {
      const rawTitle = cleanText(item.title);
      const { company, title } = parseCompanyAndTitle(rawTitle);
      const url = absoluteUrl(firstNonEmpty(item.link, typeof item.guid === "object" ? item.guid["#text"] : item.guid), WWR_RSS_URL);
      if (!company || !title || !url) return [];

      const description = htmlToText(item.description ?? "");
      const location = [item.region, item.country, item.state].map(cleanText).filter(Boolean).join(", ");
      const postedAt = parseDate(item.pubDate);
      const externalId = item.guid ? cleanText(typeof item.guid === "object" ? item.guid["#text"] : item.guid) : url;
      return [{
        id: makeId("wwr", externalId),
        source: "wwr",
        title,
        company,
        ...(location ? { location } : {}),
        remote: true,
        url,
        ...(description ? { description } : {}),
        ...(postedAt ? { postedAt } : {}),
      }];
    });

    return applyQueryAndLimit(jobs, q);
  },
};
