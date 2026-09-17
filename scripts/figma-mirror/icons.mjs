/**
 * src/ui/icons/Icon*.tsx → the icon list Figma mirrors.
 *
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 *   node scripts/figma-mirror/icons.mjs --summary     count, and anything unusual
 *   node scripts/figma-mirror/icons.mjs               [{ name, paths: [d, …] }, …] as JSON
 *   node scripts/figma-mirror/icons.mjs --batch 0 60  one slice, compact, for a Figma call
 *
 * Every icon in code is stroked paths on a 16×16 viewBox, stroke 1.6, round caps
 * and joins, coloured by --svg-stroke-color. 131 of them wrap the paths in a
 * clip-path the size of the viewBox; that clip draws nothing, so it is dropped.
 * The path data is the only thing that differs between icons, so that is all
 * this script keeps. The probe uses the same data to recognise an icon in a
 * rendered story (the DOM has no icon name, only the paths).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = join(fileURLToPath(new URL('../..', import.meta.url)), 'src/ui/icons');

export function icons() {
  const unusual = [];
  const list = readdirSync(DIR).filter((f) => /^Icon.+\.tsx$/.test(f)).sort().map((file) => {
    const src = readFileSync(join(DIR, file), 'utf8');
    const name = file.replace('.tsx', '');
    const paths = [...src.matchAll(/<path\s+d="([^"]+)"([^>]*)\/>/g)].map((m) => {
      if (!/strokeWidth="1\.6"/.test(m[2]) || !/stroke="var\(--svg-stroke-color\)"/.test(m[2])) unusual.push(`${name}: path with ${m[2].trim()}`);
      return m[1];
    });
    if (!paths.length) unusual.push(`${name}: no paths`);
    const other = [...src.matchAll(/<(circle|ellipse|line|polyline|polygon)\b/g)].map((m) => m[1]);
    if (other.length) unusual.push(`${name}: uses ${other.join(', ')}`);
    return { name, paths };
  });
  return { list, unusual };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { list, unusual } = icons();
  const i = process.argv.indexOf('--batch');
  if (process.argv.includes('--summary')) {
    console.log({ icons: list.length, paths: list.reduce((n, x) => n + x.paths.length, 0) });
    console.log(unusual.length ? unusual.join('\n') : 'nothing unusual');
  } else if (i > -1) {
    const [from, to] = [Number(process.argv[i + 1]), Number(process.argv[i + 2])];
    console.log(list.slice(from, to).map((x) => `${x.name.slice(4)}=${x.paths.join('|')}`).join('\n'));
  } else console.log(JSON.stringify(list));
}
