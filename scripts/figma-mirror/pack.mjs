/**
 * COURSE FILE. Minifies builder.figma.js (or cover.figma.js) so it fits one Console MCP call.
 *   node scripts/figma-mirror/pack.mjs          the builder
 *   node scripts/figma-mirror/pack.mjs cover    the cover script
 * Uses esbuild, which Vite already brings along.
 */
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
const name = process.argv[2] ?? 'builder';
const src = readFileSync(new URL(`./${name}.figma.js`, import.meta.url), 'utf8');
const i = src.lastIndexOf('\nreturn ');
const { code } = await transform(src.slice(0, i), { minify: true, target: 'es2020' });
console.log(code.trim() + src.slice(i).trim());
