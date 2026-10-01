/**
 * Opaque paging cursors (ticket 14). The server stays stateless: a cursor is
 * a base64url envelope around `{v, offset}` that the caller holds and hands
 * back. Offsets count into the relevance-ordered eligible list, so pages are
 * stable as long as the input list is. Unparseable cursors decode to null
 * and callers restart at zero with a note — correctness first.
 */

export interface PageCursor {
	v: 1;
	offset: number;
}

function toBase64Url(text: string): string {
	return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(token: string): string {
	const padded = token.replace(/-/g, "+").replace(/_/g, "/");
	return Buffer.from(padded, "base64").toString("utf8");
}

/** Encodes a non-negative integer offset into an opaque cursor token. */
export function encodeCursor(offset: number): string {
	const clamped = Math.max(0, Math.floor(offset));
	return toBase64Url(JSON.stringify({ v: 1, offset: clamped } satisfies PageCursor));
}

/**
 * Decodes a cursor token to its offset, or null when absent, malformed, or
 * from an unknown envelope version. Never throws.
 */
export function decodeCursor(cursor: string | undefined | null): number | null {
	if (!cursor) {
		return null;
	}
	try {
		const parsed = JSON.parse(fromBase64Url(cursor)) as Partial<PageCursor>;
		if (parsed.v !== 1 || typeof parsed.offset !== "number" || !Number.isFinite(parsed.offset)) {
			return null;
		}
		return Math.max(0, Math.floor(parsed.offset));
	} catch {
		return null;
	}
}
