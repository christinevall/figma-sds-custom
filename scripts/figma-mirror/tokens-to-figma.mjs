/**
 * src/theme.css → the Figma variables and styles that mirror it.
 *
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 * The code is the source here: src/theme.css is what the components consume,
 * so that is what Figma mirrors. scripts/tokens/tokens.json (upstream's export
 * of their own Figma file) is only used to split a CSS name into a path:
 * `--sds-color-background-default-default-hover` is background / default /
 * default-hover, and the hyphens alone cannot tell you that.
 *
 *   node scripts/figma-mirror/tokens-to-figma.mjs             the payload, as JSON
 *   node scripts/figma-mirror/tokens-to-figma.mjs --summary   counts and warnings
 *
 * Naming rule (the same in every system of the course): a Figma name is the
 * token path joined by "/", and its WEB code syntax is the real CSS variable,
 * var(--sds-<path joined by ->).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const css = readFileSync(join(ROOT, 'src/theme.css'), 'utf8');
const tokensJson = JSON.parse(readFileSync(join(ROOT, 'scripts/tokens/tokens.json'), 'utf8'));

// upstream collection key → [first path segment, our Figma collection]
const COLLECTIONS = {
  '@color_primitives': ['color', 'Color Primitives'],
  '@color': ['color', 'Color'],
  '@size': ['size', 'Size'],
  '@typography_primitives': ['typography', 'Typography Primitives'],
  '@typography': ['typography', 'Typography'],
};

const MODES = {
  'Color Primitives': ['Value'],
  Color: ['Light', 'Dark'],
  Size: ['Value'],
  'Typography Primitives': ['Value'],
  Typography: ['Value'],
};

// ---------------------------------------------------------------- read tokens.json for paths
const pathByCss = new Map(); // --sds-… → { path, collection, json }
function walk(node, path, collection) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$') || !v || typeof v !== 'object') continue;
    if ('$value' in v) {
      const p = [...path, k];
      pathByCss.set(`--sds-${p.join('-')}`, { path: p, collection, json: v });
    } else walk(v, [...path, k], collection);
  }
}
for (const [key, [prefix, collection]] of Object.entries(COLLECTIONS)) walk(tokensJson[key], [prefix], collection);

// ---------------------------------------------------------------- read theme.css
const decl = {}; // block → Map(name → value)
{
  let block = null;
  for (const line of css.split('\n')) {
    const c = line.match(/\/\*\s*(.+?)\s*\*\//);
    if (c && !line.includes('--sds')) block = c[1]; // "color: sds_light (default)", "styles", …
    const d = line.match(/^\s*(--sds-[a-z0-9-]+):\s*(.+);\s*$/);
    if (d && block) (decl[block] ??= new Map()).set(d[1], d[2].trim());
  }
}
const block = (startsWith) => {
  const k = Object.keys(decl).find((b) => b.startsWith(startsWith));
  if (!k) throw new Error(`tokens-to-figma: no "${startsWith}" block in theme.css`);
  return decl[k];
};

// ---------------------------------------------------------------- helpers
const warnings = [];
const figmaName = (p) => p.join('/');
const aliasOf = (v) => v.match(/^var\((--sds-[a-z0-9-]+)\)$/)?.[1] ?? null;
const hex = (h) => {
  const c = h.slice(1);
  const n = (i) => parseInt(c.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: c.length === 8 ? n(6) : 1 }; // exact alpha: #…b2 is 178/255, which Figma shows as 70%
};
const px = (v) => {
  if (/^-?[\d.]+rem$/.test(v)) return parseFloat(v) * 16;
  if (/^-?[\d.]+px$/.test(v)) return parseFloat(v);
  if (/^-?[\d.]+$/.test(v)) return parseFloat(v);
  throw new Error(`tokens-to-figma: unsupported size ${v}`);
};
const numericAware = (a, b) => a.localeCompare(b, 'en', { numeric: true });
// A designer's reading order, not the alphabet: anything not listed keeps its place at the end.
const rank = (list, x) => (list.indexOf(x) === -1 ? list.length : list.indexOf(x));
const RAMPS = ['white', 'black', 'gray', 'slate', 'brand', 'red', 'yellow', 'green', 'pink'];
const CATEGORIES = ['background', 'text', 'icon', 'border'];
const ROLES = ['default', 'brand', 'neutral', 'positive', 'warning', 'danger', 'disabled', 'utilities'];
const SIZE_GROUPS = ['space', 'radius', 'stroke', 'icon', 'depth', 'blur'];
// default, hover, secondary, secondary-hover, tertiary, tertiary-hover, then the on-* colours
const variantKey = (v) => `${v.startsWith('on-') ? 1 : 0}-${v.replace(/^default-hover$/, 'default-z').replace(/^hover$/, 'default-z')}`;

const SCOPES = {
  // colour, by category — so a text colour never shows up in a fill picker
  'color/background': ['FRAME_FILL', 'SHAPE_FILL'],
  'color/text': ['TEXT_FILL'],
  'color/icon': ['SHAPE_FILL', 'STROKE_COLOR'],
  'color/border': ['STROKE_COLOR'],
  'size/space': ['GAP'],
  'size/radius': ['CORNER_RADIUS'],
  'size/depth': ['EFFECT_FLOAT'],
  'size/blur': ['EFFECT_FLOAT'],
  'size/icon': ['WIDTH_HEIGHT'],
  'size/stroke': ['STROKE_FLOAT'],
};

const variables = [];
const cssToFigma = new Map(); // --sds-… → Figma variable name
function add(v) {
  variables.push(v);
  if (v.web) cssToFigma.set(v.web.slice(4, -1), v.name);
}
function lookup(cssName) {
  const hit = pathByCss.get(cssName);
  if (!hit) warnings.push(`${cssName} is in theme.css but not in tokens.json — path guessed from hyphens`);
  return hit ?? { path: cssName.replace('--sds-', '').split('-'), collection: null, json: {} };
}

// ---------------------------------------------------------------- Color Primitives (tier 1)
{
  const rows = [...block('color_primitives')].map(([name, value]) => ({ name, value, ...lookup(name) }));
  rows.sort((a, b) => rank(RAMPS, a.path[1]) - rank(RAMPS, b.path[1]) || numericAware(figmaName(a.path), figmaName(b.path)));
  for (const r of rows) {
    add({ collection: 'Color Primitives', name: figmaName(r.path), type: 'COLOR', scopes: [], hidden: true,
      web: `var(${r.name})`, values: { Value: { raw: hex(r.value) } } });
  }
}

// ---------------------------------------------------------------- Color (tier 2, Light + Dark)
{
  const light = block('color: sds_light');
  const dark = block('color: sds_dark');
  const value = (v) => (aliasOf(v) ? { alias: aliasOf(v) } : { raw: hex(v) });
  // keep the code's grouping: background, border, icon, text — then the path
  const ordered = [...light].map(([name, l]) => ({ name, l, r: lookup(name) })).sort((a, b) =>
    rank(CATEGORIES, a.r.path[1]) - rank(CATEGORIES, b.r.path[1]) || rank(ROLES, a.r.path[2]) - rank(ROLES, b.r.path[2])
    || numericAware(variantKey(a.r.path[3]), variantKey(b.r.path[3])));
  for (const { name, l, r } of ordered) {
    const d = dark.get(name);
    if (!d) warnings.push(`${name} has no dark value`);
    const scopes = SCOPES[figmaName(r.path.slice(0, 2))];
    if (!scopes) warnings.push(`${name}: no scopes for ${r.path.slice(0, 2).join('/')}`);
    add({ collection: 'Color', name: figmaName(r.path), type: 'COLOR', scopes: scopes ?? ['ALL_SCOPES'],
      web: `var(${name})`, values: { Light: value(l), Dark: value(d ?? l) } });
  }
  for (const name of dark.keys()) if (!light.has(name)) warnings.push(`${name} exists only in dark`);
}

// ---------------------------------------------------------------- Size
{
  const rows = [...block('size')].map(([name, value]) => ({ name, value, ...lookup(name) }));
  // positive scale first, numeric; negatives after, so the picker reads 0, 050, 100 …
  // and by value inside a group, so size/icon reads small, medium, large
  const neg = (r) => (r.path[2].startsWith('negative') ? 1 : 0);
  rows.sort((a, b) => rank(SIZE_GROUPS, a.path[1]) - rank(SIZE_GROUPS, b.path[1]) || neg(a) - neg(b) || Math.abs(px(a.value)) - Math.abs(px(b.value)));
  for (const r of rows) {
    const scopes = SCOPES[figmaName(r.path.slice(0, 2))];
    if (!scopes) warnings.push(`${r.name}: no scopes for ${r.path.slice(0, 2).join('/')}`);
    add({ collection: 'Size', name: figmaName(r.path), type: 'FLOAT', scopes: scopes ?? ['ALL_SCOPES'],
      web: `var(${r.name})`, values: { Value: { raw: px(r.value) } },
      ...(r.path[2] === 'full' ? { description: 'Pill shape. Code: 624.9375rem (= 9999px).' } : {}) });
  }
}

// ---------------------------------------------------------------- Typography Primitives
{
  // family, then the scale, then weights from thin to black with each italic after its upright
  const WEIGHT = { thin: 100, 'extra-light': 200, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, 'extra-bold': 800, black: 900 };
  const order = (name) => {
    const id = name.replace('--sds-typography-', '');
    if (id.startsWith('family')) return [0, id];
    if (id.startsWith('scale')) return [1, id];
    const w = id.replace('weight-', '');
    return [2, String(1000 + WEIGHT[w.replace(/-?italic$/, '') || 'regular'] + (w.endsWith('italic') ? 1 : 0))];
  };
  const prims = [...block('typography_primitives')].sort(([a], [b]) => order(a)[0] - order(b)[0] || numericAware(order(a)[1], order(b)[1]));
  for (const [name, value] of prims) {
    const r = lookup(name);
    // upstream keys are flat ("family-sans", "scale-01", "weight-bold"). Split the kind off so the
    // variable panel groups them: typography/family/sans. The CSS name is unchanged either way.
    const [kind, ...rest] = r.path[1].split('-'); // family | scale | weight
    r.path = ['typography', kind, rest.join('-')];
    if (kind === 'family') {
      add({ collection: 'Typography Primitives', name: figmaName(r.path), type: 'STRING', scopes: ['FONT_FAMILY'], hidden: true,
        web: `var(${name})`, values: { Value: { raw: r.json.$value } },
        description: `Code: ${value}. Figma needs the one real family name.` });
    } else if (kind === 'scale') {
      add({ collection: 'Typography Primitives', name: figmaName(r.path), type: 'FLOAT', scopes: ['FONT_SIZE'], hidden: true,
        web: `var(${name})`, values: { Value: { raw: px(value) } } });
    } else if (kind === 'weight' && /^\d+$/.test(value)) {
      add({ collection: 'Typography Primitives', name: figmaName(r.path), type: 'FLOAT', scopes: ['FONT_WEIGHT'], hidden: true,
        web: `var(${name})`, values: { Value: { raw: Number(value) } } });
    } else if (kind === 'weight') {
      // "700 italic": CSS packs weight and style into one value. Figma's font style is a name.
      add({ collection: 'Typography Primitives', name: figmaName(r.path), type: 'STRING', scopes: ['FONT_STYLE'], hidden: true,
        web: `var(${name})`, values: { Value: { raw: r.json.$value } },
        description: `Code: ${value}. In CSS this is a weight plus "italic"; in Figma a font style name.` });
    } else warnings.push(`${name}: unknown typography primitive kind "${kind}"`);
  }
}

// ---------------------------------------------------------------- Typography (tier 2)
{
  for (const [name, value] of block('typography:')) {
    const r = lookup(name);
    const target = aliasOf(value);
    if (!target) { warnings.push(`${name}: expected an alias, got ${value}`); continue; }
    const leaf = r.path.at(-1);
    const [type, scopes] = leaf.startsWith('font-family') ? ['STRING', ['FONT_FAMILY']]
      : leaf.startsWith('size') ? ['FLOAT', ['FONT_SIZE']]
      : leaf.startsWith('font-style') ? ['STRING', ['FONT_STYLE']]
      : ['FLOAT', ['FONT_WEIGHT']];
    add({ collection: 'Typography', name: figmaName(r.path), type, scopes, web: `var(${name})`, values: { Value: { alias: target } } });
  }
}

// resolve css aliases → Figma names, now that every variable is known
for (const v of variables) {
  for (const m of Object.values(v.values)) {
    if (m.alias) {
      const n = cssToFigma.get(m.alias);
      if (!n) warnings.push(`${v.name} aliases ${m.alias}, which does not exist`);
      m.alias = n ?? m.alias;
    }
  }
}

// ---------------------------------------------------------------- styles
const styles = block('styles');
const STYLE_GROUPS = [['single-line-', 'single-line/'], ['utilities-component-notes-', 'utilities/component-notes-']];
const textStyles = [];
const effectStyles = [];
const refs = (v) => [...v.matchAll(/var\((--sds-[a-z0-9-]+)\)/g)].map((m) => m[1]);
const byCss = (n) => variables.find((v) => v.web === `var(${n})`);
const resolve = (n) => { // follow aliases to a raw value
  let v = byCss(n);
  while (v) { const m = Object.values(v.values)[0]; if (m.alias) v = variables.find((x) => x.name === m.alias); else return m.raw; }
};

for (const [name, value] of styles) {
  const id = name.replace('--sds-', '');
  if (id.startsWith('font-')) {
    // font shorthand: <style|normal> <weight> <size> <family>
    const r = refs(value);
    const family = r.find((x) => /family/.test(x));
    const size = r.find((x) => /-size|-scale-/.test(x));
    const weight = r.find((x) => /weight/.test(x) && !/italic/.test(x));
    const italic = r.find((x) => /italic/.test(x));
    let tail = id.slice(5);
    for (const [a, b] of STYLE_GROUPS) if (tail.startsWith(a)) tail = b + tail.slice(a.length);
    const bind = { fontFamily: cssToFigma.get(family), fontSize: cssToFigma.get(size) };
    if (weight) bind.fontWeight = cssToFigma.get(weight);
    if (italic) bind.fontStyle = cssToFigma.get(italic);
    const w = weight ? resolve(weight) : 400;
    const STYLE = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
    const fam = resolve(family);
    textStyles.push({
      name: `font/${tail}`, web: `var(${name})`, family: fam,
      style: italic ? resolve(italic) : fam === 'Roboto Mono' && w === 600 ? 'SemiBold' : STYLE[w],
      size: resolve(size), bind,
      underline: id === 'font-body-link',
    });
  } else if (id.startsWith('effects-shadows-')) {
    const layers = value.split(/,\s*(?=inset|var)/).map((layer) => {
      const inset = layer.startsWith('inset');
      const [x, y, blur, spread, color] = refs(layer);
      return { type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
        bind: { offsetX: cssToFigma.get(x), offsetY: cssToFigma.get(y), radius: cssToFigma.get(blur), spread: cssToFigma.get(spread), color: cssToFigma.get(color) },
        raw: { x: resolve(x), y: resolve(y), radius: resolve(blur), spread: resolve(spread), color: resolve(color) } };
    });
    const m = id.match(/^effects-shadows-(drop|inner)-shadow-(\d+)$/);
    effectStyles.push({ name: `effects/shadows/${m[1]}-shadow-${m[2]}`, web: `var(${name})`, layers });
  } else if (id.startsWith('effects-')) {
    const [blur] = refs(value);
    const backdrop = id.includes('backdrop-filter');
    effectStyles.push({ name: `effects/${backdrop ? 'backdrop-filter' : 'filter'}/${id.split('-blur-')[1] ? 'blur-' + id.split('-blur-')[1] : id}`, web: `var(${name})`,
      layers: [{ type: backdrop ? 'BACKGROUND_BLUR' : 'LAYER_BLUR', bind: { radius: cssToFigma.get(blur) }, raw: { radius: resolve(blur) } }] });
  } else warnings.push(`${name}: a style this script does not understand`);
}
effectStyles.sort((a, b) => numericAware(a.name, b.name));

// depth and blur variables drive effects, black/white alpha ramps drive shadow colour:
// the shadow colours are primitives, used directly by the effect styles, as in code.
for (const v of variables) if (v.collection === 'Color Primitives' && /^color\/black\//.test(v.name)) v.scopes = ['EFFECT_COLOR'];

export function buildPayload() {
  return { collections: MODES, variables, textStyles, effectStyles, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = buildPayload();
  if (process.argv.includes('--summary')) {
    const per = {};
    for (const v of p.variables) per[v.collection] = (per[v.collection] ?? 0) + 1;
    console.log({ variables: p.variables.length, perCollection: per, textStyles: p.textStyles.length, effectStyles: p.effectStyles.length });
    console.log(p.warnings.length ? p.warnings.join('\n') : 'no warnings');
  } else console.log(JSON.stringify(p));
}
