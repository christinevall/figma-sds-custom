/**
 * COURSE FILE. Squeezes a Figma call that is too big to carry through the conversation in one piece.
 *
 * The Console MCP takes code as a string in the call, and the plugin sandbox cannot fetch anything
 * (not localhost, and a public URL is refused by the harness as "code from external"). A Table spec is
 * 41 KB; retyping that verbatim is where mistakes come from. This prints the same text as a compact
 * literal plus the eight-line decoder, and the decoder checks the length before running anything.
 *
 *   node scripts/figma-mirror/lz.mjs spec.js            a `return await __sds.component({…});` call
 *   node scripts/figma-mirror/lz.mjs cover.packed.js    a script (anything ending in `return …`)
 *
 * Paste the output into figma_execute. Back-references are `§offset,length;` in base 36, so the text
 * must not contain `§` (it never does: specs are ASCII plus a few typographic characters).
 */
import { readFileSync } from 'node:fs';

export function lz(s) {
  const n = s.length; const table = new Map(); let out = ''; let i = 0; const W = 30000;
  while (i < n) {
    let best = 0, bo = 0; const key = s.substr(i, 4); const cands = table.get(key) || [];
    for (let c = cands.length - 1; c >= 0 && cands.length - c < 64; c--) { const p = cands[c]; if (i - p > W) break; let l = 0; while (i + l < n && l < 1200 && s[p + l] === s[i + l]) l++; if (l > best) { best = l; bo = i - p; } }
    if (best >= 6) { out += `§${bo.toString(36)},${best.toString(36)};`; for (let k = 0; k < best; k++) { const kk = s.substr(i + k, 4); if (!table.has(kk)) table.set(kk, []); table.get(kk).push(i + k); } i += best; }
    else { out += s[i]; if (!table.has(key)) table.set(key, []); table.get(key).push(i); i++; }
  }
  return out;
}
export function unlz(c) {
  let out = '';
  for (let i = 0; i < c.length; i++) {
    if (c[i] === '§') { const j = c.indexOf(';', i); const [o, l] = c.slice(i + 1, j).split(','); const off = parseInt(o, 36), len = parseInt(l, 36); const start = out.length - off; for (let k = 0; k < len; k++) out += out[start + k]; i = j; }
    else out += c[i];
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('lz.mjs')) {
  const file = process.argv[2]; if (!file) { console.error('usage: node scripts/figma-mirror/lz.mjs <file>'); process.exit(1); }
  const s = readFileSync(file, 'utf8');
  if (s.includes('§')) throw new Error('the source contains §, which the encoding uses');
  const c = lz(s);
  if (unlz(c) !== s) throw new Error('roundtrip failed');
  console.error(`${s.length} → ${c.length} characters`);
  const isCall = /^return await __sds\.component\(/.test(s);
  // the decoder: rebuild, check the length, then run it as a component call (via unpack, so a variant may drop a key) or as a script
  console.log(`const c = ${JSON.stringify(c)};
let out = ''; for (let i = 0; i < c.length; i++) { if (c[i] === '§') { const j = c.indexOf(';', i); const [o, l] = c.slice(i + 1, j).split(','); const off = parseInt(o, 36), len = parseInt(l, 36); const start = out.length - off; for (let k = 0; k < len; k++) out += out[start + k]; i = j; } else out += c[i]; }
if (out.length !== ${s.length}) return { error: 'length ' + out.length };
${isCall
    ? `const def = eval('(' + out.match(/^return await __sds\\.component\\((\\{[\\s\\S]*\\})\\);$/)[1] + ')'); def.items = __sds.unpack(def.items); return await __sds.component(def);`
    : `return new Function(out)();`}`);
}
