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
  // …and load each font ONCE. While the Figma window is hidden (you walked away, the display slept),
  // loadFontAsync stalls for half a minute every few calls, even for a font that is already loaded.
  const loaded = new Set();
  const loadFont = async (fn) => { const k = `${fn.family}/${fn.style}`; if (loaded.has(k)) return; await figma.loadFontAsync({ family: fn.family, style: fn.style }); loaded.add(k); };

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
    // A browser never lays an <input>'s text out tighter than the font's normal line height, whatever
    // line-height says (SDS sets 1, the box is still 19.5px for 16px Inter). Auto is what it renders.
    const ty = owner.t === 'input' ? { ...owner.type, lh: 'normal' } : owner.type;
    n.name = t.name ?? 'text';
    const want = ty.style.tok;
    let style = want && S.text.get(want);
    const ratio = ty.lh === 'normal' ? 'normal' : Math.round((ty.lh / ty.size) * 100) / 100;
    const lhOf = (st) => (st.lineHeight.unit === 'AUTO' ? 'normal' : st.lineHeight.unit === 'PERCENT' ? st.lineHeight.value / 100 : st.lineHeight.value / st.fontSize);
    // the single-line twin carries line-height: 1 where one exists
    if (style && ratio === 1 && Math.abs((typeof lhOf(style) === 'number' ? lhOf(style) : 0) - 1) > 0.02) { const single = S.text.get(want.replace('font/', 'font/single-line/')); if (single) style = single; }
    if (style) {
      await loadFont(style.fontName);
      n.fontName = { family: style.fontName.family, style: style.fontName.style };
      n.characters = t.text;
      const sameLh = lhOf(style) === ratio || (typeof ratio === 'number' && typeof lhOf(style) === 'number' && Math.abs(lhOf(style) - ratio) < 0.02); // 160% arrives as 1.600000023841858
      const sizeOverride = ty['override:font-size'] && Math.abs(ty.size - style.fontSize) > 0.5; // TextPrice's currency: `font-size: 0.6em` on top of the style
      if (sameLh && !sizeOverride) await n.setTextStyleIdAsync(style.id);
      else {
        // One field differs from the style (line height, or a font size). Figma cannot override one field of a
        // text style, so bind the style's own variables one by one and keep that field raw.
        n.fontSize = style.fontSize;
        for (const [field, alias] of Object.entries(style.boundVariables ?? {})) { if (sizeOverride && field === 'fontSize') continue; const v = [...S.vars.values()].find((x) => x.id === alias.id); if (v) n.setBoundVariable(field, v); }
        if (sizeOverride) { n.fontSize = ty.size; mark(n, 'fontSize'); rep.raw.push(`${n.name}: font-size ${ty['override:font-size']} of ${style.name} = ${ty.size}px`); }
        n.lineHeight = ratio === 'normal' ? { unit: 'AUTO' } : { unit: 'PERCENT', value: ratio * 100 };
        n.textDecoration = style.textDecoration;
        mark(n, 'textStyle'); n.setSharedPluginData('sds', 'textStyle', style.name);
        if (!sameLh) rep.type.push(`${n.name}: ${style.name} at line-height ${ratio} (the style has ${lhOf(style)}) — fields bound one by one`);
      }
    } else {
      await loadFont({ family: 'Inter', style: 'Regular' });
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
    // a colour inherited from outside the instance (a brand Card's `on-brand` on its TextPrice): an override on its text layers
    if (s.textColor) { const p = paint(s.textColor, rep, `${inst.name} inherited colour`); if (p) for (const t of inst.findAllWithCriteria({ types: ['TEXT'] })) t.fills = [p]; }
    inst.setSharedPluginData('sds', 'box', JSON.stringify(s.box));
    return inst;
  }

  F.build = async function (s, parentSpec, rep, isRoot, opts) {
    if (s.t === '#text') return null; // handled by the owner
    if (s.icon) return F.iconNode(s, rep);
    if (s.inst) { const inst = F.instanceNode(s, rep); if (inst) return inst; }
    if (s.svg) {
      // a shape drawn in place (the Tooltip arrow): the viewBox size becomes the CSS size, the fill is bound, then it is rotated
      const n = figma.createNodeFromSvg(s.svg); n.name = 'shape'; mark(n, 'svg');
      if (s.svgSize && n.width) n.rescale(Math.max(s.svgSize[0], 0.01) / n.width); // rescale, not resize: the strokes scale with the drawing (the Logo's 15-unit stroke)
      if (s.ink) { const p = paint(s.ink, rep, `${s.name ?? 'svg'} fill`); if (p) for (const v of n.findAll((x) => 'fills' in x)) v.fills = [p]; }
      if (s.stroke) { const p = paint(s.stroke, rep, `${s.name ?? 'svg'} stroke`); if (p) for (const v of n.findAll((x) => 'strokes' in x && x.strokes.length)) v.strokes = [p]; }
      if (!s.rot) { n.name = s.name ?? 'svg'; return n; }
      // rotated: a plain frame the size of the rotated bounds holds it, so the parent can place and size it like any box
      const f = figma.createFrame(); f.name = s.name ?? 'svg'; f.fills = []; f.clipsContent = false; f.resize(Math.max(s.box[2], 0.01), Math.max(s.box[3], 0.01)); f.appendChild(n);
      n.rotation = -s.rot; // CSS is clockwise, Figma counter-clockwise; Figma rotates around the unrotated origin
      const [w, h] = s.svgSize ?? [n.width, n.height], r = ((s.rot % 360) + 360) % 360;
      n.x = r === 180 || r === 90 ? (r === 180 ? w : h) : 0; n.y = r === 180 ? h : r === 270 ? w : 0;
      return f;
    }

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
      if (abs) { n.layoutPositioning = 'ABSOLUTE'; if (!k.pseudo) { if ('resize' in n && n.type !== 'INSTANCE' && k.t !== '#text') n.resize(Math.max(k.box[2], 0.01), Math.max(k.box[3], 0.01)); n.x = k.box[0] - s.box[0]; n.y = k.box[1] - s.box[1]; for (const d of ['width', 'height']) { const v = k[d]?.tok && S.vars.get(k[d].tok); if (v && 'setBoundVariable' in n && n.type === 'FRAME') n.setBoundVariable(d, v); } } }
      if (k.t === '#text') {
        const oneLine = s.type.ws === 'nowrap' || k.box[3] <= (s.type.lh === 'normal' ? s.type.size * 1.5 : s.type.lh * 1.5);
        // One line of text hugs. Filling a block that is exactly as wide as the text makes Figma wrap it
        // on a rounding error ("Label" became two lines). Centred or right-aligned text has to fill to align.
        const aligned = ['center', 'right', 'end'].includes(s.type.align);
        // …unless the block is exactly as wide as the text (the Tooltip's centred lines): then the text hugs and the block aligns it
        const snug = aligned && Math.abs(k.box[2] - (s.box[2] - (s.pad?.[1]?.v ?? 0) - (s.pad?.[3]?.v ?? 0))) < 1 && f.layoutMode === 'VERTICAL';
        if (oneLine && (!aligned || snug)) { n.textAutoResize = 'WIDTH_AND_HEIGHT'; if (snug) f.counterAxisAlignItems = s.type.align === 'center' ? 'CENTER' : 'MAX'; }
        else { n.textAutoResize = 'HEIGHT'; n.layoutSizingHorizontal = 'FILL'; }
      } else if (!abs && k.t !== 'svg') {
        F.sizeChild(n, k, s, multiColumn ? false : row, multiColumn ? true : stretch);
        // `margin: 0 auto` on a child narrower than its column (the open Accordion panel): Figma has no per-child
        // alignment, so a wrapper that fills the column centres it. Named like the other margin wrappers.
        const auto = (i) => k.margin?.[i]?.raw === 'auto';
        if (!multiColumn && !row && auto(1) && auto(3) && n.layoutSizingHorizontal === 'FIXED') {
          const w = figma.createFrame(); w.name = `${n.name} · margin`; w.fills = []; w.clipsContent = false; w.layoutMode = 'HORIZONTAL'; w.primaryAxisAlignItems = 'CENTER';
          f.insertChild(f.children.indexOf(n), w); w.appendChild(n); w.layoutSizingHorizontal = 'FILL'; w.layoutSizingVertical = 'HUG';
          made.find((m) => m.n === n).n = w; // spacing() below works on the wrapper
          rep.layout.push(`${f.name}: margin auto around ${n.name} drawn as a centring wrapper`);
        }
      }
    }
    if (!multiColumn) F.spacing(f, s, made.filter((m) => !m.abs), row, rep);
    // a positioned child with a z-index (the Tooltip arrow, over the dialog's border) goes on top, in DOM order among themselves
    for (const m of made.filter((x) => x.abs && x.k.z).sort((a, b) => a.k.z - b.k.z)) f.appendChild(m.n);

    // own size, when nothing above decides it
    if (isRoot) {
      // a declared width is kept, a `100%` one too (a root has no container: the measured width stands, the sheet Dialog is the viewport's)
      const declared = !!s.width;
      const hugW = opts.rootW === 'fixed' ? false : opts.rootW === 'hug' ? !declared && kids.some((k) => k.pos !== 'absolute') : (s.disp?.startsWith('inline') || s.type?.ws === 'nowrap') && !declared;
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
    // If a child spans columns (the slider's track under "label … value"), columns cannot hold it:
    // read the grid as rows instead. A row with several children becomes a horizontal frame.
    const trackOf = (m) => { let acc = s.box[0] + (s.pad?.[3]?.v ?? 0), i = 0; for (; i < s.grid.cols.length; i++) { if (m.k.box[0] < acc + s.grid.cols[i] - 0.5) break; acc += s.grid.cols[i] + (s.gapCol?.v ?? 0); } return Math.min(i, s.grid.cols.length - 1); };
    if (flow.some((m) => m.k.box[2] > s.grid.cols[trackOf(m)] + 1)) return F.gridRows(f, s, flow, rep);
    const padL = s.pad?.[3]?.v ?? 0, padT = s.pad?.[0]?.v ?? 0, colGap = s.gapCol?.v ?? 0;
    const starts = []; let x = s.box[0] + padL;
    s.grid.cols.forEach((w) => { starts.push(x); x += w + colGap; });
    f.layoutMode = 'HORIZONTAL'; f.counterAxisAlignItems = 'MIN'; f.primaryAxisAlignItems = 'MIN';
    f.itemSpacing = colGap; if (s.gapCol) bindNum(f, 'itemSpacing', s.gapCol, rep, `${f.name} column gap`);
    const cols = s.grid.cols.map((w, i) => {
      const c = figma.createFrame(); c.name = `column ${i + 1}`; c.fills = []; c.clipsContent = false; c.layoutMode = 'VERTICAL';
      if (s.gapRow) { c.itemSpacing = s.gapRow.v; bindNum(c, 'itemSpacing', s.gapRow, rep, `${f.name} row gap`); }
      f.appendChild(c);
      // 1fr fills, auto hugs, a length is fixed (and keeps its token). Without the declared tracks: the last one fills.
      const kind = s.grid.decl?.[i] ?? (i === s.grid.cols.length - 1 ? 'fill' : 'fixed');
      c.resize(Math.max(w, 0.01), 10);
      c.layoutSizingVertical = 'HUG';
      return { c, kids: [], kind, w, i };
    });
    for (const m of flow) { let i = 0; starts.forEach((st, j) => { if (m.k.box[0] >= st - 0.5) i = j; }); cols[i].kids.push(m); }
    for (const col of cols) {
      col.kids.sort((a, b) => a.k.box[1] - b.k.box[1]);
      for (const m of col.kids) col.c.appendChild(m.n);
      const first = col.kids[0];
      if (first) { const lead = Math.round((first.k.box[1] - s.box[1] - padT) * 100) / 100; if (lead > 0.5) { col.c.paddingTop = lead; mark(col.c, 'paddingTop'); rep.raw.push(`${f.name}: grid rows align items across columns — column top padding ${lead}px stands in`); } }
      if (!col.kids.length) { col.c.remove(); continue; }
      if (col.kind === 'fill') col.c.layoutSizingHorizontal = 'FILL';
      else if (col.kind === 'hug') col.c.layoutSizingHorizontal = 'HUG';
      else { col.c.layoutSizingHorizontal = 'FIXED'; const v = s.grid.tok?.[col.i] && S.vars.get(s.grid.tok[col.i]); if (v) col.c.setBoundVariable('width', v); else rep.raw.push(`${f.name} grid column ${col.i + 1}: ${col.w}px`); }
      // a grid row is as tall as its tallest cell, so the space under a short cell is more than the row gap
      F.spacing(col.c, { gapRow: s.gapRow, box: s.box }, col.kids, false, rep);
    }
    rep.layout.push(`${f.name}: CSS grid (${s.grid.cols.length} columns) drawn as ${s.grid.cols.length} column frames`);
  };

  F.gridRows = function (f, s, flow, rep) {
    const sorted = [...flow].sort((a, b) => a.k.box[1] - b.k.box[1] || a.k.box[0] - b.k.box[0]);
    const rows = [];
    for (const m of sorted) { const last = rows.at(-1); if (last && m.k.box[1] < last.bottom - 0.5) { last.items.push(m); last.bottom = Math.max(last.bottom, m.k.box[1] + m.k.box[3]); } else rows.push({ items: [m], top: m.k.box[1], bottom: m.k.box[1] + m.k.box[3] }); }
    f.layoutMode = 'VERTICAL'; f.counterAxisAlignItems = 'MIN';
    const right = s.box[0] + s.box[2] - (s.pad?.[1]?.v ?? 0);
    // Which column an item starts in, and what kind of track that is. An implicit track (more columns than
    // declared, MenuItem's icon pushes everything one over) is `auto`, so it hugs.
    const cols = s.grid.cols, kind = (i) => s.grid.decl?.[i] ?? (i >= (s.grid.decl?.length ?? 0) ? 'hug' : i === cols.length - 1 ? 'fill' : 'fixed');
    const colOf = (m) => { let x = s.box[0] + (s.pad?.[3]?.v ?? 0), i = 0; for (; i < cols.length && m.k.box[0] >= x + cols[i] - 0.5; i++) x += cols[i] + (s.gapCol?.v ?? 0); return Math.min(i, cols.length - 1); };
    const hasFill = cols.some((_, i) => kind(i) === 'fill');
    const stack = rows.map((r) => {
      r.items.sort((a, b) => a.k.box[0] - b.k.box[0]);
      const first = colOf(r.items[0]);
      // one item that starts in the first column needs no row (it fills below); otherwise keep the columns
      if (r.items.length === 1 && (first === 0 || !hasFill)) { f.appendChild(r.items[0].n); return r.items[0]; }
      const row = figma.createFrame(); row.name = 'row'; row.fills = []; row.clipsContent = false; row.layoutMode = 'HORIZONTAL'; f.appendChild(row);
      if (hasFill) {
        // a fill track stands for itself: a fill frame holding its item, or an empty spacer when the row skips it
        for (let c = 0; c < first; c++) if (kind(c) === 'fill') { const sp = figma.createFrame(); sp.name = `column ${c + 1}`; sp.fills = []; row.appendChild(sp); sp.layoutSizingHorizontal = 'FILL'; sp.resize(sp.width, 1); }
        for (const m of r.items) {
          if (kind(colOf(m)) === 'fill' && m.k.box[2] < cols[colOf(m)] - 0.5) { const col = figma.createFrame(); col.name = `column ${colOf(m) + 1}`; col.fills = []; col.clipsContent = false; col.layoutMode = 'HORIZONTAL'; row.appendChild(col); col.appendChild(m.n); col.layoutSizingHorizontal = 'FILL'; col.layoutSizingVertical = 'HUG'; }
          else row.appendChild(m.n);
        }
        row.primaryAxisAlignItems = 'MIN';
      } else {
        for (const m of r.items) row.appendChild(m.n);
        const lastItem = r.items.at(-1).k;
        row.primaryAxisAlignItems = Math.abs(lastItem.box[0] + lastItem.box[2] - right) < 1 ? 'SPACE_BETWEEN' : 'MIN';
      }
      row.counterAxisAlignItems = r.items.some((m) => m.k.alignSelf === 'flex-end') ? 'MAX' : ({ center: 'CENTER', end: 'MAX', 'flex-end': 'MAX' }[s.ai] ?? 'MIN');
      if (row.primaryAxisAlignItems === 'MIN' && s.gapCol) { row.itemSpacing = s.gapCol.v; bindNum(row, 'itemSpacing', s.gapCol, rep, `${f.name} column gap`); }
      row.layoutSizingHorizontal = 'FILL'; row.layoutSizingVertical = 'HUG';
      for (const m of r.items) if (m.n.type === 'FRAME' && m.n.layoutMode !== 'NONE') { m.n.resize(Math.max(m.k.box[2], 0.01), Math.max(m.k.box[3], 0.01)); m.n.layoutSizingHorizontal = 'HUG'; m.n.layoutSizingVertical = 'HUG'; m.n.setSharedPluginData('sds', 'sized', 'row'); } // sizeChild runs later and must leave these alone (an icon instance cannot hug)
      const margin = [0, 1, 2, 3].map((i) => r.items.map((m) => m.k.margin?.[i]).find((x) => x?.tok) ?? { v: 0 });
      return { k: { box: [s.box[0], r.top, s.box[2], r.bottom - r.top], margin }, n: row, row: true };
    });
    for (const m of stack) if (!m.row && 'layoutSizingHorizontal' in m.n && m.n.type !== 'INSTANCE') { try { m.n.layoutSizingHorizontal = 'FILL'; } catch { /* text or fixed */ } }
    F.spacing(f, { gapRow: s.gapRow, box: s.box }, stack, false, rep);
    rep.layout.push(`${f.name}: CSS grid with a spanning child, drawn as ${rows.length} rows`);
  };

  /**
   * Margins. Figma has none. If the measured space between children is the same everywhere, it
   * becomes the frame's spacing (bound, when one of the margin or gap tokens has that value).
   * If it differs, the child with extra space before it is wrapped in a frame with that padding.
   */
  F.spacing = function (f, s, flow, row, rep) {
    if (flow.length < 2 && !flow.some((m) => m.k.margin)) return;
    // Margins across the axis (left / right on a child of a column, the Menu separator's `margin: 4px 16px`):
    // a wrapper that fills the column, padded by the margin tokens. The main-axis step below reuses it.
    const cross = row ? [0, 2] : [3, 1];
    for (const m of flow) {
      const mg = m.k.margin; if (!mg || !cross.some((i) => mg[i]?.tok || mg[i]?.v > 0) || m.n.type === 'TEXT') continue;
      const w = figma.createFrame(); w.name = `${m.n.name} · margin`; w.fills = []; w.clipsContent = false; w.layoutMode = row ? 'HORIZONTAL' : 'VERTICAL';
      const idx = f.children.indexOf(m.n); f.insertChild(idx, w); const fillH = m.n.layoutSizingHorizontal === 'FILL'; w.appendChild(m.n);
      const fields = row ? ['paddingTop', 'paddingBottom'] : ['paddingLeft', 'paddingRight'];
      cross.forEach((i, j) => { if (!(mg[i]?.tok || mg[i]?.v > 0)) return; w[fields[j]] = mg[i].v; bindNum(w, fields[j], mg[i], rep, `${f.name} ${fields[j]} before ${m.n.name}`); });
      w.layoutSizingHorizontal = row ? 'HUG' : 'FILL'; w.layoutSizingVertical = row ? 'FILL' : 'HUG'; if (fillH && !row) m.n.layoutSizingHorizontal = 'FILL';
      rep.layout.push(`${f.name}: side margins of ${m.n.name} drawn as a wrapper with padding`);
      m.n = w;
    }
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
    // Different margins, each its own token (the Dialog's description at space/200, its buttons at space/600):
    // every child keeps its margin as a bound wrapper padding, and the frame keeps the CSS gap.
    const wrapWith = (m, field, tok) => {
      let w = m.n.name.endsWith('· margin') && m.n.type === 'FRAME' ? m.n : null;
      if (!w) { w = figma.createFrame(); w.name = `${m.n.name} · margin`; w.fills = []; w.clipsContent = false; w.layoutMode = row ? 'HORIZONTAL' : 'VERTICAL'; const idx = f.children.indexOf(m.n); f.insertChild(idx, w); const fillH = m.n.layoutSizingHorizontal === 'FILL'; w.appendChild(m.n); w.layoutSizingHorizontal = fillH ? 'FILL' : 'HUG'; w.layoutSizingVertical = 'HUG'; if (fillH) m.n.layoutSizingHorizontal = 'FILL'; m.n = w; }
      w[field] = tok.v; bindNum(w, field, tok, rep, '');
    };
    const own = sp.map((x, i) => { const mg = flow[i + 1].k.margin?.[side[0]]; return mg?.tok && Math.abs(mg.v + gapVal - x) < 0.6 ? mg : null; });
    if (!uniform && own.every(Boolean)) {
      own.forEach((tok, i) => wrapWith(flow[i + 1], row ? 'paddingLeft' : 'paddingTop', tok));
      rep.layout.push(`${f.name}: each child's margin drawn as a wrapper, bound to its token (${own.map((t) => t.tok).join(', ')})`);
      return;
    }
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
      const m = flow[i + 1]; let w = m.n.name.endsWith('· margin') && m.n.type === 'FRAME' ? m.n : null; // the cross-axis wrapper, if there is one
      if (!w) {
        w = figma.createFrame(); w.name = `${m.n.name} · margin`; w.fills = []; w.clipsContent = false; w.layoutMode = row ? 'HORIZONTAL' : 'VERTICAL';
        const idx = f.children.indexOf(m.n); f.insertChild(idx, w); const fillH = m.n.layoutSizingHorizontal === 'FILL'; w.appendChild(m.n);
        w.layoutSizingHorizontal = fillH ? 'FILL' : 'HUG'; w.layoutSizingVertical = 'HUG'; if (fillH) m.n.layoutSizingHorizontal = 'FILL';
      }
      const field = row ? 'paddingLeft' : 'paddingTop'; w[field] = extra; const t = tokenFor(extra); if (t) bindNum(w, field, t, rep, ''); else { mark(w, field); rep.raw.push(`${f.name}: ${extra}px of margin before ${m.n.name}, no token`); }
      rep.layout.push(`${f.name}: margin before ${m.n.name} drawn as a wrapper with ${extra}px padding`);
    });
  };

  F.sizeChild = function (n, k, parent, row, stretch) {
    if (!('layoutSizingHorizontal' in n) || n.getSharedPluginData('sds', 'sized')) return;
    const pct = (v) => v?.raw?.endsWith('%');
    const hasKids = (k.kids ?? []).length > 0;
    if (n.type === 'INSTANCE') { // an instance keeps its own sizing; it only ever stretches
      const fill = pct(k.width) || (row && k.grow) || (!row && stretch && !k.disp?.startsWith('inline')) || k.alignSelf === 'stretch';
      if (fill) n.layoutSizingHorizontal = 'FILL';
      // …unless the browser squeezed it (flex-shrink on the Image in a horizontal Card): a resized instance, as a designer would
      else if (Math.abs(n.width - k.box[2]) > 3 || Math.abs(n.height - k.box[3]) > 3) { n.resize(Math.max(k.box[2], 0.01), Math.max(k.box[3], 0.01)); n.setSharedPluginData('sds', 'resized', `${k.box[2]}×${k.box[3]}`); }
      return;
    }
    n.resize(Math.max(k.box[2], 0.01), Math.max(k.box[3], 0.01));
    // width
    if (k.width && !pct(k.width)) n.layoutSizingHorizontal = 'FIXED';
    else if (!k.width && k['max-width'] && row) n.layoutSizingHorizontal = 'FIXED'; // capped by a max-width (the Footer's four `calc(25% − 18px)` columns): the measured width is the truth
    else if (pct(k.width) || (row && k.grow) || (!row && stretch && !k.disp?.startsWith('inline')) || k.alignSelf === 'stretch') n.layoutSizingHorizontal = 'FILL';
    else n.layoutSizingHorizontal = hasKids ? 'HUG' : 'FIXED';
    // height
    if ((k.height && !pct(k.height)) || k.width?.raw === 'table-cell') n.layoutSizingVertical = 'FIXED'; // table cells share their row's height
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
    if (!node.visible) return; // a hidden layer (a closed panel) takes no space in either place
    const raw = node.getSharedPluginData('sds', 'box');
    if (raw) {
      const b = JSON.parse(raw);
      // Tolerances, both measured: Chrome rounds Inter's normal line height up (19.5px at 16px), Figma's Auto
      // rounds it down (19px), so each line of text may cost half a pixel. And a block that simply fills its
      // parent is as wide as the parent in both tools, even where the browser reports a shrink-wrapped grid cell.
      const fills = node.layoutSizingHorizontal === 'FILL';
      const lines = 'findAllWithCriteria' in node ? node.findAllWithCriteria({ types: ['TEXT'] }).length : 0;
      if ((!fills && Math.abs(node.width - b[2]) > 1) || Math.abs(node.height - b[3]) > 1 + lines * 0.5) rep.size.push(`${path}${node.name}: Figma ${Math.round(node.width * 10) / 10}×${Math.round(node.height * 10) / 10}, browser ${b[2]}×${b[3]}`);
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
      for (const c of each) { const hits = c.findAll((x) => x.name === layer && !insideInstance(x, c)); const boxes = hits.filter((x) => x.type !== 'TEXT'); for (const t of boxes.length ? boxes : hits) { t.componentPropertyReferences = { ...t.componentPropertyReferences, visible: id }; n++; } }
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
  const VALUE_KEYS = new Set(['placeholderColor', 'gap', 'gapRow', 'gapCol', 'bg', 'shadow', 'backdrop', 'filter', 'opacity', 'ink', 'size', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'w', 'color', 'style', 'stroke', 'textColor']);
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
      // a grid whose children all start in the first column is a plain stack (.field: its second track only holds an optional extra)
      if (n.grid) { const xs = (n.kids ?? []).filter((k) => k.pos !== 'absolute' && k.pos !== 'fixed').map((k) => k.box[0]); if (!xs.some((x) => Math.abs(x - xs[0]) > 0.5)) delete n.grid; }
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
      for (const k of Object.keys(o)) { o[k] = prune(o[k]); if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; } // an emptied array too (a variant without radius)
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
    if (!page) { page = figma.createPage(); page.name = def.page; page.backgrounds = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]; }
    if (page.findOne((n) => (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT') && n.name === def.name)) throw new Error(`${def.name} is already on page ${def.page} — update it, do not build it twice`);
    const bottom = page.children.reduce((m, n) => Math.max(m, n.y + n.height), 0);
    const items = [], report = { raw: new Set(), type: new Set(), layout: new Set(), size: [] }; const t0 = Date.now(); const ms = [];
    try {
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
    } catch (e) { for (const it of items) (await figma.getNodeByIdAsync(it.id))?.remove(); throw e; } // a failed build leaves nothing behind
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
