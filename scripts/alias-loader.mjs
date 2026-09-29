// Registers alias-hooks.mjs for the current node process (test runner).
// Imported once via: node --test --import ./scripts/alias-loader.mjs
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
