import { withMcpAuth } from "mcp-handler";

import { buildMcpHandler, isMcpAuthRequired, verifyMcpToken } from "@/lib/mcp/server.ts";

const authed = withMcpAuth(buildMcpHandler(), verifyMcpToken, {
	required: isMcpAuthRequired(),
});

export { authed as GET, authed as POST };
