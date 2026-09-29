// Resolve hook mapping the @/ path alias (tsconfig paths: @/* -> ./ *)
// to real file URLs, so plain node runs resolve the same specifiers as
// Next.js webpack. Registered by alias-loader.mjs via module.register().
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith("@/")) {
		return nextResolve(pathToFileURL(path.join(root, specifier.slice(2))).href, context);
	}
	return nextResolve(specifier, context);
}
