import { withMcpAuth } from "mcp-handler";

import {
	buildMcpHandler,
	isMcpAuthRequired,
	mcpPublicOrigin,
	mcpRequiredScopes,
	verifyMcpToken,
} from "@/lib/mcp/server.ts";

const origin = mcpPublicOrigin();

const authed = withMcpAuth(buildMcpHandler(), verifyMcpToken, {
	required: isMcpAuthRequired(),
	requiredScopes: mcpRequiredScopes(),
	...(origin ? { resourceUrl: origin } : {}),
});

export { authed as GET, authed as POST };
