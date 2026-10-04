import { z } from "zod";

/** Sends one MCP sampling request; implemented by the host transport. */
export type SamplingSender = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/** Adapts the MCP server's request sender for sampling; null when unavailable. */
export function makeSamplingSender(extra: unknown): SamplingSender | null {
	if (typeof extra !== "object" || extra === null) {
		return null;
	}
	const sendRequest = (extra as { sendRequest?: unknown }).sendRequest;
	if (typeof sendRequest !== "function") {
		return null;
	}
	const sender = sendRequest as (
		request: { method: string; params?: Record<string, unknown> },
		schema: z.ZodType,
		options?: { timeout?: number },
	) => Promise<unknown>;
	return (method, params) => sender({ method, params }, z.unknown(), { timeout: 60000 });
}
