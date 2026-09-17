/**
 * The builder: a probe spec → Figma layers with every value bound.
 *
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 * Runs inside Figma (Console MCP `figma_execute`, or any plugin console).
 * Paste this file once per session: it installs `globalThis.__sds`, and the
 * calls after that stay small:
 *
 *   await __sds.init()
 *   const { id, report } = await __sds.build(spec, { page: 'Button', x: 0, y: 0 })
 *   await __sds.variants('Button', [{ props: { variant: 'primary', size: 'medium' }, id }], {...})
 *
 * `report` is the audit: every value that stayed raw, and every layer whose
 * size differs from the browser's by more than a pixel. Fix, do not explain away.
 */
globalThis.__sds = (() => {
  const S = { vars: new Map(), text: new Map(), effects: new Map(), icons: new Map() };
  // Every step lives on F, so one step can be replaced from the console without pasting the file again:
  //   __sds.F.sizeChild = function (n, k, parent, row, stretch) { … }   (helpers are on __sds.H)
  const F = {};

  async function init() {
    await figma.loadAllPagesAsync();
    S.vars = new Map((await figma.variables.getLocalVariablesAsync()).map((v) => [v.name, v]));
    S.text = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
    S.effects = new Map((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
    const iconPage = figma.root.children.find((p) => p.name === 'Icons');
    S.icons = new Map(iconPage.findAllWithCriteria({ types: ['COMPONENT'] }).map((c) => [c.name, c]));
    refreshSets();
    return { vars: S.vars.size, text: S.text.size, effects: S.effects.size, icons: S.icons.size };
  }

  /** The library's own components, by name — so a Card can hold a real Button instance. */
  function refreshSets() {
    S.sets = new Map();
    for (const page of figma.root.children) {
      if (page.name === 'Icons' || page.name === 'Cover') continue;
      for (const n of page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) {
        if (n.type === 'COMPONENT' && n.parent.type === 'COMPONENT_SET') continue;
        S.sets.set(n.name, n);
      }
    }
  }

  // A style's fontName carries variationSettings; loadFontAsync hangs on some of those (Inter Italic),
  // so always load by family and style only.
  const loadFont = (fn) => figma.loadFontAsync({ family: fn.family, style: fn.style });

  // ------------------------------------------------------------ values
  const rgba = (str) => {
    if (!str) return null;
    if (str.startsWith('#')) { const c = str.slice(1); const n = (i) => parseInt(c.slice(i, i + 2), 16) / 255; return { r: n(0), g: n(2), b: n(4), a: c.length === 8 ? n(6) : 1 }; }
    const m = str.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] === undefined ? 1 : p[3] };
  };
  const paint = (val, rep, where) => {
    const c = rgba(val.v); if (!c) { rep.raw.push(`${where}: unreadable colour ${val.v}`); return null; }
    let p = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
    const v = val.tok && S.vars.get(val.tok);
    if (v) p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b } }, 'color', v);
    else rep.raw.push(`${where}: ${val.raw ?? val.missing ?? val.v}`);
    return p;
  };
  const bindNum = (node, field, val, rep, where) => {
    const v = val.tok && S.vars.get(val.tok);
    if (v) node.setBoundVariable(field, v);
    else if (val.v) rep.raw.push(`${where}: ${val.raw ?? val.v}`);
  };
  const mark = (node, field) => { const cur = node.getSharedPluginData('sds', 'raw'); node.setSharedPluginData('sds', 'raw', cur ? `${cur},${field}` : field); };

  // ------------------------------------------------------------ layers
  const layerName = (s) => s.name ?? (s.c ? s.c.split(' ')[0] : s.t);
  const isRowish = (s) => s.disp?.includes('flex') && (s.dir ?? 'row').startsWith('row');
  const ALIGN = { 'flex-start': 'MIN', start: 'MIN', normal: 'MIN', stretch: 'MIN', left: 'MIN', center: 'CENTER', 'flex-end': 'MAX', end: 'MAX', right: 'MAX', 'space-between': 'SPACE_BETWEEN', baseline: 'BASELINE' };

  F.textNode = async function (t, owner, rep) {
    const n = figma.createText();
    const ty = owner.type;
    n.name = t.name ?? 'text';
    const want = ty.style.tok;
    let style = want && S.text.get(want);
    const ratio = ty.lh === 'normal' ? 'normal' : Math.round((ty.lh / ty.size) * 100) / 100;
    const lhOf = (st) => (st.lineHeight.unit === 'AUTO' ? 'normal' : st.lineHeight.unit === 'PERCENT' ? st.lineHeight.value / 100 : st.lineHeight.value / st.fontSize);
    // the single-line twin carries line-height: 1 where one exists
    if (style && ratio === 1 && lhOf(style) !== 1) { const single = S.text.get(want.replace('font/', 'font/single-line/')); if (single) style = single; }
    if (style) {
      await loadFont(style.fontName);
      n.fontName = { family: style.fontName.family, style: style.fontName.style };
      n.characters = t.text;
      if (lhOf(style) === ratio) await n.setTextStyleIdAsync(style.id);
      else {
        // One field differs from the style (line height). Figma cannot override one field of a
        // text style, so bind the style's own variables one by one and keep the line height raw.
        n.fontSize = style.fontSize;
        for (const [field, alias] of Object.entries(style.boundVariables ?? {})) { const v = await figma.variables.getVariableByIdAsync(alias.id); if (v) n.setBoundVariable(field, v); }
        n.lineHeight = ratio === 'normal' ? { unit: 'AUTO' } : { unit: 'PERCENT', value: ratio * 100 };
        n.textDecoration = style.textDecoration;
        mark(n, 'textStyle'); n.setSharedPluginData('sds', 'textStyle', style.name);
        rep.type.push(`${n.name}: ${style.name} at line-height ${ratio} (the style has ${lhOf(style)}) — fields bound one by one`);
      }
    } else {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      n.characters = t.text; n.fontSize = ty.size;
      rep.raw.push(`${n.name}: no text style for ${ty.style.raw ?? ty.style.missing ?? ty.style.v}`);
    }
    if (ty.decoration?.includes('underline') && n.textDecoration !== 'UNDERLINE') n.textDecoration = 'UNDERLINE';
    if (ty.transform === 'uppercase') n.textCase = 'UPPER';
    n.textAlignHorizontal = { center: 'CENTER', right: 'RIGHT', end: 'RIGHT' }[ty.align] ?? 'LEFT';
    const p = paint(t.placeholder && owner.placeholderColor ? owner.placeholderColor : ty.color, rep, `${n.name} colour`);
    if (p) n.fills = [p];
    return n;
  }

  F.iconNode = async function (s, rep) {
    const comp = S.icons.get(s.icon);
    if (!comp) { rep.raw.push(`icon ${s.icon} is not in the Icons page`); return null; }
    const inst = comp.createInstance();
    inst.name = s.name ?? s.icon;
    const size = typeof s.size.v === 'number' ? s.size.v : parseFloat(s.size.v);
    inst.resize(size, size);
    const sv = s.size.tok && S.vars.get(s.size.tok);
    if (sv) { inst.setBoundVariable('width', sv); inst.setBoundVariable('height', sv); }
    if (s.ink.tok !== 'color/icon/brand/default') {
      const vec = inst.findOne((n) => n.type === 'VECTOR');
      const p = paint(s.ink, rep, `${inst.name} colour`);
      if (vec && p) vec.strokes = [p];
    }
    return inst;
  }

  /** `inst: { set, props }` — an instance of a component this library already has, with its properties set. */
  F.instanceNode = function (s, rep) {
    let set = S.sets.get(s.inst.set); if (!set) { refreshSets(); set = S.sets.get(s.inst.set); }
    if (!set) { rep.raw.push(`${s.inst.set} is not in the library yet — drawn as plain layers`); return null; }
    const props = s.inst.props ?? {};
    let comp = set;
    if (set.type === 'COMPONENT_SET') {
      const wanted = { ...(set.defaultVariant.variantProperties ?? {}) };
      for (const [k, v] of Object.entries(props)) if (k in wanted) wanted[k] = String(v);
      comp = set.children.find((c) => Object.entries(wanted).every(([k, v]) => c.variantProperties[k] === v));
      if (!comp) { rep.raw.push(`${s.inst.set}: no variant ${JSON.stringify(wanted)}`); comp = set.defaultVariant; }
    }
    const inst = comp.createInstance();
    inst.name = s.name ?? s.inst.set;
    const full = {};
    for (const key of Object.keys(inst.componentProperties)) {
      const base = key.split('#')[0]; const def = inst.componentProperties[key];
      if (!(base in props) || def.type === 'VARIANT') continue;
      if (def.type === 'INSTANCE_SWAP') { const ic = S.icons.get(props[base]); if (ic) full[key] = ic.id; }
      else full[key] = def.type === 'BOOLEAN' ? !!props[base] : String(props[base]);
    }
    if (Object.keys(full).length) inst.setProperties(full);
    inst.setSharedPluginData('sds', 'box', JSON.stringify(s.box));
    return inst;
  }

  F.build = async function (s, parentSpec, rep, isRoot, opts) {
    if (s.t === '#text') return null; // handled by the owner
    if (s.icon) return F.iconNode(s, rep);
    if (s.inst) { const inst = F.instanceNode(s, rep); if (inst) return inst; }
    if (s.svg) { const n = figma.createNodeFromSvg(s.svg); n.name = s.name ?? 'svg'; mark(n, 'svg'); return n; }

    const f = figma.createFrame();
    f.name = layerName(s);
    f.fills = [];
    f.clipsContent = s.overflow === 'hidden' || s.overflow === 'clip';
    const kids = s.kids ?? [];
    const flow = kids.filter((k) => !(k.pos === 'absolute' || k.pos === 'fixed'));
    const row = isRowish(s);
    f.layoutMode = row ? 'HORIZONTAL' : 'VERTICAL';
    if (s.wrap === 'wrap' && row) f.layoutWrap = 'WRAP';
    if (s.dir?.endsWith('reverse')) rep.raw.push(`${f.name}: flex-direction ${s.dir} — children are drawn in DOM order`);
    f.primaryAxisAlignItems = ALIGN[s.jc] ?? 'MIN';
    const cross = ALIGN[s.ai] ?? 'MIN';
    f.counterAxisAlignItems = cross === 'SPACE_BETWEEN' ? 'MIN' : cross;
    const stretch = !s.disp?.includes('flex') || ['normal', 'stretch'].includes(s.ai);
    const gap = row ? s.gapCol : s.gapRow;
    if (gap) { f.itemSpacing = gap.v; bindNum(f, 'itemSpacing', gap, rep, `${f.name} gap`); }
    if (f.layoutWrap === 'WRAP' && s.gapRow) { f.counterAxisSpacing = s.gapRow.v; bindNum(f, 'counterAxisSpacing', s.gapRow, rep, `${f.name} row gap`); }
    if (s.pad) ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((field, i) => { f[field] = s.pad[i].v; if (s.pad[i].v || s.pad[i].tok) bindNum(f, field, s.pad[i], rep, `${f.name} ${field}`); });
    if (s.radius) {
      const corners = s.radius.length === 1 ? [s.radius[0], s.radius[0], s.radius[0], s.radius[0]] : s.radius;
      ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].forEach((field, i) => { f[field] = Math.min(corners[i].v, 9999); bindNum(f, field, corners[i], rep, `${f.name} ${field}`); });
    }
    if (s.bg) { const p = paint(s.bg, rep, `${f.name} fill`); if (p) f.fills = [p]; }
    if (s.bgImage) rep.raw.push(`${f.name}: background-image ${s.bgImage.slice(0, 60)}`);
    if (s.img) { const p = S.vars.get('color/background/default/tertiary'); f.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }, 'color', p)]; mark(f, 'image'); }
    if (s.insetBorder) {
      // `box-shadow: inset 0 0 0 <width> <colour>` is how SDS draws a border that takes no space
      const p = paint(s.insetBorder.color, rep, `${f.name} border colour`); if (p) f.strokes = [p];
      f.strokeAlign = 'INSIDE'; f.strokesIncludedInLayout = false; f.strokeWeight = s.insetBorder.w.v; bindNum(f, 'strokeWeight', s.insetBorder.w, rep, `${f.name} border width`);
    } else if (s.border) {
      const b = s.border; const p = paint(b[0].color, rep, `${f.name} border colour`); if (p) f.strokes = [p];
      f.strokeAlign = 'INSIDE'; f.strokesIncludedInLayout = true; // a CSS border counts toward size
      const w = { top: 0, right: 0, bottom: 0, left: 0 }; for (const x of b) w[x.side] = x.w.v;
      f.strokeTopWeight = w.top; f.strokeRightWeight = w.right; f.strokeBottomWeight = w.bottom; f.strokeLeftWeight = w.left;
      for (const x of b) bindNum(f, `stroke${x.side[0].toUpperCase()}${x.side.slice(1)}Weight`, x.w, rep, `${f.name} border-${x.side} width`);
      if (b.some((x) => x.style === 'dashed')) f.dashPattern = [4, 4];
    }
    if (s.shadow) { const st = s.shadow.tok && S.effects.get(s.shadow.tok); if (st) await f.setEffectStyleIdAsync(st.id); else rep.raw.push(`${f.name} shadow: ${s.shadow.raw ?? s.shadow.v}`); }
    if (s.backdrop) { const st = s.backdrop.tok && S.effects.get(s.backdrop.tok); if (st) await f.setEffectStyleIdAsync(st.id); else rep.raw.push(`${f.name} backdrop-filter: ${s.backdrop.raw ?? s.backdrop.v}`); }
    if (s.opacity) { f.opacity = s.opacity.v; if (!s.opacity.tok) { mark(f, 'opacity'); rep.raw.push(`${f.name} opacity: ${s.opacity.raw ?? s.opacity.v}`); } }
    if (s.hidden) f.visible = false;

    // children
    const made = [];
    for (const k of kids) {
      let n;
      if (k.t === '#text') n = await F.textNode(k, s, rep);
      else if (k.pseudo) n = await F.pseudoNode(k, s, rep);
      else n = await F.build(k, s, rep, false, opts);
      if (n) made.push({ k, n, abs: k.pos === 'absolute' || k.pos === 'fixed' });
    }
    const multiColumn = s.grid && s.grid.cols.length > 1 && made.filter((m) => !m.abs).length > 1;
    if (multiColumn) F.gridLayout(f, s, made, rep);
    for (const { k, n, abs } of made) {
      if (!multiColumn || abs) f.appendChild(n);
      if (abs) { n.layoutPositioning = 'ABSOLUTE'; if (!k.pseudo) { n.x = k.box[0] - s.box[0]; n.y = k.box[1] - s.box[1]; } }
      if (k.t === '#text') {
        const oneLine = s.type.ws === 'nowrap' || k.box[3] <= (s.type.lh === 'normal' ? s.type.size * 1.5 : s.type.lh * 1.5);
        if (oneLine && (row || !stretch || flow.length > 1)) n.textAutoResize = 'WIDTH_AND_HEIGHT';
        else { n.textAutoResize = 'HEIGHT'; n.layoutSizingHorizontal = 'FILL'; }
      } else if (!abs && k.t !== 'svg') F.sizeChild(n, k, s, multiColumn ? false : row, multiColumn ? true : stretch);
    }
    if (!multiColumn) F.spacing(f, s, made.filter((m) => !m.abs), row, rep);

    // own size, when nothing above decides it
    if (isRoot) {
      const hugW = opts.rootW ? opts.rootW === 'hug' : (s.disp?.startsWith('inline') || s.type?.ws === 'nowrap') && !s.width;
      f.resize(Math.max(s.box[2], 0.01), Math.max(s.box[3], 0.01));
      f.layoutSizingHorizontal = hugW ? 'HUG' : 'FIXED';
      f.layoutSizingVertical = s.height || !kids.length ? 'FIXED' : 'HUG';
    }
    f.setSharedPluginData('sds', 'box', JSON.stringify(s.box));
    return f;
  }

  /**
   * CSS grid with more than one column → a row of column frames. Children go into the column their
   * left edge falls in, stacked top to bottom. Track widths keep their token; the last track fills.
   * Row alignment ACROSS columns does not exist in auto layout: a column gets top padding to match.
   */
  F.gridLayout = function (f, s, made, rep) {
    const flow = made.filter((m) => !m.abs);
    const padL = s.pad?.[3]?.v ?? 0, padT = s.pad?.[0]?.v ?? 0, colGap = s.gapCol?.v ?? 0;
    const starts = []; let x = s.box[0] + padL;
    s.grid.cols.forEach((w) => { starts.push(x); x += w + colGap; });
    f.layoutMode = 'HORIZONTAL'; f.counterAxisAlignItems = 'MIN'; f.primaryAxisAlignItems = 'MIN';
    f.itemSpacing = colGap; if (s.gapCol) bindNum(f, 'itemSpacing', s.gapCol, rep, `${f.name} column gap`);
    const cols = s.grid.cols.map((w, i) => {
      const c = figma.createFrame(); c.name = `column ${i + 1}`; c.fills = []; c.clipsContent = false; c.layoutMode = 'VERTICAL';
      if (s.gapRow) { c.itemSpacing = s.gapRow.v; bindNum(c, 'itemSpacing', s.gapRow, rep, `${f.name} row gap`); }
      f.appendChild(c);
      const last = i === s.grid.cols.length - 1;
      c.resize(Math.max(w, 0.01), 10);
      c.layoutSizingVertical = 'HUG';
      if (last) c.layoutSizingHorizontal = 'FILL';
      else { c.layoutSizingHorizontal = 'FIXED'; const v = s.grid.tok?.[i] && S.vars.get(s.grid.tok[i]); if (v) c.setBoundVariable('width', v); else rep.raw.push(`${f.name} grid column ${i + 1}: ${w}px`); }
      return { c, kids: [] };
    });
    for (const m of flow) { let i = 0; starts.forEach((st, j) => { if (m.k.box[0] >= st - 0.5) i = j; }); cols[i].kids.push(m); }
    for (const col of cols) {
      col.kids.sort((a, b) => a.k.box[1] - b.k.box[1]);
      for (const m of col.kids) col.c.appendChild(m.n);
      const first = col.kids[0];
      if (first) { const lead = Math.round((first.k.box[1] - s.box[1] - padT) * 100) / 100; if (lead > 0.5) { col.c.paddingTop = lead; mark(col.c, 'paddingTop'); rep.raw.push(`${f.name}: grid rows align items across columns — column top padding ${lead}px stands in`); } }
      if (!col.kids.length) col.c.remove();
    }
    rep.layout.push(`${f.name}: CSS grid (${s.grid.cols.length} columns) drawn as ${s.grid.cols.length} column frames`);
  };

  /**
   * Margins. Figma has none. If the measured space between children is the same everywhere, it
   * becomes the frame's spacing (bound, when one of the margin or gap tokens has that value).
   * If it differs, the child with extra space before it is wrapped in a frame with that padding.
   */
  F.spacing = function (f, s, flow, row, rep) {
    if (flow.length < 2 && !flow.some((m) => m.k.margin)) return;
    const a = row ? 0 : 1; // axis index in box
    const end = (m) => m.k.box[a] + m.k.box[a + 2];
    const gapVal = (row ? s.gapCol : s.gapRow)?.v ?? 0;
    const sp = []; for (let i = 1; i < flow.length; i++) sp.push(Math.round((flow[i].k.box[a] - end(flow[i - 1])) * 100) / 100);
    const toks = [];
    const side = row ? [3, 1] : [0, 2];
    for (const m of flow) for (const i of side) if (m.k.margin?.[i]?.tok) toks.push(m.k.margin[i]);
    const tokenFor = (val) => toks.find((t) => Math.abs(t.v - val) < 0.01) ?? ((row ? s.gapCol : s.gapRow)?.tok && Math.abs(gapVal - val) < 0.01 ? (row ? s.gapCol : s.gapRow) : null);
    if (!sp.length) return;
    const uniform = sp.every((x) => Math.abs(x - sp[0]) < 0.6);
    if (f.primaryAxisAlignItems === 'SPACE_BETWEEN' || f.primaryAxisAlignItems === 'CENTER' && Math.abs(sp[0] - gapVal) < 0.6) return;
    if (uniform) {
      if (Math.abs(sp[0] - gapVal) < 0.6) return;
      f.itemSpacing = sp[0]; const t = tokenFor(sp[0]);
      if (t) { bindNum(f, 'itemSpacing', t, rep, ''); rep.layout.push(`${f.name}: margins of ${sp[0]}px drawn as spacing, bound to ${t.tok}`); }
      else { mark(f, 'itemSpacing'); rep.raw.push(`${f.name}: space between children ${sp[0]}px comes from margins with no single token`); }
      return;
    }
    const base = Math.min(...sp);
    if (Math.abs(base - gapVal) > 0.6) { f.itemSpacing = base; const t = tokenFor(base); if (t) bindNum(f, 'itemSpacing', t, rep, ''); else mark(f, 'itemSpacing'); }
    sp.forEach((x, i) => {
      const extra = Math.round((x - base) * 100) / 100; if (extra < 0.6) return;
      const m = flow[i + 1]; const w = figma.createFrame(); w.name = `${m.n.name} · margin`; w.fills = []; w.clipsContent = false; w.layoutMode = row ? 'HORIZONTAL' : 'VERTICAL';
      const idx = f.children.indexOf(m.n); f.insertChild(idx, w); const fillH = m.n.layoutSizingHorizontal === 'FILL'; w.appendChild(m.n);
      const field = row ? 'paddingLeft' : 'paddingTop'; w[field] = extra; const t = tokenFor(extra); if (t) bindNum(w, field, t, rep, ''); else { mark(w, field); rep.raw.push(`${f.name}: ${extra}px of margin before ${m.n.name}, no token`); }
      w.layoutSizingHorizontal = fillH ? 'FILL' : 'HUG'; w.layoutSizingVertical = 'HUG'; if (fillH) m.n.layoutSizingHorizontal = 'FILL';
      rep.layout.push(`${f.name}: margin before ${m.n.name} drawn as a wrapper with ${extra}px padding`);
    });
  };

  F.sizeChild = function (n, k, parent, row, stretch) {
    if (!('layoutSizingHorizontal' in n)) return;
    const pct = (v) => v?.raw?.endsWith('%');
    const hasKids = (k.kids ?? []).length > 0;
    if (n.type === 'INSTANCE') { // an instance keeps its own sizing; it only ever stretches
      const fill = pct(k.width) || (row && k.grow) || (!row && stretch && !k.disp?.startsWith('inline')) || k.alignSelf === 'stretch';
      if (fill) n.layoutSizingHorizontal = 'FILL';
      return;
    }
    n.resize(Math.max(k.box[2], 0.01), Math.max(k.box[3], 0.01));
    // width
    if (k.width && !pct(k.width)) n.layoutSizingHorizontal = 'FIXED';
    else if (pct(k.width) || (row && k.grow) || (!row && stretch && !k.disp?.startsWith('inline')) || k.alignSelf === 'stretch') n.layoutSizingHorizontal = 'FILL';
    else n.layoutSizingHorizontal = hasKids ? 'HUG' : 'FIXED';
    // height
    if (k.height && !pct(k.height)) n.layoutSizingVertical = 'FIXED';
    else if (!row && k.grow) n.layoutSizingVertical = 'FILL';
    else n.layoutSizingVertical = hasKids ? 'HUG' : 'FIXED';
    const tokW = k.width?.tok && S.vars.get(k.width.tok); if (tokW) n.setBoundVariable('width', tokW);
    const tokH = k.height?.tok && S.vars.get(k.height.tok); if (tokH) n.setBoundVariable('height', tokH);
  }

  F.pseudoNode = async function (k, owner, rep) {
    const px = (v) => (v && v.endsWith('px') ? parseFloat(v) : null);
    const w = px(k.box[2]), h = px(k.box[3]);
    if (!w || !h) { rep.raw.push(`${layerName(owner)}${k.t}: no size (${k.box[2]} × ${k.box[3]})`); return null; }
    const r = figma.createFrame(); r.name = k.t; r.fills = []; r.resize(w, h);
    if (k.bg) { const p = paint(k.bg, rep, `${k.t} fill`); if (p) r.fills = [p]; }
    if (k.radius) { r.cornerRadius = Math.min(k.radius[0].v, 9999); ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'].forEach((fld) => bindNum(r, fld, k.radius[0], rep, `${k.t} radius`)); }
    if (k.border) { const p = paint(k.border[0].color, rep, `${k.t} border`); if (p) r.strokes = [p]; r.strokeWeight = k.border[0].w.v; r.strokeAlign = 'INSIDE'; }
    if (k.shadow) { const st = k.shadow.tok && S.effects.get(k.shadow.tok); if (st) await r.setEffectStyleIdAsync(st.id); else rep.raw.push(`${k.t} shadow: ${k.shadow.raw ?? k.shadow.v}`); }
    if (k.opacity) r.opacity = k.opacity.v;
    r.setSharedPluginData('sds', 'inset', JSON.stringify(k.inset));
    k._abs = { left: px(k.inset[3]), top: px(k.inset[0]) };
    if (k.pos === 'absolute') { k.box = [(owner.box[0] ?? 0) + (k._abs.left ?? 0), (owner.box[1] ?? 0) + (k._abs.top ?? 0), w, h]; }
    return r;
  }

  // ------------------------------------------------------------ audit
  F.audit = function (node, rep, path = '') {
    const raw = node.getSharedPluginData('sds', 'box');
    if (raw) {
      const b = JSON.parse(raw);
      if (Math.abs(node.width - b[2]) > 1 || Math.abs(node.height - b[3]) > 1) rep.size.push(`${path}${node.name}: Figma ${Math.round(node.width * 10) / 10}×${Math.round(node.height * 10) / 10}, browser ${b[2]}×${b[3]}`);
    }
    if ('children' in node && node.type !== 'INSTANCE') for (const c of node.children) F.audit(c, rep, `${path}${node.name} / `);
  }

  async function buildAt(spec, opts = {}) {
    const rep = { raw: [], type: [], size: [], margin: [], layout: [] };
    const page = figma.root.children.find((p) => p.name === opts.page);
    if (!page) throw new Error(`no page "${opts.page}"`);
    const node = await F.build(spec, null, rep, true, opts);
    page.appendChild(node);
    node.x = opts.x ?? 0; node.y = opts.y ?? 0;
    if (opts.name) node.name = opts.name;
    F.audit(node, rep);
    const uniq = (a) => [...new Set(a)];
    return { id: node.id, w: node.width, h: node.height, report: { raw: uniq(rep.raw), type: uniq(rep.type), size: uniq(rep.size), layout: uniq(rep.layout) } };
  }

  /**
   * Frames → one component set.
   *   items  [{ props: { variant: 'primary', size: 'medium' }, id }]   default variant FIRST
   *   o.text { children: 'Label' }        TEXT property ← text layers whose characters are 'Label'
   *   o.bool { hasIconStart: 'iconStart' } BOOLEAN property ← visibility of layers with that name
   *   o.swap { iconStart: 'iconStart' }    INSTANCE_SWAP property ← instances with that layer name
   *   o.boolDefaults { hasIconStart: false }  a BOOLEAN that starts off
   *   o.hiddenText { 'aria-label': 'Label' }  TEXT property on a hidden layer, for props that render nothing
   *   o.cols, o.description, o.link, o.x, o.y
   */
  async function variants(setName, items, o = {}) {
    const comps = [];
    for (const it of items) {
      const n = await figma.getNodeByIdAsync(it.id);
      const c = figma.createComponentFromNode(n);
      c.name = Object.keys(it.props ?? {}).length ? Object.entries(it.props).map(([k, v]) => `${k}=${v}`).join(', ') : setName;
      comps.push(c);
    }
    const page = comps[0].parent;
    const single = comps.length === 1 && !Object.keys(items[0].props ?? {}).length;
    const set = single ? comps[0] : figma.combineAsVariants(comps, page);
    set.name = setName;
    set.x = o.x ?? 40; set.y = o.y ?? 400;
    const each = single ? [set] : comps;
    const wired = {};
    for (const [prop, sample] of Object.entries(o.text ?? {})) {
      const id = set.addComponentProperty(prop, 'TEXT', sample); let n = 0;
      for (const c of each) for (const t of c.findAllWithCriteria({ types: ['TEXT'] })) if (t.characters === sample && !insideInstance(t, c)) { t.componentPropertyReferences = { ...t.componentPropertyReferences, characters: id }; t.name = prop; n++; }
      wired[prop] = n;
    }
    for (const [prop, layer] of Object.entries(o.bool ?? {})) {
      const id = set.addComponentProperty(prop, 'BOOLEAN', o.boolDefaults?.[prop] ?? true); let n = 0;
      for (const c of each) for (const t of c.findAll((x) => x.name === layer && !insideInstance(x, c))) { t.componentPropertyReferences = { ...t.componentPropertyReferences, visible: id }; n++; }
      wired[prop] = n;
    }
    for (const [prop, layer] of Object.entries(o.swap ?? {})) {
      const first = each.map((c) => c.findOne((x) => x.name === layer && x.type === 'INSTANCE')).find(Boolean);
      if (!first) { wired[prop] = 0; continue; }
      const main = await first.getMainComponentAsync();
      const id = set.addComponentProperty(prop, 'INSTANCE_SWAP', main.id); let n = 0;
      for (const c of each) for (const t of c.findAll((x) => x.name === layer && x.type === 'INSTANCE' && !insideInstance(x, c))) { t.componentPropertyReferences = { ...t.componentPropertyReferences, mainComponent: id }; n++; }
      wired[prop] = n;
    }
    for (const c of each) for (const i of c.findAllWithCriteria({ types: ['INSTANCE'] })) if (!insideInstance(i, c) && !S.icons.has(i.name) && Object.keys(i.componentProperties).length) { try { i.isExposedInstance = true; } catch { /* nothing to expose */ } }
    // A prop that renders nothing visible (aria-label) still has to travel back with the frame:
    // a hidden text layer, bound to a TEXT property.
    for (const [prop, sample] of Object.entries(o.hiddenText ?? {})) {
      const id = set.addComponentProperty(prop, 'TEXT', sample); const st = S.text.get('font/body-small'); await loadFont(st.fontName);
      for (const c of each) { const t = figma.createText(); t.fontName = { family: st.fontName.family, style: st.fontName.style }; t.characters = sample; await t.setTextStyleIdAsync(st.id); t.name = prop; c.appendChild(t); t.layoutPositioning = 'ABSOLUTE'; t.x = 0; t.y = 0; t.visible = false; t.componentPropertyReferences = { characters: id }; }
      wired[prop] = each.length;
    }
    if (!single) { // the grid, laid out last: hidden parts have changed the sizes
      const cols = o.cols ?? Math.min(comps.length, 4), GAP = 24, PAD = 24;
      const colW = [], rowH = [];
      comps.forEach((c, i) => { const col = i % cols, row = Math.floor(i / cols); colW[col] = Math.max(colW[col] ?? 0, c.width); rowH[row] = Math.max(rowH[row] ?? 0, c.height); });
      comps.forEach((c, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        c.x = PAD + colW.slice(0, col).reduce((a, b) => a + b + GAP, 0);
        c.y = PAD + rowH.slice(0, row).reduce((a, b) => a + b + GAP, 0);
      });
      set.resizeWithoutConstraints(PAD * 2 + colW.reduce((a, b) => a + b + GAP, -GAP), PAD * 2 + rowH.reduce((a, b) => a + b + GAP, -GAP));
      set.strokes = [{ type: 'SOLID', color: { r: 0.59, g: 0.28, b: 1 } }]; set.strokeWeight = 1; set.dashPattern = [10, 5]; set.cornerRadius = 5; set.fills = [];
    }
    if (o.description) set.description = o.description;
    if (o.link) set.documentationLinks = [{ uri: o.link }];
    S.sets.set(setName, set);
    return { id: set.id, w: set.width, h: set.height, variants: comps.length, wired, default: single ? null : set.defaultVariant.name };
  }
  /** A token name → the value it currently holds (first mode), as paint() and bindNum() expect it. */
  function resolve(tok) {
    let v = S.vars.get(tok); let guard = 0;
    while (v && guard++ < 10) {
      const val = Object.values(v.valuesByMode)[0];
      if (val && val.type === 'VARIABLE_ALIAS') { v = [...S.vars.values()].find((x) => x.id === val.id); continue; }
      if (val && typeof val === 'object' && 'r' in val) return `rgba(${Math.round(val.r * 255)}, ${Math.round(val.g * 255)}, ${Math.round(val.b * 255)}, ${val.a ?? 1})`;
      return val;
    }
    return undefined;
  }
  /** The probe sends "one token" values as the bare token name. Give them back their { v, tok } shape. */
  const VALUE_KEYS = new Set(['placeholderColor', 'gap', 'gapRow', 'gapCol', 'bg', 'shadow', 'backdrop', 'filter', 'opacity', 'ink', 'size', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'w', 'color', 'style']);
  function expandValues(s) {
    const fix = (x) => (typeof x === 'string' ? { tok: x, v: resolve(x) } : x);
    const walk = (o, key) => {
      if (Array.isArray(o)) return o.map((x) => (['pad', 'margin', 'radius'].includes(key) ? fix(x) : walk(x, key)));
      if (!o || typeof o !== 'object') return o;
      for (const [k, v] of Object.entries(o)) if (k !== 'inst' && k !== 'grid') o[k] = k === 'style' ? (key === 'type' && typeof v === 'string' ? { tok: v } : v) : VALUE_KEYS.has(k) && typeof v === 'string' ? fix(v) : walk(v, k);
      return o;
    };
    walk(s);
    const post = (n) => {
      if (n.pad && n.pad.length === 1) n.pad = [n.pad[0], n.pad[0], n.pad[0], n.pad[0]];
      if (n.gap) { n.gapRow = n.gap; n.gapCol = n.gap; delete n.gap; }
      if (n.type && n.type.size === undefined && n.type.style?.tok) n.type.size = S.text.get(n.type.style.tok)?.fontSize;
      (n.kids ?? []).forEach(post);
    };
    post(s);
    return s;
  }

  /** Undo the probe's diff(): items after the first arrive as { d: { set, del } } against the first. */
  function unpack(items) {
    const base = items[0].spec;
    const setPath = (o, path, v) => { const ks = path.split('.'); let cur = o; for (let i = 0; i < ks.length - 1; i++) { if (cur[ks[i]] === undefined || cur[ks[i]] === null) cur[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; cur = cur[ks[i]]; } cur[ks.at(-1)] = v; };
    const delPath = (o, path) => { const ks = path.split('.'); let cur = o; for (let i = 0; i < ks.length - 1; i++) { cur = cur?.[ks[i]]; if (cur === undefined) return; } delete cur[ks.at(-1)]; };
    const prune = (o) => { // drop what a delete emptied, and trim arrays to their new length
      if (!o || typeof o !== 'object') return o;
      for (const k of Object.keys(o)) { o[k] = prune(o[k]); if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && !Object.keys(o[k]).length) delete o[k]; }
      return Array.isArray(o) ? o.filter((x) => x !== undefined) : o;
    };
    return items.map((it) => {
      if (it.spec) return it;
      const spec = JSON.parse(JSON.stringify(base));
      for (const p of it.d.del) if (!p.endsWith('#')) delPath(spec, p);
      for (const [p, v] of Object.entries(it.d.set)) if (!p.endsWith('#')) setPath(spec, p, v);
      return { props: it.props, spec: prune(spec) };
    });
  }

  /**
   * One whole component: build every variant, combine them, place the set under
   * whatever is already on the page. `def` is what the probe's probeComponent() returns.
   */
  async function component(def) {
    let page = figma.root.children.find((p) => p.name === def.page);
    if (!page) { page = figma.createPage(); page.name = def.page; }
    if (page.findOne((n) => (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT') && n.name === def.name)) throw new Error(`${def.name} is already on page ${def.page} — update it, do not build it twice`);
    const bottom = page.children.reduce((m, n) => Math.max(m, n.y + n.height), 0);
    const items = [], report = { raw: new Set(), type: new Set(), layout: new Set(), size: [] }; const t0 = Date.now(); const ms = [];
    for (const it of unpack(def.items)) {
      expandValues(it.spec);
      const t1 = Date.now();
      const r = await buildAt(it.spec, { page: def.page, rootW: def.rootW });
      ms.push(Date.now() - t1);
      items.push({ props: it.props, id: r.id });
      const label = Object.entries(it.props).map(([k, v]) => `${k}=${v}`).join(', ');
      r.report.raw.forEach((x) => report.raw.add(x)); r.report.type.forEach((x) => report.type.add(x)); r.report.layout.forEach((x) => report.layout.add(x));
      r.report.size.forEach((x) => report.size.push(`[${label}] ${x}`));
    }
    const set = await variants(def.name, items, { ...def, x: 40, y: bottom ? bottom + 96 : 40 });
    return { ...set, ms: { total: Date.now() - t0, perVariant: ms }, report: { raw: [...report.raw], type: [...report.type], layout: [...report.layout], size: report.size } };
  }

  /** The documentation frame at the top of a component page. Text and colours are the file's own styles. */
  async function doc(pageName, d) {
    let page = figma.root.children.find((p) => p.name === pageName);
    if (!page) { page = figma.createPage(); page.name = pageName; }
    page.findOne((n) => n.name === 'Documentation' && n.type === 'FRAME')?.remove();
    const f = figma.createFrame(); f.name = 'Documentation'; page.insertChild(0, f);
    f.layoutMode = 'VERTICAL'; f.resize(880, 100); f.layoutSizingVertical = 'HUG'; f.x = 40; f.y = -40; f.fills = [];
    f.itemSpacing = 16; bindNum(f, 'itemSpacing', { tok: 'size/space/400', v: 16 }, { raw: [] }, '');
    const line = async (chars, style, color) => {
      const t = figma.createText(); const st = S.text.get(style); await loadFont(st.fontName);
      t.fontName = { family: st.fontName.family, style: st.fontName.style }; t.characters = chars; await t.setTextStyleIdAsync(st.id);
      t.fills = [paint({ v: '#1e1e1e', tok: color }, { raw: [] }, '')]; f.appendChild(t); t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; return t;
    };
    await line(d.title, 'font/title-page', 'color/text/default/default');
    if (d.description) await line(d.description, 'font/body-base', 'color/text/default/secondary');
    for (const c of d.contracts ?? []) await line(c, 'font/body-code', 'color/text/default/default');
    if (d.gaps?.length) { await line('Where Figma differs from the code', 'font/body-strong', 'color/text/default/default'); for (const g of d.gaps) await line(`· ${g}`, 'font/body-small', 'color/text/default/secondary'); }
    f.y = -f.height - 96;
    return { id: f.id, h: f.height };
  }

  const insideInstance = (n, root) => { for (let p = n.parent; p && p !== root; p = p.parent) if (p.type === 'INSTANCE') return true; return false; };

  return { init, build: buildAt, variants, component, doc, unpack, expandValues, resolve, refreshSets, S, F, H: { paint, bindNum, mark, rgba, layerName, isRowish, ALIGN, loadFont, insideInstance } };
})();
return 'builder installed';
