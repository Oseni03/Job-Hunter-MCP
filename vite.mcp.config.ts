import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// MCP App bundle only. The Next.js app is untouched; this config produces a
// single self-contained HTML file served both as the MCP UI resource and as a
// static standalone page. No external origins (system fonts, inlined assets,
// no fetch, no storage), so the resource needs no custom CSP domains.
export default defineConfig({
	plugins: [react(), viteSingleFile()],
	build: {
		outDir: "public/mcp-app",
		emptyOutDir: false,
		assetsInlineLimit: 100_000_000,
		rollupOptions: {
			input: "mcp-app.html",
		},
	},
});
