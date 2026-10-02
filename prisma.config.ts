import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: connection string lives here, not in schema.prisma.
// `process.env` direct access (instead of env() helper) so `prisma generate`
// still works when DATABASE_URL is unset (e.g. CI type-check).
export default defineConfig({
	schema: "prisma/schema.prisma",
	datasource: {
		url: process.env["DATABASE_URL"] ?? "file:./prisma/job-hunter.db",
	},
});
