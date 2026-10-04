import { dispatchMcpRequest } from "@/lib/mcp/dispatch.ts";
import { buildJobHunterHandler } from "@/lib/job-hunter/server.ts";

/**
 * The job-hunter MCP, served explicitly at /job-hunter/mcp on this domain.
 * Later servers get their own explicit route the same way
 * (app/<name>/mcp/route.ts with their own handler) — no placeholders.
 */
const jobHunterHandler = buildJobHunterHandler();

export function GET(req: Request): Promise<Response> {
	return dispatchMcpRequest(req, jobHunterHandler, "job-hunter");
}

export function POST(req: Request): Promise<Response> {
	return dispatchMcpRequest(req, jobHunterHandler, "job-hunter");
}
