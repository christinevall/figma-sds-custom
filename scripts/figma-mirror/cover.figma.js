/**
 * The Cover page: Thumbnail, Overview and Tokens, built from the file's own variables and styles.
 *
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 * Runs inside Figma (Console MCP `figma_execute`). Paste this file once: it installs
 * `globalThis.__cover`. Then, one call each (each stays under the 30 s limit):
 *
 *   await __cover.overview({ components: 44, variables: 333, textStyles: 16, effectStyles: 15, icons: 287 })
 *   await __cover.tokens()
 *   await __cover.thumbnail({ components: 44, variables: 333, textStyles: 16 })   // last: it shows the other two
 *
 * Every colour, space, radius and text style is bound. Display sizes on the thumbnail are raw on purpose.
 */
globalThis.__cover = (() => {
  let V, TS, FX, colorCol, darkId, lightId;
  async function init() {
    await figma.loadAllPagesAsync();
    V = new Map((await figma.variables.getLocalVariablesAsync()).map((v) => [v.name, v]));
    TS = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
    FX = new Map((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
    colorCol = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Color');
    lightId = colorCol.modes.find((m) => m.name === 'Light').modeId; darkId = colorCol.modes.find((m) => m.name === 'Dark').modeId;
    for (const s of TS.values()) await figma.loadFontAsync({ family: s.fontName.family, style: s.fontName.style });
    for (const st of ['Regular', 'Medium', 'Semi Bold', 'Bold']) await figma.loadFontAsync({ family: 'Inter', style: st });
    let page = figma.root.children.find((p) => p.name === 'Cover');
    await figma.setCurrentPageAsync(page);
    return page;
  }
  const fill = (tok) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }, 'color', V.get(tok));
  const num = (n, field, tok) => { const v = V.get(tok); if (!v) throw new Error('no variable ' + tok); n.setBoundVariable(field, v); };
  const pad = (n, tok) => ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((f) => num(n, f, tok));
  const radius = (n, tok) => ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].forEach((f) => num(n, f, tok));

  function box(name, dir, o = {}) {
    const f = figma.createFrame(); f.name = name; f.fills = o.bg ? [fill(o.bg)] : []; f.layoutMode = dir === 'row' ? 'HORIZONTAL' : 'VERTICAL';
    f.clipsContent = false;
    if (o.gap) num(f, 'itemSpacing', o.gap);
    if (o.pad) pad(f, o.pad);
    if (o.radius) radius(f, o.radius);
    if (o.border) { f.strokes = [fill(o.border)]; f.strokeAlign = 'INSIDE'; num(f, 'strokeWeight', 'size/stroke/border'); }
    if (o.wrap) { f.layoutWrap = 'WRAP'; if (o.gap) num(f, 'counterAxisSpacing', o.gap); }
    if (o.align) f.counterAxisAlignItems = o.align;
    if (o.justify) f.primaryAxisAlignItems = o.justify;
    if (o.parent) { o.parent.appendChild(f); if (o.fill !== false && o.parent.layoutMode !== 'NONE') f.layoutSizingHorizontal = o.hug ? 'HUG' : 'FILL'; }
    if (o.w) { f.resize(o.w, f.height); f.layoutSizingHorizontal = 'FIXED'; }
    f.layoutSizingVertical = 'HUG';
    return f;
  }
  async function text(parent, chars, style, color = 'color/text/default/default', o = {}) {
    const t = figma.createText(); const st = TS.get(style);
    t.fontName = { family: st.fontName.family, style: st.fontName.style }; t.characters = chars; await t.setTextStyleIdAsync(st.id);
    t.fills = [fill(color)]; parent.appendChild(t);
    if (o.hug || parent.layoutMode === 'HORIZONTAL' && !o.fill) t.textAutoResize = 'WIDTH_AND_HEIGHT'; else { t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; }
    if (o.upper) { t.textCase = 'UPPER'; t.letterSpacing = { unit: 'PERCENT', value: 8 }; }
    if (o.link) t.hyperlink = { type: 'URL', value: o.link };
    if (o.name) t.name = o.name;
    return t;
  }
  function sheet(name, x) {
    const page = figma.currentPage; page.findOne((n) => n.name === name && n.parent === page)?.remove();
    const f = box(name, 'col', { bg: 'color/background/default/secondary' }); page.appendChild(f);
    f.resize(1600, 100); f.layoutSizingHorizontal = 'FIXED'; f.x = x; f.y = 0; f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 120; f.itemSpacing = 112;
    return f;
  }
  async function section(parent, title, intro) {
    const s = box(`Section/${title}`, 'col', { parent, gap: 'size/space/800' });
    const head = box('Heading', 'col', { parent: s, gap: 'size/space/200' });
    await text(head, title, 'font/title-page'); if (intro) await text(head, intro, 'font/subheading', 'color/text/default/secondary');
    return s;
  }
  async function card(parent, eyebrow, title, body, o = {}) {
    const c = box(`Card/${title}`, 'col', { parent, bg: 'color/background/default/default', border: 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/600', gap: 'size/space/200', ...o });
    if (eyebrow) await text(c, eyebrow, 'font/body-code', 'color/text/default/tertiary', { upper: true });
    await text(c, title, 'font/heading');
    if (body) await text(c, body, 'font/body-base', 'color/text/default/secondary');
    return c;
  }
  const grid = (parent, name) => box(name, 'row', { parent, gap: 'size/space/600', wrap: true });
  const third = (n) => { n.layoutSizingHorizontal = 'FIXED'; n.resize((1360 - 48) / 3, n.height); n.layoutSizingVertical = 'HUG'; };
  const half = (n) => { n.layoutSizingHorizontal = 'FIXED'; n.resize((1360 - 24) / 2, n.height); n.layoutSizingVertical = 'HUG'; };

  // ------------------------------------------------------------------ Overview
  async function overview(n) {
    await init();
    const f = sheet('Overview', 2040);
    const head = box('Header', 'col', { parent: f, gap: 'size/space/600' });
    await text(head, `Figma SDS · mirrored from code · ${n.components} components`, 'font/body-code', 'color/text/default/secondary', { upper: true });
    await text(head, 'Simple Design System, code first', 'font/title-hero');
    await text(head, 'Figma’s Simple Design System, exactly as Figma publishes the code. This file was empty: its variables, styles, icons and components were generated from that code, so every name here is a name in the repository.', 'font/subtitle', 'color/text/default/secondary');
    const links = grid(head, 'Links');
    for (const [eye, t, sub, url] of [['Live docs', 'Storybook ↗', 'localhost:6004 · npx storybook dev -p 6004', null], ['Upstream code', 'github.com/figma/sds ↗', 'MIT, by Figma. Not one of their files is edited here.', 'https://github.com/figma/sds'], ['Figma Community', 'Link coming soon', 'This file, once it is published', null]]) {
      const c = await card(links, eye, t, sub); third(c); if (url) c.findAll((x) => x.type === 'TEXT')[1].hyperlink = { type: 'URL', value: url };
    }
    const glance = box('At a glance', 'row', { parent: f, gap: 'size/space/600', wrap: true });
    for (const [k, v] of [['components', n.components], ['icons', n.icons], ['variables', n.variables], ['text styles', n.textStyles], ['effect styles', n.effectStyles], ['colour modes', 2]]) {
      const c = box(`Stat/${k}`, 'col', { parent: glance, bg: 'color/background/default/default', border: 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/600', gap: 'size/space/100' });
      c.layoutSizingHorizontal = 'FIXED'; c.resize((1360 - 24 * 5) / 6, 10); c.layoutSizingVertical = 'HUG';
      await text(c, String(v), 'font/title-page'); await text(c, k, 'font/body-base', 'color/text/default/secondary');
    }
    const start = await section(f, 'Start here', 'Same system, two ways in.');
    const sg = grid(start, 'Two ways in');
    const lists = {
      'For designers': ['Use the components in this library. Their properties are the code’s props: variant=primary, size=medium, isDisabled=false.', 'Pick colours by role, not by hue: background, text, icon, border. Then the role, then the variant.', 'Set a frame’s Color mode to Dark and every colour follows. The names stay the same.', 'Don’t edit this file by hand. It is generated from the code, so ask for the change in code.', 'Where Figma cannot do what the code does, each component page says so. The full list is figma/GAPS.md.'],
      'For developers': ['npm ci, then npx storybook dev -p 6004. Getting started and Foundations are the course’s pages, the rest is Figma’s.', 'src/theme.css is the token source here. Components read tokens through local custom properties.', 'git fetch upstream, git merge upstream/main: the course only added new files, so their updates merge cleanly.', 'node scripts/figma-mirror/check-upstream.mjs lists which tokens, icons and components changed since this file was built.', 'The figma-mirror skill in .claude/skills rebuilds exactly those.'],
    };
    for (const [title, items] of Object.entries(lists)) {
      const c = await card(sg, title === 'For designers' ? 'Design' : 'Dev', title, null); half(c); num(c, 'itemSpacing', 'size/space/400');
      for (const [i, line] of items.entries()) { const r = box(`Step ${i + 1}`, 'row', { parent: c, gap: 'size/space/400' }); await text(r, String(i + 1).padStart(2, '0'), 'font/body-code', 'color/text/default/tertiary', { hug: true }); await text(r, line, 'font/body-base', 'color/text/default/default', { fill: true }); }
    }
    const stack = await section(f, 'The stack', 'What Figma chose for SDS. Nothing was swapped.');
    const stg = grid(stack, 'Stack');
    for (const [ver, t, body] of [['1.10', 'React Aria Components', 'Adobe’s unstyled, accessible primitives: behaviour, keyboard and ARIA. States arrive as data attributes.'], ['18 · 5', 'React + TypeScript', 'The components, fully typed.'], ['6', 'Vite', 'Build and dev server.'], ['Custom properties', 'Plain CSS', 'One stylesheet per component, nested rules, every value a token routed through a local variable.'], ['Figma → CSS', 'Token script', 'Upstream pulls variables out of their Figma file into theme.css. Here theme.css is the source and Figma follows.'], ['8.6', 'Storybook', 'Figma’s stories, plus Getting started and Foundations from the course. Port 6004.']]) { const c = await card(stg, ver, t, body); third(c); }
    const sync = await section(f, 'How it stays in sync', 'One source, two outputs. Code is the source. Figma follows.');
    const flow = box('Flow', 'row', { parent: sync, gap: 'size/space/400', align: 'CENTER', wrap: true });
    const chip = async (eye, t, sub, strong) => { const c = box(`Step/${t}`, 'col', { parent: flow, hug: true, bg: strong ? 'color/background/brand/tertiary' : 'color/background/default/default', border: strong ? 'color/border/brand/default' : 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/400', gap: 'size/space/100' }); if (eye) await text(c, eye, 'font/body-code', 'color/text/default/tertiary', { upper: true, hug: true }); await text(c, t, 'font/body-strong', 'color/text/default/default', { hug: true }); if (sub) await text(c, sub, 'font/body-small', 'color/text/default/secondary', { hug: true }); return c; };
    const arrow = async () => text(flow, '→', 'font/heading', 'color/text/default/tertiary', { hug: true });
    await chip('Source of truth', 'src/theme.css + src/ui', 'Figma’s code, untouched', true); await arrow();
    await chip('Browser', 'The probe', 'measures each rendered variant, follows every value to its token'); await arrow();
    await chip('Figma', 'The builder', 'draws it with the variables bound, checks the size'); await arrow();
    await chip(null, 'This library', 'components, icons, variables, styles');
    const note = box('Check', 'row', { parent: sync, hug: true, bg: 'color/background/positive/tertiary', radius: 'size/radius/200', pad: 'size/space/400', gap: 'size/space/200' });
    await text(note, '✓  check-upstream.mjs compares the code with the snapshot taken when this file was built, and names what changed.', 'font/body-base', 'color/text/positive/default', { hug: true });
    const tiers = await section(f, 'Two token tiers', 'A primitive says what a value is. A semantic token says what it is for. Only the second survives a rebrand.');
    const tg = grid(tiers, 'Tiers');
    for (const [eye, t, body, tok, code] of [['Tier 1 · primitives', 'What a value is', 'Ramps from 100 to 1000, the type scale, the weights. Hidden from the pickers: components never use them directly.', 'color/brand/800', '--sds-color-brand-800'], ['Tier 2 · semantic', 'What a value is for', 'background, text, icon, border, then the role, then the variant. Each points at a primitive, once for Light and once for Dark.', 'color/background/brand/default', '--sds-color-background-brand-default']]) {
      const c = await card(tg, eye, t, body); half(c);
      const ex = box('Example', 'row', { parent: c, bg: 'color/background/default/secondary', radius: 'size/radius/200', pad: 'size/space/300', gap: 'size/space/300', align: 'CENTER' });
      const sw = figma.createRectangle(); sw.resize(40, 40); sw.fills = [fill(tok)]; radius(sw, 'size/radius/100'); ex.appendChild(sw);
      if (tok.includes('background')) { const d = figma.createFrame(); d.resize(40, 40); d.fills = [fill(tok)]; radius(d, 'size/radius/100'); d.setExplicitVariableModeForCollection(colorCol, darkId); d.strokes = [fill('color/border/default/default')]; d.strokeWeight = 1; d.name = 'Dark'; ex.appendChild(d); }
      const lab = box('Label', 'col', { parent: ex }); await text(lab, code, 'font/body-code'); await text(lab, tok.includes('background') ? 'Light · Dark' : 'one fixed value', 'font/body-small', 'color/text/default/secondary');
    }
    const order = await section(f, 'Read it in this order', 'The same order in Storybook and in this file.');
    const og = grid(order, 'Order');
    for (const [i, t, body] of [['01', 'Foundations', 'Colour, typography, size and effects. The decisions everything else inherits. Switch a frame to Dark while you look.'], ['02', 'Primitives', 'Button to Tooltip. Each page starts with its contract: the props, their values, the default, and what Figma cannot do.'], ['03', 'Compositions', 'Cards and forms built from the primitives, as real instances. This is where a system shows whether it holds together.']]) { const c = await card(og, i, t, body); third(c); }
    const repo = await section(f, 'Repository', 'Figma’s files, and the few the course added (marked ＋).');
    const tree = box('Tree', 'col', { parent: repo, bg: 'color/background/default/default', border: 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/600' });
    await text(tree, ['04-figma-sds/', '├── src/theme.css              tokens, generated by Figma’s script — the source here', '├── src/ui/primitives/         28 component folders, React Aria + plain CSS', '├── src/ui/compositions/       cards, forms, headers, footers, sections', '├── src/ui/icons/              287 icons', '├── src/stories/               Figma’s stories', '├── src/stories/_course/     ＋ Getting started, Foundations, the Mirror harness', '├── src/figma/                 Figma’s Code Connect files (they point at Figma’s own file)', '├── scripts/figma-mirror/    ＋ tokens, icons, probe, builder, cover, upstream check', '├── figma/                   ＋ contracts.json, GAPS.md, manifest.json', '├── docs/decisions.md        ＋ decisions and why', '└── COURSE-NOTES.md          ＋ what was added, and how updates come in'].join('\n'), 'font/body-code');
    const foot = box('Footer', 'row', { parent: f, justify: 'SPACE_BETWEEN' });
    await text(foot, 'Generated from github.com/figma/sds · code is the source, this file follows', 'font/body-small', 'color/text/default/secondary', { hug: true });
    await text(foot, 'SDS is MIT, © Figma', 'font/body-small', 'color/text/default/secondary', { hug: true });
    return { id: f.id, h: f.height };
  }

  // ------------------------------------------------------------------ Tokens
  async function tokensHead() {
    await init();
    const f = sheet('Tokens', 3760);
    const head = box('Header', 'col', { parent: f, gap: 'size/space/600' });
    await text(head, `Tokens · ${V.size} variables`, 'font/body-code', 'color/text/default/secondary', { upper: true });
    await text(head, 'Tokens at a glance', 'font/title-hero');
    await text(head, 'Every variable and style in this file, grouped the way the code groups them. Each swatch is bound to its variable, so this page cannot show a stale value.', 'font/subtitle', 'color/text/default/secondary');
    return { id: f.id };
  }
  async function tokensSemantic(category) {
    await init();
    const f = figma.currentPage.findOne((n) => n.name === 'Tokens' && n.parent === figma.currentPage);
    let sec = f.findOne((n) => n.name === 'Section/Colour · semantic');
    if (!sec) sec = await section(f, 'Colour · semantic', 'What components use. Four groups: background, text, icon, border. Left half Light, right half Dark.');
    let g = sec.findOne((n) => n.name === 'Groups'); if (!g) g = grid(sec, 'Groups');
    const names = [...V.keys()].filter((k) => k.startsWith(`color/${category}/`));
    const c = box(`Group/${category}`, 'col', { parent: g, bg: 'color/background/default/default', border: 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/600', gap: 'size/space/200' }); half(c);
    await text(c, `${category} · ${names.length}`, 'font/body-strong'); await text(c, `--sds-color-${category}-*`, 'font/body-code', 'color/text/default/tertiary');
    const cols = box('Swatches', 'row', { parent: c, gap: 'size/space/400', wrap: true });
    for (const name of names) {
      const r = box(name, 'row', { parent: cols, gap: 'size/space/200', align: 'CENTER' }); r.layoutSizingHorizontal = 'FIXED'; r.resize(290, 10); r.layoutSizingVertical = 'HUG';
      const sw = box('swatch', 'row', { parent: r, hug: true, radius: 'size/radius/100' }); sw.clipsContent = true; sw.strokes = [fill('color/border/default/default')]; sw.strokeWeight = 1; sw.strokeAlign = 'OUTSIDE';
      for (const mode of [lightId, darkId]) { const h = figma.createFrame(); h.resize(16, 24); h.fills = [fill(name)]; h.setExplicitVariableModeForCollection(colorCol, mode); h.name = mode === lightId ? 'Light' : 'Dark'; sw.appendChild(h); }
      await text(r, name.replace(`color/${category}/`, ''), 'font/body-code', 'color/text/default/default', { fill: true });
    }
    return { category, n: names.length };
  }
  async function tokensPrimitives() {
    await init();
    const f = figma.currentPage.findOne((n) => n.name === 'Tokens' && n.parent === figma.currentPage);
    const sec = await section(f, 'Colour · primitives', 'The raw ramps behind the semantic layer. white and black are one colour at ten opacities. brand ships with the values of gray: that is the slot to rebrand.');
    const c = box('Ramps', 'col', { parent: sec, bg: 'color/background/default/default', border: 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/600', gap: 'size/space/300' });
    for (const ramp of ['white', 'black', 'gray', 'slate', 'brand', 'red', 'yellow', 'green', 'pink']) {
      const r = box(`Ramp/${ramp}`, 'row', { parent: c, gap: 'size/space/400', align: 'CENTER' });
      const l = await text(r, ramp, 'font/body-code', 'color/text/default/default', { hug: true }); l.textAutoResize = 'HEIGHT'; l.resize(96, l.height);
      const strip = box('steps', 'row', { parent: r, radius: 'size/radius/200', bg: ramp === 'white' ? 'color/background/neutral/default' : null }); strip.clipsContent = true; strip.strokes = [fill('color/border/default/default')]; strip.strokeWeight = 1; strip.strokeAlign = 'OUTSIDE';
      for (const step of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
        const s = box(String(step), 'col', { parent: strip, bg: `color/${ramp}/${step}`, pad: 'size/space/200', justify: 'MAX' }); s.layoutSizingVertical = 'FIXED'; s.resize(s.width, 64);
        const dark = (ramp === 'white') || (ramp === 'black' ? step >= 500 : step >= 500);
        await text(s, String(step), 'font/body-code', ramp === 'white' ? 'color/white/1000' : dark ? 'color/white/1000' : 'color/black/1000');
      }
    }
    return { ok: true };
  }
  async function tokensType() {
    await init();
    const f = figma.currentPage.findOne((n) => n.name === 'Tokens' && n.parent === figma.currentPage);
    const sec = await section(f, 'Typography', `${TS.size} text styles. Family, size and weight are bound to variables. Line height is Auto unless a component sets its own: the code’s font tokens carry none.`);
    const c = box('Styles', 'col', { parent: sec, bg: 'color/background/default/default', border: 'color/border/default/default', radius: 'size/radius/200', pad: 'size/space/600' });
    for (const st of TS.values()) {
      const r = box(st.name, 'row', { parent: c, gap: 'size/space/600', align: 'CENTER' }); r.paddingTop = r.paddingBottom = 12; num(r, 'paddingTop', 'size/space/300'); num(r, 'paddingBottom', 'size/space/300');
      r.strokes = [fill('color/border/default/default')]; r.strokeTopWeight = 0; r.strokeLeftWeight = 0; r.strokeRightWeight = 0; r.strokeBottomWeight = 1;
      const l = await text(r, st.name, 'font/body-code', 'color/text/default/default', { hug: true }); l.textAutoResize = 'HEIGHT'; l.resize(360, l.height);
      const sample = await text(r, 'The quick brown fox', st.name, 'color/text/default/default', { fill: true }); sample.textTruncation = 'ENDING'; sample.maxLines = 1;
      const lh = st.lineHeight.unit === 'AUTO' ? 'Auto' : `${st.lineHeight.value}%`;
      const m = await text(r, `${st.fontSize} · ${st.fontName.style} · ${lh}`, 'font/body-code', 'color/text/default/secondary', { hug: true }); m.textAutoResize = 'HEIGHT'; m.resize(260, m.height);
    }
    return { ok: true };
  }
  async function tokensSize() {
    await init();
    const f = figma.currentPage.findOne((n) => n.name === 'Tokens' && n.parent === figma.currentPage);
    const sec = await section(f, 'Size and effects', 'One collection holds every number: space, radius, stroke, icon, and the depth and blur values the shadows are built from.');
    const g = grid(sec, 'Groups');
    const space = await card(g, 'size/space', 'Space', null); half(space);
    for (const name of [...V.keys()].filter((k) => k.startsWith('size/space/') && !k.includes('negative'))) {
      const r = box(name, 'row', { parent: space, gap: 'size/space/400', align: 'CENTER' });
      const l = await text(r, `${name.replace('size/space/', '')}`, 'font/body-code', 'color/text/default/default', { hug: true }); l.textAutoResize = 'HEIGHT'; l.resize(64, l.height);
      const bar = figma.createRectangle(); bar.resize(Math.max(Object.values(V.get(name).valuesByMode)[0], 1), 12); bar.fills = [fill('color/background/brand/default')]; r.appendChild(bar); if (Object.values(V.get(name).valuesByMode)[0] > 0) bar.setBoundVariable('width', V.get(name));
      await text(r, `${Object.values(V.get(name).valuesByMode)[0]}px`, 'font/body-code', 'color/text/default/tertiary', { hug: true });
    }
    const shape = await card(g, 'size/radius · size/stroke · size/icon', 'Shape', null); half(shape);
    const rr = box('Radius', 'row', { parent: shape, gap: 'size/space/600', wrap: true });
    for (const name of [...V.keys()].filter((k) => k.startsWith('size/radius/'))) { const col = box(name, 'col', { parent: rr, hug: true, gap: 'size/space/200' }); const sq = figma.createFrame(); sq.resize(96, 64); sq.fills = [fill('color/background/default/secondary')]; sq.strokes = [fill('color/border/default/default')]; sq.strokeWeight = 1; radius(sq, name); col.appendChild(sq); await text(col, name.replace('size/', ''), 'font/body-code', 'color/text/default/default', { hug: true }); }
    await text(shape, 'stroke/border 1 · stroke/focus-ring 2 · icon/small 24 · icon/medium 32 · icon/large 40', 'font/body-code', 'color/text/default/secondary');
    const fx = await card(sec, 'effects/shadows', 'Shadows', 'Each one is an effect style. Its offsets, blur, spread and colour are all bound to variables, as in code.');
    const fr = box('Shadows', 'row', { parent: fx, gap: 'size/space/800', wrap: true }); fr.paddingTop = 16; fr.paddingBottom = 16;
    for (const st of FX.values()) { if (!st.name.includes('shadow')) continue; const col = box(st.name, 'col', { parent: fr, hug: true, gap: 'size/space/400' }); const sq = figma.createFrame(); sq.resize(120, 80); sq.fills = [fill('color/background/default/default')]; radius(sq, 'size/radius/200'); await sq.setEffectStyleIdAsync(st.id); col.appendChild(sq); await text(col, st.name.replace('effects/shadows/', ''), 'font/body-code', 'color/text/default/default', { hug: true }); }
    return { ok: true };
  }

  // ------------------------------------------------------------------ Thumbnail
  async function thumbnail(n) {
    const page = await init();
    page.findOne((x) => x.name === 'Thumbnail' && x.parent === page)?.remove();
    const f = figma.createFrame(); f.name = 'Thumbnail'; f.resize(1920, 1080); f.x = 0; f.y = 0; page.insertChild(0, f); f.clipsContent = true;
    f.setExplicitVariableModeForCollection(colorCol, darkId); f.fills = [fill('color/background/default/default')];
    const glow = figma.createEllipse(); glow.name = 'Glow'; glow.resize(1100, 800); glow.x = 900; glow.y = 420; glow.fills = [fill('color/background/neutral/default')]; glow.opacity = 0.35; glow.effects = [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: 240, visible: true }]; f.appendChild(glow);
    const raw = async (chars, size, style, color, x, y, w) => { const t = figma.createText(); t.fontName = { family: 'Inter', style }; t.characters = chars; t.fontSize = size; t.fills = [fill(color)]; f.appendChild(t); t.x = x; t.y = y; if (w) { t.textAutoResize = 'HEIGHT'; t.resize(w, t.height); } return t; };
    const dot = figma.createEllipse(); dot.resize(14, 14); dot.x = 120; dot.y = 127; dot.fills = [fill('color/background/positive/default')]; f.appendChild(dot);
    const eyebrow = await raw('REACT ARIA  ·  REACT 18  ·  STORYBOOK 8  ·  FIGMA', 20, 'Medium', 'color/text/default/secondary', 150, 121); eyebrow.letterSpacing = { unit: 'PERCENT', value: 12 };
    const title = await raw('Simple Design\nSystem, code first', 104, 'Semi Bold', 'color/text/default/default', 112, 250, 1000); title.lineHeight = { unit: 'PERCENT', value: 108 }; title.letterSpacing = { unit: 'PERCENT', value: -2 };
    await raw('Figma’s SDS, rebuilt from its code.\nEvery name in this file is a name in the repository.', 36, 'Regular', 'color/text/default/secondary', 118, 520, 900);
    const chip = box('By moonlearning.io', 'row', { bg: 'color/background/default/secondary', border: 'color/border/default/default', radius: 'size/radius/full', gap: 'size/space/300', align: 'CENTER' }); f.appendChild(chip); chip.x = 120; chip.y = 690; chip.paddingLeft = chip.paddingRight = 28; chip.paddingTop = chip.paddingBottom = 16; chip.layoutSizingHorizontal = 'HUG';
    const cd = figma.createEllipse(); cd.resize(10, 10); cd.fills = [fill('color/background/positive/default')]; chip.appendChild(cd);
    const ct = figma.createText(); ct.fontName = { family: 'Inter', style: 'Regular' }; ct.characters = 'A free playground by moonlearning.io ↗'; ct.fontSize = 26; ct.fills = [fill('color/text/default/default')]; ct.setRangeFontName(21, 36, { family: 'Inter', style: 'Semi Bold' }); ct.hyperlink = { type: 'URL', value: 'https://moonlearning.io' }; chip.appendChild(ct);
    let x = 120; for (const [v, k] of [[n.components, 'components'], [n.variables, 'variables'], [n.textStyles, 'text styles'], [2, 'colour modes']]) { await raw(String(v), 64, 'Semi Bold', 'color/text/default/default', x, 860); await raw(k, 20, 'Regular', 'color/text/default/secondary', x + 2, 946); x += 230; }
    // the other two sheets, as pictures
    for (const [name, px, py, pw] of [['Tokens', 1136, 68, 684], ['Overview', 1367, 250, 655]]) {
      const src = page.findOne((z) => z.name === name && z.parent === page); if (!src) continue;
      const bytes = await src.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: pw * 2 } });
      const img = figma.createImage(bytes); const r = figma.createRectangle(); r.name = `${name} (picture)`; r.resize(pw, Math.round(pw * src.height / src.width)); r.x = px; r.y = py; r.cornerRadius = 12;
      r.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }]; const fxs = FX.get('effects/shadows/drop-shadow-600'); if (fxs) await r.setEffectStyleIdAsync(fxs.id); f.appendChild(r);
    }
    await figma.setFileThumbnailNodeAsync(f);
    return { id: f.id };
  }
  return { overview, tokensHead, tokensSemantic, tokensPrimitives, tokensType, tokensSize, thumbnail };
})();
return 'cover installed';
