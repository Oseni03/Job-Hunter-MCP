import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// The dashboard bundle is read from disk at runtime with a dynamic path,
	// which the file tracer cannot see — include it in the /job-hunter/mcp
	// serverless function explicitly, or production falls back to "not built".
	outputFileTracingIncludes: {
		"/job-hunter/mcp": ["./public/mcp-app/mcp-app.html"],
	},
};

export default nextConfig;
