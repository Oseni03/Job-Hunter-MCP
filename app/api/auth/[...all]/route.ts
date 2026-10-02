import { getAuth, isBetterAuthEnabled } from "@/lib/auth.ts";

function unconfigured(): Response {
	return Response.json({ error: "OAuth not configured" }, { status: 404 });
}

export function GET(req: Request): Promise<Response> {
	if (!isBetterAuthEnabled()) {
		return Promise.resolve(unconfigured());
	}
	return getAuth().handler(req);
}

export function POST(req: Request): Promise<Response> {
	if (!isBetterAuthEnabled()) {
		return Promise.resolve(unconfigured());
	}
	return getAuth().handler(req);
}
