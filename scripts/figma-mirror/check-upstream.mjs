/**
 * What changed in the code since the Figma library was last built?
 *
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 *   node scripts/figma-mirror/check-upstream.mjs           compare, and list what to re-mirror
 *   node scripts/figma-mirror/check-upstream.mjs --write   take a new snapshot (after the library is up to date)
 *
 * Run it after `git merge upstream/main`. It fingerprints the three things the
 * Figma library is made from — tokens and styles (src/theme.css), icons
 * (src/ui/icons) and each mirrored component's source folder — and compares
 * them with the snapshot in figma/manifest.json. Exit code 1 when something
 * differs, so it can sit in CI.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildPayload } from './tokens-to-figma.mjs';
import { icons } from './icons.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MANIFEST = join(ROOT, 'figma/manifest.json');
const hash = (x) => createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12);

function fingerprint() {
  const payload = buildPayload();
  const contracts = JSON.parse(readFileSync(join(ROOT, 'figma/contracts.json'), 'utf8'));
  const components = {};
  for (const [name, c] of Object.entries(contracts)) {
    if (name.startsWith('$')) continue; // $insts: shared rules, not a component
    const dir = dirname(join(ROOT, c.source));
    // the component's whole folder: its .tsx and its .css decide what Figma has to look like
    const files = readdirSync(dir).filter((f) => /\.(tsx|css)$/.test(f)).sort();
    components[name] = { source: c.source, hash: hash(files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')), contract: hash(c) };
  }
  return {
    variables: Object.fromEntries(payload.variables.map((v) => [v.name, hash(v.values)])),
    textStyles: Object.fromEntries(payload.textStyles.map((t) => [t.name, hash(t)])),
    effectStyles: Object.fromEntries(payload.effectStyles.map((e) => [e.name, hash(e)])),
    icons: Object.fromEntries(icons().list.map((i) => [i.name, hash(i.paths)])),
    components,
  };
}

const compare = (was = {}, now = {}, key = (x) => x) => ({
  added: Object.keys(now).filter((k) => !(k in was)),
  removed: Object.keys(was).filter((k) => !(k in now)),
  changed: Object.keys(now).filter((k) => k in was && JSON.stringify(key(was[k])) !== JSON.stringify(key(now[k]))),
});

const now = fingerprint();
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* not a git checkout */ }

if (process.argv.includes('--write')) {
  manifest.source = { takenAt: new Date().toISOString().slice(0, 10), commit, ...now };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`snapshot written: ${Object.keys(now.variables).length} variables, ${Object.keys(now.textStyles).length} text styles, ${Object.keys(now.effectStyles).length} effect styles, ${Object.keys(now.icons).length} icons, ${Object.keys(now.components).length} components`);
  process.exit(0);
}

if (!manifest.source) { console.error('No snapshot yet. Run with --write once the Figma library matches the code.'); process.exit(2); }
console.log(`Snapshot of ${manifest.source.takenAt} (commit ${manifest.source.commit}) against the code now (commit ${commit})\n`);
let dirty = false;
for (const [label, was, cur, key, todo] of [
  ['Variables', manifest.source.variables, now.variables, undefined, 'tokens-to-figma.mjs, then apply the differences in Figma (never delete without asking)'],
  ['Text styles', manifest.source.textStyles, now.textStyles, undefined, 'same as variables'],
  ['Effect styles', manifest.source.effectStyles, now.effectStyles, undefined, 'same as variables'],
  ['Icons', manifest.source.icons, now.icons, undefined, 'icons.mjs --batch, into the Icons page'],
  ['Components', manifest.source.components, now.components, (c) => c.hash, 'probe + builder for each one listed (figma-mirror skill)'],
  ['Contracts', manifest.source.components, now.components, (c) => c.contract, 'a contract changed on our side: rebuild that component'],
]) {
  const d = compare(was, cur, key);
  const n = d.added.length + d.removed.length + d.changed.length;
  if (!n) { console.log(`✓ ${label}: no change`); continue; }
  dirty = true;
  console.log(`✗ ${label}: ${n} to look at → ${todo}`);
  for (const [kind, list] of Object.entries(d)) if (list.length) console.log(`    ${kind}: ${list.slice(0, 40).join(', ')}${list.length > 40 ? ` … +${list.length - 40}` : ''}`);
}
// new component folders upstream that no contract covers yet
const covered = new Set(Object.values(now.components).map((c) => dirname(c.source)));
for (const base of ['src/ui/primitives', 'src/ui/compositions']) {
  for (const d of readdirSync(join(ROOT, base), { withFileTypes: true })) if (d.isDirectory() && !covered.has(`${base}/${d.name}`)) console.log(`· no contract covers ${base}/${d.name} (see figma/GAPS.md for the ones left out on purpose)`);
}
process.exit(dirty ? 1 : 0);
