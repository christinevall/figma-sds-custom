/**
 * COURSE FILE. Strips comments and indentation from builder.figma.js so it is
 * small enough to paste into one Console MCP call.
 *   node scripts/figma-mirror/pack.mjs > /tmp/builder.packed.js
 */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL(`./${process.argv[2] ?? "builder"}.figma.js`, import.meta.url), "utf8"); // pack.mjs cover → the cover script
console.log(src.replace(/\/\*\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l) && l.trim()).map((l) => l.replace(/^\s+/, '')).join('\n'));
