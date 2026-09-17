/**
 * COURSE FILE. Prints the Figma call that (re)builds a component page's documentation frame.
 *   node scripts/figma-mirror/docs-call.mjs Button        one page
 *   node scripts/figma-mirror/docs-call.mjs --all         every page, one call per line
 * Paste the output into the Console MCP (the builder must be installed).
 */
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync(new URL('../../figma/contracts.json', import.meta.url), 'utf8'));
const js = (o) => (o === null ? 'null' : typeof o === 'string' ? `'${o.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(o) ? `[${o.map(js).join(',')}]` : typeof o === 'object' ? `{${Object.entries(o).map(([k, v]) => `${k}:${js(v)}`).join(',')}}` : String(o));
const pages = process.argv.includes('--all') ? Object.keys(c.$pages) : process.argv.slice(2);
for (const page of pages) {
  const contracts = Object.entries(c).filter(([n, x]) => !n.startsWith('$') && x.page === page).map(([n, x]) => `${n} — ${x.description.replace(/^Contract — /, '')}`);
  console.log(`await __sds.doc(${js(page)}, ${js({ title: page, description: c.$pages[page].description, contracts, gaps: c.$pages[page].gaps })});`);
}
