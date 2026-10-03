/**
 * Company board references. Boards have no keyword search and no directory,
 * so callers supply slugs:
 * - Greenhouse: token in https://boards.greenhouse.io/<token>
 * - Lever: org in https://jobs.lever.co/<org>
 * - Ashby: board in https://jobs.ashbyhq.com/<board>
 * While a list is empty its adapter is a no-op returning no jobs.
 */
export interface BoardRef {
	slug: string;
	company: string;
}

export const greenhouseBoardTokens = [
	// "example-company",
] as const;

export const leverBoards: readonly BoardRef[] = [
	// { slug: "example-org", company: "Example Inc" },
];

export const ashbyBoards: readonly BoardRef[] = [
	// { slug: "example-board", company: "Example Inc" },
];
