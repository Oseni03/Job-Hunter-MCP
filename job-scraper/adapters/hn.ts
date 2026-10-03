import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { applyQueryAndLimit, cleanText, inferRemote, makeId, parseDate, htmlToText } from "../helpers.ts";

const HN_API = "https://hn.algolia.com/api/v1";
const WHO_IS_HIRING_QUERY = 'Who is hiring?';

interface HnHit {
	objectID?: string;
	title?: string;
	comment_text?: string;
	story_text?: string;
	story_id?: number;
	story_title?: string;
	created_at?: string;
	created_at_i?: number;
	author?: string;
	url?: string;
	points?: number;
}

interface HnResponse {
	hits?: HnHit[];
}

async function findLatestWhoHiringStory(): Promise<HnHit | undefined> {
	const params = new URLSearchParams({
		query: WHO_IS_HIRING_QUERY,
		tags: "story",
		hitsPerPage: "30",
	});
	const data = await get<HnResponse>(`${HN_API}/search_by_date?${params}`, { json: true });
	return (data.hits ?? []).find((hit) => /who is hiring\??/i.test(cleanText(hit.title)));
}

function parseComment(comment: HnHit): Job | undefined {
	const text = htmlToText(comment.comment_text ?? "").trim();
	if (!text) return undefined;

	const lines = text.split(/\n+/).map(cleanText).filter(Boolean);
	const header = lines[0] ?? "";
	const parts = header.split(/\s*\|\s*/).map(cleanText).filter(Boolean);

	let company = parts[0] ?? comment.author ?? "Unknown company";
	let title = parts[1] ?? "Who is hiring role";
	let location = parts[2];

	if (/^(remote|anywhere|remote-friendly)$/i.test(company) && parts[1]) {
		[company, title] = [parts[1], parts[2] ?? "Software role"];
		location = parts[3];
	}

	const description = text.length > 5000 ? text.slice(0, 5000) : text;
	const url = `https://news.ycombinator.com/item?id=${comment.objectID ?? comment.story_id}`;
	const postedAt = parseDate(comment.created_at_i) ?? parseDate(comment.created_at);

	const remote = inferRemote(location, text);
	return {
		id: makeId("hn", comment.objectID ?? `${comment.story_id}:${company}:${title}`),
		source: "hn",
		title: title || "Open role",
		company: company || "Unknown company",
		...(location ? { location } : {}),
		...(remote ? { remote: true } : { remote: false }),
		url,
		description,
		...(postedAt ? { postedAt } : {}),
	};
}

export const hn: Adapter = {
	name: "hn",
	async search(q) {
		const thread = await findLatestWhoHiringStory();
		if (!thread?.objectID) return [];

		const tags = `comment,story_${thread.objectID}`;
		const params = new URLSearchParams({
			tags,
			hitsPerPage: "100",
			query: q.keywords,
		});
		const data = await get<HnResponse>(`${HN_API}/search_by_date?${params}`, { json: true });
		const jobs = (data.hits ?? [])
			.map((comment) => parseComment(comment))
			.filter((job): job is Job => Boolean(job));

		return applyQueryAndLimit(jobs, q);
	},
};
