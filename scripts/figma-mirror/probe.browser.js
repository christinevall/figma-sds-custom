/**
 * The probe: a rendered Storybook story → a spec Figma can be built from.
 *
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 * Runs in the browser, on the Storybook page (port 6004):
 *
 *   const { probe } = await import('/scripts/figma-mirror/probe.browser.js');
 *   await probe({ id: 'sds-primitives-buttons--story-button', args: 'variant:neutral;size:small' });
 *
 * Why a probe and not a CSS parser: SDS styles components through local custom
 * properties (`--button-background-color`) that point at tokens, switched by
 * classes and data attributes. The browser already knows which rule wins. The
 * probe asks it, then follows each winning value back to the `--sds-*` token it
 * came from, because a computed style only says "#2c2c2c" and Figma needs to
 * know "color/background/brand/default".
 *
 * Every value that does NOT end in one token (a raw number, a calc(), an em) is
 * reported in `gaps`. That list is where figma/GAPS.md comes from.
 */

/**
 * Waiting without timers. When the Browser pane is hidden Chrome throttles setTimeout (down to one
 * wake-up a minute for chained timers), and a 12-variant component would take a quarter of an hour.
 * Message-channel tasks are not throttled, so: yield that way and watch the clock.
 */
const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const idle = async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

let MAP = null; // css custom property → Figma variable / style name
let ICONS = null; // joined path data → icon component name

async function load() {
  if (MAP) return;
  MAP = await (await fetch('/figma/token-map.json')).json();
  const list = await (await fetch('/figma/icon-paths.json')).json();
  ICONS = new Map(list.map((i) => [i.paths.join('|'), i.name]));
}

// ------------------------------------------------------------------ selectors and the cascade
const splitTop = (s, sep = ',') => {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

function nest(child, parent) {
  if (!parent) return child;
  const p = splitTop(parent).length > 1 ? `:is(${parent})` : parent;
  return splitTop(child).map((c) => (c.includes('&') ? c.replaceAll('&', p) : `${p} ${c}`)).join(', ');
}

function specificity(sel) {
  let a = 0, b = 0, c = 0;
  sel = sel.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  sel = sel.replace(/:(?:is|not|has)\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g, (m, inner) => {
    const best = splitTop(inner).map(specificity).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).pop() ?? [0, 0, 0];
    a += best[0]; b += best[1]; c += best[2]; return ' ';
  });
  sel = sel.replace(/\[[^\]]*\]/g, () => { b++; return ' '; });
  sel = sel.replace(/#[\w-]+/g, () => { a++; return ' '; });
  sel = sel.replace(/\.[\w-]+/g, () => { b++; return ' '; });
  sel = sel.replace(/::[\w-]+(\([^)]*\))?/g, () => { c++; return ' '; });
  sel = sel.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return ' '; });
  sel = sel.replace(/[a-zA-Z][\w-]*/g, () => { c++; return ' '; });
  return [a, b, c];
}

/**
 * The rules, read from the stylesheet SOURCE, not from the CSSOM. The CSSOM loses
 * information we need: `font: var(--button-font)` followed by `line-height: 1`
 * can no longer be serialised as a shorthand, so Chrome reports every font
 * longhand as "" and the token is gone. The source text still has it.
 */
function parseCss(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const block = () => {
    const decls = [], rules = []; let cur = '', depth = 0, quote = null;
    while (i < text.length) {
      const ch = text[i++];
      if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && ch === ';') { const d = cur.trim(); cur = ''; const c = d.indexOf(':'); if (c > 0) decls.push({ prop: d.slice(0, c).trim(), value: d.slice(c + 1).replace(/\s+/g, ' ').replace(/\s*!important\s*$/, '').trim(), imp: /!important\s*$/.test(d) ? 1 : 0 }); continue; }
      if (depth === 0 && ch === '{') { const prelude = cur.replace(/\s+/g, ' ').trim(); cur = ''; rules.push({ prelude, ...block() }); continue; }
      if (depth === 0 && ch === '}') break;
      cur += ch;
    }
    const last = cur.trim(); const c = last.indexOf(':');
    if (c > 0 && !last.includes('{')) decls.push({ prop: last.slice(0, c).trim(), value: last.slice(c + 1).replace(/\s+/g, ' ').trim(), imp: 0 });
    return { decls, rules };
  };
  return block().rules;
}

async function collectRules(doc) {
  const win = doc.defaultView;
  const rules = []; let order = 0;
  const walk = (list, parentSel) => {
    for (const r of list) {
      if (r.prelude.startsWith('@media')) { if (win.matchMedia(r.prelude.slice(6).trim()).matches) walk(r.rules, parentSel); continue; }
      if (r.prelude.startsWith('@supports') || r.prelude.startsWith('@layer')) { walk(r.rules, parentSel); continue; }
      if (r.prelude.startsWith('@')) continue; // @font-face, @keyframes, …
      const sel = nest(r.prelude, parentSel);
      const parts = splitTop(sel).map((x) => {
        const pseudo = x.match(/::?(before|after|placeholder)$/);
        return { sel: pseudo ? x.slice(0, pseudo.index) || '*' : x, pseudo: pseudo ? pseudo[1] : null, spec: specificity(x) };
      });
      rules.push({ parts, decls: r.decls, order: order++ });
      walk(r.rules, sel);
    }
  };
  for (const sheet of doc.styleSheets) {
    let text = sheet.ownerNode?.textContent;
    if (!text && sheet.href) { try { text = await (await fetch(sheet.href)).text(); } catch { text = ''; } }
    if (text) walk(parseCss(text), null);
  }
  return rules;
}

async function makeCascade(doc) {
  const rules = await collectRules(doc);
  const cache = new WeakMap();
  const matched = (el, pseudo) => {
    const key = pseudo ?? 'self';
    let perEl = cache.get(el); if (!perEl) cache.set(el, (perEl = {}));
    if (perEl[key]) return perEl[key];
    const hits = [];
    for (const r of rules) {
      let best = null;
      for (const p of r.parts) {
        if ((p.pseudo ?? null) !== (pseudo ?? null)) continue;
        let ok = false; try { ok = el.matches(p.sel); } catch { ok = false; }
        if (ok && (!best || cmp(p.spec, best) > 0)) best = p.spec;
      }
      if (best) hits.push({ spec: best, order: r.order, decls: r.decls });
    }
    hits.sort((x, y) => cmp(x.spec, y.spec) || x.order - y.order);
    return (perEl[key] = hits);
  };
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  /** The winning declared value among `props` (longhand first, then its shorthands). */
  const decl = (el, props, pseudo) => {
    let win = null;
    for (const h of matched(el, pseudo)) {
      // inside one rule the later declaration wins, whether longhand or shorthand
      for (const d of h.decls) {
        if (!props.includes(d.prop) || CSS_WIDE.includes(d.value)) continue;
        if (!win || d.imp >= win.imp) win = { value: d.value, prop: d.prop, imp: d.imp };
      }
    }
    if (!pseudo && el.style) for (const p of props) { const v = el.style.getPropertyValue(p); if (v) { win = { value: v.trim(), prop: p, imp: 2 }; break; } }
    return win;
  };
  /** Same, but for inherited properties: the nearest ancestor that declares it. */
  const inherited = (el, props) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const d = decl(n, props); if (d) return { ...d, from: n }; }
    return null;
  };
  /** Replace local custom properties until only --sds-* tokens and literals remain. */
  const expand = (el, value, depth = 0) => {
    if (depth > 12 || !value) return value;
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\((?:[^()]|\([^()]*\))*\))*))?\)/g, (m, name, fallback) => {
      if (name.startsWith('--sds-')) return `var(${name})`;
      const d = inherited(el, [name]);
      if (d) return expand(d.from, d.value, depth + 1);
      return fallback ? expand(el, fallback, depth + 1) : '';
    }).trim();
  };
  return { decl, inherited, expand };
}

// ------------------------------------------------------------------ values
const CSS_WIDE = ['unset', 'initial', 'inherit', 'revert', 'revert-layer'];
const ONE_TOKEN = /^var\((--sds-[\w-]+)\)$/;
function value(expanded, computed) {
  const out = { v: computed };
  if (!expanded) return out;
  const m = expanded.match(ONE_TOKEN);
  if (m) {
    const tok = MAP.vars[m[1]] ?? MAP.textStyles[m[1]] ?? MAP.effectStyles[m[1]];
    if (tok) out.tok = tok; else out.missing = m[1]; // a token the code uses but theme.css never defines
  } else out.raw = expanded;
  return out;
}
const num = (s) => Math.round(parseFloat(s) * 100) / 100;
const box4 = (parts) => (parts.length === 1 ? [0, 0, 0, 0] : parts.length === 2 ? [0, 1, 0, 1] : parts.length === 3 ? [0, 1, 2, 1] : [0, 1, 2, 3]).map((i) => parts[i]);

/**
 * An instance hint reads its property values off the DOM, so one rule covers every Button on a page:
 *   $text            the element's text            $text:<sel>     the text of a descendant
 *   $class:<prefix>  the rest of the class that starts with prefix ("button-variant-" → "neutral")
 *   $hasClass:<c>    true / false                  $has:<sel>      a descendant exists
 *   $attr:<name>     the attribute is present      $icon:<sel>     the icon component that svg is
 *   $attrval:<sel>|<name>  an attribute's value on a descendant (an input's placeholder)
 *   $iconStart? / $iconEnd?   the first / last child node is an icon;  $iconStart / $iconEnd  which one
 */
function resolveHint(el, hint) {
  const iconName = (svg) => (svg ? ICONS.get([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|')) ?? null : null);
  const nodes = [...el.childNodes].filter((n) => n.nodeType === 1 || n.textContent.trim());
  const edge = (n) => (n && n.nodeType === 1 && n.tagName.toLowerCase() === 'svg' ? n : null);
  const one = (v) => {
    if (typeof v !== 'string' || !v.startsWith('$')) return v;
    if (v === '$text') return el.textContent.replace(/\s+/g, ' ').trim();
    if (v.startsWith('$text:')) return el.querySelector(v.slice(6))?.textContent.replace(/\s+/g, ' ').trim() ?? '';
    if (v.startsWith('$class:')) { const pre = v.slice(7); const c = [...el.classList].find((x) => x.startsWith(pre)); return c ? c.slice(pre.length) : undefined; }
    if (v.startsWith('$hasClass:')) return el.classList.contains(v.slice(10));
    if (v.startsWith('$has:')) return !!el.querySelector(v.slice(5));
    if (v.startsWith('$attrval:')) { const [sel, a] = v.slice(9).split('|'); return el.querySelector(sel)?.getAttribute(a) ?? undefined; }
    if (v.startsWith('$attr:')) return el.hasAttribute(v.slice(6));
    if (v.startsWith('$icon:')) return iconName(el.querySelector(v.slice(6)));
    if (v === '$iconStart?') return nodes.length > 1 && !!edge(nodes[0]);
    if (v === '$iconEnd?') return nodes.length > 1 && !!edge(nodes.at(-1));
    if (v === '$iconStart') return nodes.length > 1 ? iconName(edge(nodes[0])) : null;
    if (v === '$iconEnd') return nodes.length > 1 ? iconName(edge(nodes.at(-1))) : null;
    return v;
  };
  const props = {};
  for (const [k, v] of Object.entries(hint.props ?? {})) { const r = one(v); if (r !== undefined && r !== null) props[k] = r; }
  return { ...hint, props };
}

// ------------------------------------------------------------------ the walk
function specFor(el, ctx, rootRect, parent) {
  const { win, cas, gaps } = ctx;
  const cs = win.getComputedStyle(el);
  if (cs.display === 'none') return null;
  const r = el.getBoundingClientRect();
  // React Aria's VisuallyHidden (the real <input> behind a checkbox, switch or slider thumb): for screen readers only
  if (r.width <= 1.5 && r.height <= 1.5 && (cs.clip !== 'auto' || /inset\(50%\)/.test(cs.clipPath) || cs.overflow === 'hidden')) return null;
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class') ?? '';
  // the first class names the layer; `text-align-*` is a utility, not an identity (TextContentTitle's subtitle is `text-subtitle`)
  const s = { t: tag, c: cls.split(' ').filter((x) => !x.startsWith('layer-') && !x.startsWith('inst-') && !x.startsWith('text-align-')).slice(0, 3).join(' '), box: [num(r.left - rootRect.left), num(r.top - rootRect.top), num(r.width), num(r.height)] };
  const layer = cls.split(' ').find((x) => x.startsWith('layer-')); if (layer) s.name = layer.slice(6);
  let inst = cls.split(' ').find((x) => x.startsWith('inst-'));
  if (!inst && parent) for (const [sel, hint] of Object.entries(ctx.insts ?? {})) if (el.matches(sel)) { inst = `inst-${btoa(unescape(encodeURIComponent(JSON.stringify(resolveHint(el, hint)))))}`; break; }
  if (inst && parent) { // an instance of a component the library already has: measure it, do not describe it
    s.inst = JSON.parse(decodeURIComponent(escape(atob(inst.slice(5))))); if (s.inst.layer) { s.name = s.inst.layer; }
    const ics = win.getComputedStyle(el); s.disp = ics.display; if (ics.flexGrow !== '0') s.grow = num(ics.flexGrow); if (ics.position !== 'static') s.pos = ics.position;
    const iw = cas.decl(el, ['width']); if (iw && !CSS_WIDE.includes(iw.value) && iw.value !== 'auto') s.width = value(cas.expand(el, iw.value), ics.width);
    // a colour the instance inherits from outside itself (a brand Card's `on-brand` on its TextPrice): an override on its text
    const col = cas.inherited(el, ['color']); if (col && col.from !== el && !el.contains(col.from)) s.textColor = value(cas.expand(col.from, col.value), ics.color);
    return s;
  }
  const note = (prop, val) => { if (val.raw !== undefined || val.missing) gaps.push({ el: `${tag}.${cls.split(' ')[0]}`, prop, declared: val.raw ?? val.missing, computed: val.v, kind: val.missing ? 'undefined token' : /calc\(/.test(val.raw) ? 'calc' : 'raw' }); return val; };
  const get = (props, computedProp, inherit = false) => {
    const d = inherit ? cas.inherited(el, props) : cas.decl(el, props);
    return { d, ex: d ? cas.expand(inherit ? d.from : el, d.value) : null, computed: cs.getPropertyValue(computedProp) };
  };

  // visibility / opacity
  if (cs.visibility === 'hidden') s.hidden = true;
  // a panel collapsed to nothing (`max-height: 0` and overflow hidden, the closed Accordion): a hidden layer, so the closed state has none
  if (num(cs.maxHeight) === 0 && (cs.overflowY === 'hidden' || cs.overflow === 'hidden')) s.hidden = true;
  if (cs.opacity !== '1') s.opacity = note('opacity', value(get(['opacity'], 'opacity').ex, num(cs.opacity)));

  // icons and other svg
  if (tag === 'svg') {
    const key = [...el.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|');
    const name = ICONS.get(key);
    const ink = cas.inherited(el, ['--icon-color']);
    const size = cas.inherited(el, ['--icon-diameter']);
    if (name) {
      s.icon = name;
      s.ink = value(ink ? cas.expand(ink.from, ink.value) : null, cs.getPropertyValue('--svg-stroke-color') || cs.color);
      s.size = value(size ? cas.expand(size.from, size.value) : null, num(r.width));
      if (s.ink.raw !== undefined) note('--icon-color', s.ink);
    } else if (el.querySelector('text')) {
      // SVG text (Avatar's initials): it scales with the viewBox, so its size in pixels is computed, never a token
      const t = el.querySelector('text'); const tcs = win.getComputedStyle(t);
      const scale = r.width / (el.viewBox?.baseVal?.width || r.width);
      const fill = cas.decl(t, ['fill']); const bg = cas.decl(el, ['background-color', 'background']);
      s.disp = 'flex'; s.dir = 'row'; s.ai = 'center'; s.jc = 'center'; s.svgText = true;
      if (bg) s.bg = note('background', value(cas.expand(el, bg.value), cs.backgroundColor));
      const rad = cas.decl(el, ['border-radius']); if (rad) s.radius = [note('border-radius', value(cas.expand(el, rad.value), num(cs.borderTopLeftRadius)))];
      s.kids = [{ t: '#text', text: t.textContent, box: s.box }];
      s.type = { style: { v: `${tcs.fontWeight} ${num(parseFloat(tcs.fontSize) * scale)}px ${tcs.fontFamily}`, raw: `SVG text, ${tcs.fontSize} in a ${el.viewBox?.baseVal?.width}-unit viewBox` }, color: note('fill', value(fill ? cas.expand(t, fill.value) : null, tcs.fill)), size: num(parseFloat(tcs.fontSize) * scale), lh: 'normal', ws: 'nowrap', align: 'center' };
      gaps.push({ el: 'svg text', prop: 'font-size', declared: `${tcs.fontSize} inside viewBox ${el.getAttribute('viewBox')}`, computed: `${s.type.size}px`, kind: 'raw' });
      if (cs.position !== 'static') { s.pos = cs.position; }
    } else {
      // a shape drawn in place (the Tooltip arrow): its fill, rotation and offset come from CSS
      s.svg = el.outerHTML;
      const fill = cas.decl(el, ['fill']); if (fill) s.ink = note('fill', value(cas.expand(el, fill.value), cs.fill));
      // a stroke or fill written as `var(--x)` on the paths (the Logo): follow the variable to its token, and give the
      // markup the computed colour so the import draws it
      const varsUsed = [...new Set([...s.svg.matchAll(/(stroke|fill)="var\((--[\w-]+)\)"/g)].map((m) => `${m[1]}|${m[2]}`))];
      for (const pair of varsUsed) {
        const [attr, name] = pair.split('|'); const d = cas.inherited(el, [name]); const computed = cs.getPropertyValue(name).trim();
        const val = value(d ? cas.expand(d.from, d.value) : null, computed); note(name, val);
        s[attr === 'stroke' ? 'stroke' : 'ink'] = val; s.svg = s.svg.replaceAll(`${attr}="var(${name})"`, `${attr}="${computed || 'currentColor'}"`);
      }
      if (cs.transform && cs.transform !== 'none') {
        const mt = new win.DOMMatrix(cs.transform); const deg = Math.round(Math.atan2(mt.b, mt.a) * 180 / Math.PI);
        if (deg) s.rot = deg; // CSS degrees, clockwise
        s.pos = 'absolute'; // a translate() moves it off its flow position: draw it where it is
      }
      if (cs.position !== 'static') s.pos = cs.position;
      s.svgSize = [num(parseFloat(cs.width)), num(parseFloat(cs.height))]; // the unrotated size (the box is the rotated bounds)
    }
    return s;
  }
  if (tag === 'img') { s.img = { fit: cs.objectFit }; } // the picture itself cannot travel: Figma gets a placeholder fill

  // layout
  let disp = cs.display;
  // Table layout: rows become horizontal stacks, cells keep the width the browser gave them.
  // Auto layout has no table model, so a column does not grow when its content does.
  if (disp === 'table-row') { disp = 'flex'; s.tableRow = true; }
  if (disp === 'table-cell') { s.width = { v: `${num(r.width)}px`, raw: 'table-cell' }; if (!ctx.tableNoted) { ctx.tableNoted = true; gaps.push({ el: 'table', prop: 'display: table', declared: 'column widths follow their content', computed: 'fixed at the measured width', kind: 'layout' }); } }
  // Inline flow: a block whose children are inline elements next to text (TextPrice's <sup>$</sup>50) is one line, so a row.
  // Its children sit on the line's top; a raised <sup> is 2px lower, close enough for MIN.
  if (!disp.includes('flex') && !disp.includes('grid') && el.children.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && [...el.children].every((c) => win.getComputedStyle(c).display.startsWith('inline'))) { disp = 'flex'; s.inlineFlow = true; }
  s.disp = disp;
  if (s.inlineFlow) { s.dir = 'row'; s.ai = 'flex-start'; s.jc = 'flex-start'; }
  if (disp.includes('flex') && !s.inlineFlow) {
    s.dir = s.tableRow ? 'row' : cs.flexDirection; if (cs.flexWrap !== 'nowrap' && !s.tableRow) s.wrap = cs.flexWrap;
    s.ai = s.tableRow ? 'stretch' : cs.alignItems; s.jc = s.tableRow ? 'flex-start' : cs.justifyContent;
  } else if (disp.includes('grid')) {
    const g = get(['grid-template-columns'], 'grid-template-columns');
    const tracks = g.ex ? splitTop(g.ex, ' ') : [];
    s.grid = { cols: cs.gridTemplateColumns.split(' ').map(num), tok: tracks.map((t) => { const m = t.match(ONE_TOKEN); return m ? MAP.vars[m[1]] ?? null : null; }), decl: tracks.map((t) => (/fr\b|minmax|%/.test(t) ? 'fill' : t === 'auto' || /content/.test(t) ? 'hug' : 'fixed')) };
    s.ai = cs.alignItems; s.jc = cs.justifyContent;
  }
  for (const [k, props, cprop] of [['gapRow', ['row-gap', 'gap'], 'row-gap'], ['gapCol', ['column-gap', 'gap'], 'column-gap']]) {
    const g = get(props, cprop);
    if (g.d && cs.getPropertyValue(cprop) !== 'normal') {
      let ex = g.ex; if (g.d.prop === 'gap') { const parts = splitTop(ex, ' '); ex = parts[k === 'gapRow' ? 0 : parts.length - 1]; }
      s[k] = note(cprop, value(ex, num(cs.getPropertyValue(cprop))));
    }
  }
  if (cs.position !== 'static') { s.pos = cs.position; if (cs.position === 'absolute' || cs.position === 'fixed') s.inset = [cs.top, cs.right, cs.bottom, cs.left]; if (cs.zIndex !== 'auto' && num(cs.zIndex) > 0) s.z = num(cs.zIndex); }
  if (cs.flexGrow !== '0') s.grow = num(cs.flexGrow);
  if (cs.alignSelf !== 'auto' && cs.alignSelf !== 'normal') s.alignSelf = cs.alignSelf;
  if (cs.overflow !== 'visible') s.overflow = cs.overflow;
  for (const p of ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio']) {
    const g = get([p], p); if (g.d && !['auto', 'none', 'unset', 'initial', 'inherit', 'revert', 'revert-layer'].includes(g.d.value)) { const val = value(g.ex, cs.getPropertyValue(p)); s[p] = /^[\d.]+%$/.test(val.raw ?? '') ? val : note(p, val); } // a percentage is not a gap: it becomes Fill
  }
  // a <textarea> is as tall as its `rows` (the browser's default is 2), not its one line of placeholder: a fixed height, no token.
  // Its text always starts at the top: `align-items` does not apply to a textarea, whatever the stylesheet says.
  if (tag === 'textarea') { if (!s.height) s.height = note('height', { v: `${num(r.height)}px`, raw: `rows=${el.rows}` }); s.ai = 'flex-start'; }
  // an inline icon in a block (the Accordion chevron's <span>, the Notification icon's) sits in a line box taller than itself:
  // the box is real, the icon stays at the top. A fixed height, no token
  if (!s.height && !cs.display.includes('flex') && !cs.display.includes('grid') && el.children.length && [...el.children].every((c) => c.tagName.toLowerCase() === 'svg')) {
    const tallest = Math.max(...[...el.children].map((c) => c.getBoundingClientRect().height));
    if (r.height - tallest > 0.5) s.height = note('height', { v: `${num(r.height)}px`, raw: `line box around a ${num(tallest)}px icon` });
  }

  // padding + margin (4 sides each)
  for (const [key, base] of [['pad', 'padding'], ['margin', 'margin']]) {
    const sides = ['top', 'right', 'bottom', 'left'].map((side, i) => {
      const comp = num(cs.getPropertyValue(`${base}-${side}`));
      const g = get([`${base}-${side}`, base], `${base}-${side}`);
      if (!g.d) return { v: comp };
      let ex = g.ex; if (g.d.prop === base) ex = box4(splitTop(ex, ' '))[i];
      return comp === 0 && !ONE_TOKEN.test(ex ?? '') ? { v: 0 } : note(`${base}-${side}`, value(ex, comp));
    });
    if (sides.some((x) => x.v !== 0 || x.tok)) s[key] = sides;
  }

  // radius (4 corners; one entry when they agree)
  {
    const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c, i) => {
      const comp = num(cs.getPropertyValue(`border-${c}-radius`));
      const g = get([`border-${c}-radius`, 'border-radius'], `border-${c}-radius`);
      if (!g.d) return { v: comp };
      let ex = g.ex; if (g.d.prop === 'border-radius') ex = box4(splitTop(ex.split('/')[0], ' '))[i];
      return comp === 0 ? { v: 0 } : value(ex, comp);
    });
    if (corners.some((x) => x.v)) { s.radius = corners.every((x) => JSON.stringify(x) === JSON.stringify(corners[0])) ? [corners[0]] : corners; s.radius.forEach((x) => note('border-radius', x)); }
  }

  // fill
  {
    const g = get(['background-color', 'background'], 'background-color');
    const comp = cs.backgroundColor;
    if (comp !== 'rgba(0, 0, 0, 0)' && comp !== 'transparent') s.bg = note('background', value(g.ex, comp));
    if (cs.backgroundImage !== 'none') s.bgImage = cs.backgroundImage.slice(0, 200);
  }

  // borders: real ones, and the inset box-shadow SDS uses as a border
  {
    const sides = ['top', 'right', 'bottom', 'left'].map((side) => {
      const w = num(cs.getPropertyValue(`border-${side}-width`));
      if (!w || cs.getPropertyValue(`border-${side}-style`) === 'none') return null;
      const g = get([`border-${side}-color`, `border-${side}`, 'border-color', 'border'], `border-${side}-color`);
      const wg = get([`border-${side}-width`, `border-${side}`, 'border-width', 'border'], `border-${side}-width`);
      const pick = (ex, re) => (ex ? splitTop(ex, ' ').find((p) => re.test(p)) ?? ex : ex);
      return { side, w: note(`border-${side}-width`, value(pick(wg.ex, /size-stroke|px|rem|^\d/), w)), color: note(`border-${side}-color`, value(pick(g.ex, /color|#|rgb/), cs.getPropertyValue(`border-${side}-color`))), style: cs.getPropertyValue(`border-${side}-style`) };
    }).filter(Boolean);
    if (sides.length) s.border = sides;
    const sh = get(['box-shadow'], 'box-shadow');
    if (cs.boxShadow !== 'none') {
      // SDS stacks two things in box-shadow: an inset ring that acts as the border, and the real shadow token
      const computedParts = splitTop(cs.boxShadow);
      const rest = [];
      splitTop(sh.ex ?? '').forEach((part, i) => {
        const inset = part.match(/^inset\s+0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+(\S+)\s+(.+)$/);
        if (inset && !s.insetBorder) {
          const comp = computedParts.find((c) => /inset/.test(c)) ?? computedParts[i] ?? '';
          const color = value(inset[2], comp.match(/rgba?\([^)]+\)/)?.[0]);
          if (color.v && !/rgba\(0, 0, 0, 0\)/.test(color.v)) s.insetBorder = { w: note('box-shadow (border width)', value(inset[1], num(comp.replace(/rgba?\([^)]+\)/, '').trim().split(/\s+/).filter((x) => /px$/.test(x)).at(-1)))), color: note('box-shadow (border colour)', color) };
        } else rest.push(part);
      });
      if (rest.length) s.shadow = note('box-shadow', value(rest.join(', '), cs.boxShadow));
    }
    if (cs.backdropFilter && cs.backdropFilter !== 'none') s.backdrop = note('backdrop-filter', value(get(['backdrop-filter'], 'backdrop-filter').ex, cs.backdropFilter));
    if (cs.filter && cs.filter !== 'none') s.filter = note('filter', value(get(['filter'], 'filter').ex, cs.filter));
  }

  // children: elements, text nodes, and pseudo-elements that draw something
  const kids = [];
  const pseudo = (which) => {
    const pcs = win.getComputedStyle(el, `::${which}`);
    if (!pcs.content || pcs.content === 'none' || pcs.display === 'none') return;
    const p = { t: `::${which}`, c: '', pseudo: true, box: [pcs.left, pcs.top, pcs.width, pcs.height], pos: pcs.position };
    const d = (props) => { const x = cas.decl(el, props, which); return x ? cas.expand(el, x.value) : null; };
    if (pcs.backgroundColor !== 'rgba(0, 0, 0, 0)') p.bg = value(d(['background-color', 'background']), pcs.backgroundColor);
    if (pcs.borderTopLeftRadius !== '0px') p.radius = [value(d(['border-radius']), num(pcs.borderTopLeftRadius))];
    if (pcs.boxShadow !== 'none') p.shadow = value(d(['box-shadow']), pcs.boxShadow);
    if (pcs.opacity !== '1') p.opacity = { v: num(pcs.opacity) };
    if (pcs.content !== '""' && pcs.content !== 'normal') p.content = pcs.content;
    if (num(pcs.borderTopWidth)) p.border = [{ side: 'all', w: { v: num(pcs.borderTopWidth) }, color: value(d(['border-color', 'border']), pcs.borderTopColor) }];
    p.inset = [pcs.top, pcs.right, pcs.bottom, pcs.left];
    kids.push(p);
  };
  pseudo('before');
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      const raw = n.textContent.replace(/\s+/g, ' '); const text = raw.trim();
      if (!text) continue;
      const range = el.ownerDocument.createRange(); range.selectNodeContents(n); const tr = range.getBoundingClientRect();
      const box = [num(tr.left - rootRect.left), num(tr.top - rootRect.top), num(tr.width), num(tr.height)];
      // React renders `{price} ({rating} rating)` as several text nodes on one line: one text layer, not a stack
      const prev = kids.at(-1);
      if (prev && prev.t === '#text' && !prev.placeholder && Math.abs(prev.box[1] - box[1]) < 1) {
        const glue = /^\s/.test(raw) || prev.spaceAfter ? ' ' : '';
        prev.text += glue + text; prev.box = [prev.box[0], Math.min(prev.box[1], box[1]), num(box[0] + box[2] - prev.box[0]), Math.max(prev.box[3], box[3])];
        prev.spaceAfter = /\s$/.test(raw); continue;
      }
      kids.push({ t: '#text', text, box, spaceAfter: /\s$/.test(raw) });
    } else if (n.nodeType === 1) {
      const k = specFor(n, ctx, rootRect, s);
      // display: contents draws no box of its own — its children belong to this element
      if (k && k.disp === 'contents') { if (k.type && !s.type) s.type = k.type; kids.push(...(k.kids ?? [])); } else if (k) kids.push(k);
    }
  }
  if ((tag === 'input' || tag === 'textarea') && !kids.length) {
    const text = el.value || el.getAttribute('placeholder') || '';
    if (text) kids.push({ t: '#text', text, placeholder: !el.value, box: s.box });
    const ph = cas.decl(el, ['color'], 'placeholder');
    if (ph && !el.value) s.placeholderColor = note('::placeholder color', value(cas.expand(el, ph.value), win.getComputedStyle(el, '::placeholder').color));
  }
  pseudo('after');
  if (kids.length) s.kids = kids;

  // type — only where text is drawn
  if (kids.some((k) => k.t === '#text')) {
    const f = cas.inherited(el, ['font']);
    const font = f ? cas.expand(f.from, f.value) : null;
    const color = cas.inherited(el, ['color']);
    s.type = {
      style: note('font', value(font, `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`)),
      color: note('color', value(color ? cas.expand(color.from, color.value) : null, cs.color)),
      size: num(cs.fontSize), weight: cs.fontWeight, italic: cs.fontStyle === 'italic', family: cs.fontFamily,
      lh: cs.lineHeight === 'normal' ? 'normal' : num(cs.lineHeight), align: cs.textAlign,
    };
    if (cs.textDecorationLine !== 'none') s.type.decoration = cs.textDecorationLine;
    if (cs.textTransform !== 'none') s.type.transform = cs.textTransform;
    if (cs.letterSpacing !== 'normal') s.type.ls = cs.letterSpacing;
    if (cs.whiteSpace !== 'normal') s.type.ws = cs.whiteSpace;
    // anything that overrides one field of the text style (Figma cannot do that without detaching it)
    for (const p of ['font-size', 'font-weight', 'font-style', 'font-family']) {
      const o = cas.inherited(el, [p]); if (o && f && o.from !== f.from && o.from.contains(f.from) === false) s.type[`override:${p}`] = o.value;
    }
    const lh = cas.inherited(el, ['line-height']);
    if (lh) s.type.lhDeclared = cas.expand(lh.from, lh.value);
  }
  // state, as the DOM carries it
  const data = [...el.attributes].filter((a) => /^data-(disabled|selected|hovered|pressed|invalid|open|expanded|focus|orientation|placeholder)/.test(a.name) || a.name === 'role').map((a) => `${a.name}${a.value && a.value !== 'true' ? `=${a.value}` : ''}`);
  if (data.length) s.attrs = data;
  // The rest of a row. A flex child with no width of its own that reaches the row's end and wraps its text
  // (the content of a horizontal Card) is sized by what is left, so in Figma it fills.
  // In a column the same thing is a block as wide as the column, its text wrapping (the ProductInfoCard description).
  if (parent && parent.disp?.includes('flex') && !s.width && !s.inst && !s.grow && cs.flexGrow === '0' && s.pos !== 'absolute') {
    const row = (parent.dir ?? 'row').startsWith('row');
    const rowEnd = parent.box[0] + parent.box[2] - (parent.pad?.[1]?.v ?? 0), colStart = parent.box[0] + (parent.pad?.[3]?.v ?? 0);
    const wraps = [el, ...el.querySelectorAll('*')].some((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && x.getBoundingClientRect().height > parseFloat(win.getComputedStyle(x).fontSize) * 1.9);
    if (wraps && Math.abs(s.box[0] + s.box[2] - rowEnd) < 1 && (row || Math.abs(s.box[0] - colStart) < 1)) { if (row) s.grow = 1; else s.width = { v: `${s.box[2]}px`, raw: '100%' }; }
  }
  return s;
}

/**
 * @param {object} o
 * @param {string} o.id        story id, from /index.json
 * @param {string} [o.args]    Storybook URL args, e.g. "variant:neutral;size:small"
 * @param {string} [o.root]    selector of the element to mirror (default: first element of the story)
 * @param {string} [o.mutate]  JS run in the story before measuring, e.g. to set data-hovered. `doc` is the document.
 * @param {number} [o.width]   viewport width for the story frame (default 1280)
 * @param {string} [o.scheme]  not supported: SDS follows prefers-color-scheme only (see GAPS)
 */
export async function probe({ id = 'course-mirror--mirror', args, mirror, root, mutate, insts, width = 1280, wait = 400 }) {
  await load();
  let frame = document.getElementById('sds-probe');
  if (!frame) { frame = document.createElement('iframe'); frame.id = 'sds-probe'; frame.style.cssText = 'position:fixed;left:0;top:0;height:900px;z-index:99999;background:#fff;border:0'; document.body.appendChild(frame); }
  frame.style.width = `${width}px`;
  const url = `/iframe.html?id=${id}&viewMode=story${args ? `&args=${encodeURIComponent(args).replaceAll('%3A', ':').replaceAll('%3B', ';')}` : ''}${mirror ? `&mirror=${encodeURIComponent(JSON.stringify(mirror))}` : ''}`;
  if (mirror && !root) root = '#mirror-root > *';
  await new Promise((res) => { frame.onload = res; frame.src = url; });
  const doc = frame.contentDocument, win = frame.contentWindow;
  for (const t0 = performance.now(); performance.now() - t0 < 8000;) { if (doc.querySelector('#storybook-root > *')) break; await idle(50); }
  await doc.fonts.ready;
  if (mutate) new win.Function('doc', mutate)(doc);
  await idle(wait);
  const ctx = { win, cas: await makeCascade(doc), gaps: [], insts };
  // the first match that actually draws something (a component may start with a hidden label or input)
  let spec = null;
  for (const el of doc.querySelectorAll(root ?? '#storybook-root > *')) { ctx.gaps = []; spec = specFor(el, ctx, el.getBoundingClientRect(), null); if (spec) break; }
  if (!spec) throw new Error(`probe: nothing drawn for ${root ?? '#storybook-root > *'} in ${id}${mirror ? ` — ${JSON.stringify(mirror).slice(0, 120)}` : ''}`);
  const seen = new Set();
  const gaps = ctx.gaps.filter((g) => { const k = JSON.stringify(g); if (seen.has(k)) return false; seen.add(k); return true; });
  return { id, args: args ?? '', spec, gaps };
}

/**
 * Every variant of one component. `variants` is [{ props, mirror, root?, mutate? }];
 * returns [{ props, spec }] plus the gaps of all of them, de-duplicated.
 */
export async function probeVariants(variants, shared = {}) {
  const out = []; const gaps = new Map();
  for (const v of variants) {
    const r = await probe({ ...shared, ...v });
    out.push({ props: v.props, spec: r.spec });
    for (const g of r.gaps) gaps.set(JSON.stringify(g), g);
  }
  return { variants: out, gaps: [...gaps.values()] };
}

export function done() { document.getElementById('sds-probe')?.remove(); }

/**
 * Variants of one component are nearly identical, so only the first travels whole. The rest are
 * sent as { path: value } differences from it ("kids.0.ink.tok": …). The builder's unpack() undoes it.
 */
function flatten(o, prefix = '', out = {}) {
  if (o === null || typeof o !== 'object') { out[prefix] = o; return out; }
  if (Array.isArray(o)) out[`${prefix}#`] = o.length;
  for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
function diff(base, spec) {
  const a = flatten(base), b = flatten(spec);
  const set = {}, del = [];
  for (const [k, v] of Object.entries(b)) if (a[k] !== v) set[k] = v;
  for (const k of Object.keys(a)) if (!(k in b)) del.push(k);
  return { set, del };
}

/** Drop what the builder never reads, so a component's specs fit in one Figma call. */
function slim(s) {
  // a value that is exactly one token travels as its name; Figma looks the number or colour up itself
  const compact = (o) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') { const keys = Object.keys(v); if (keys.length === 2 && 'v' in v && typeof v.tok === 'string') o[k] = v.tok; else if (k !== 'kids') compact(v); } } };
  compact(s);
  if (s.pad && s.pad.every((x) => JSON.stringify(x) === JSON.stringify(s.pad[0]))) s.pad = [s.pad[0]];
  if (JSON.stringify(s.gapRow) === JSON.stringify(s.gapCol) && s.gapRow) { s.gap = s.gapRow; delete s.gapRow; delete s.gapCol; }
  if (s.pos === 'relative' || s.pos === 'static') delete s.pos;
  if (s.c) s.c = s.c.split(' ')[0];
  if (s.type) { for (const k of ['family', 'weight', 'italic', 'lhDeclared']) delete s.type[k]; if (s.type.align === 'start') delete s.type.align; }
  delete s.attrs; delete s.spaceAfter;
  if (s.ink) delete s.ink.raw;
  for (const k of s.kids ?? []) slim(k);
  return s;
}

/**
 * One component from figma/contracts.json: every combination of its props,
 * default first, each rendered through the mirror harness and measured.
 * Returns what the Figma builder's `component()` takes.
 */
export async function probeComponent(name) {
  const all = await (await fetch(`/figma/contracts.json?${Date.now()}`)).json();
  const c = all[name];
  if (!c) throw new Error(`probeComponent: no contract for ${name}`);
  // cartesian product, the FIRST prop varying fastest → it becomes the columns
  let combos = [{}];
  for (const [prop, values] of Object.entries(c.props ?? {})) combos = values.flatMap((v) => combos.map((rest) => ({ [prop]: v, ...rest })));
  combos = combos.map((x) => Object.fromEntries(Object.keys(c.props ?? {}).map((k) => [k, x[k]])));
  if (c.skip) combos = combos.filter((x) => !c.skip.some((rule) => Object.entries(rule).every(([k, v]) => x[k] === v)));
  const fill = (node, props) => {
    if (typeof node === 'string') return node.startsWith('$') && node.slice(1) in props ? String(props[node.slice(1)]) : node;
    const out = { ...node };
    if (node.p) {
      out.p = {};
      for (const [k, v] of Object.entries(node.p)) {
        if (k === '$props') { for (const pk of v === true ? Object.keys(props) : v) if (!(c.virtual ?? []).includes(pk)) out.p[pk] = props[pk]; }
        else if (typeof v === 'string' && v.startsWith('$') && v.slice(1) in props) out.p[k] = props[v.slice(1)];
        else if (v && typeof v === 'object' && '$map' in v) out.p[k] = v[String(props[v.$map])];
        else if (v && typeof v === 'object' && 'c' in v) out.p[k] = fill(v, props);
        else out.p[k] = v;
      }
    }
    if (node.when) { const ok = Object.entries(node.when).every(([k, v]) => props[k] === v); delete out.when; if (!ok) return null; }
    if (node.k) out.k = node.k.map((k) => fill(k, props)).filter((k) => k !== null);
    return out;
  };
  const items = []; const gaps = new Map();
  for (const props of combos) {
    const node = c.mirror ? fill(c.mirror, props) : null;
    const insts = { ...(c.insts ?? {}), ...(c.noSharedInsts ? {} : Object.fromEntries(Object.entries(all.$insts ?? {}).filter(([, h]) => h.set !== name))) };
    const r = c.story
      ? await probe({ id: c.story, args: Object.entries(props).map(([k, v]) => `${k}:${typeof v === 'boolean' ? `!${v}` : v}`).join(';'), root: c.root, mutate: c.mutate, wait: c.wait, insts, width: c.viewport })
      : await probe({ mirror: c.width ? { width: c.width, node } : node, root: c.root, mutate: c.mutate, wait: c.wait, insts });
    items.push({ props, spec: slim(r.spec) });
    for (const g of r.gaps) gaps.set(JSON.stringify(g), g);
  }
  const packed = items.map((it, i) => (i === 0 ? it : { props: it.props, d: diff(items[0].spec, it.spec) }));
  const { mirror, props, skip, virtual, width, root, mutate, wait, insts, story, viewport, noSharedInsts, ...rest } = c;
  // a contract with a width is drawn that wide; one without is as wide as its content
  return { def: { name, ...rest, rootW: width ? 'fixed' : 'hug', items: packed }, gaps: [...gaps.values()] };
}

/** A JS literal without double quotes, so it survives being copied out of a tool result unescaped. */
export function toJs(o) {
  if (o === null || o === undefined) return 'null';
  if (typeof o === 'string') return `'${o.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  if (typeof o !== 'object') return String(o);
  if (Array.isArray(o)) return `[${o.map(toJs).join(',')}]`;
  return `{${Object.entries(o).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : toJs(k)}:${toJs(v)}`).join(',')}}`;
}

/** The whole call for Figma, ready to paste into the Console MCP. */
export async function figmaCall(name) {
  const r = await probeComponent(name);
  return { code: `return await __sds.component(${toJs(r.def)});`, gaps: r.gaps };
}
