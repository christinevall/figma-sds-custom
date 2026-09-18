---
name: figma-mirror
description: Build or update the "Figma sds" library so it mirrors this repository — variables and styles from src/theme.css, icons from src/ui/icons, components from the rendered code. Use when asked to add, build, sync, update, mirror or "push" something to Figma, after `git merge upstream/main`, or when check-upstream.mjs reports a difference. Code is the source; Figma follows it.
---

# Figma mirror — SDS code → Figma

The Figma library (file `e24pu4u3xplVzYuBpTR1Ti`, *Figma sds*) is generated
from this repository. It is never the source. SDS is Figma's code: **do not
edit their files to make the mirror easier.** Everything here lives in
`scripts/figma-mirror/`, `figma/` and `src/stories/_course/`.

The general rules (naming, properties, what goes in GAPS) are the course's and
are the same as in system 01. What is different here is *how*: system 01 reads
hand-written CSS; SDS routes every value through local custom properties
switched by classes and data attributes, so this mirror **measures the rendered
component** instead of parsing its stylesheet.

## The pipeline

```
src/theme.css ──tokens-to-figma.mjs──▶ variables, text styles, effect styles
src/ui/icons  ──icons.mjs────────────▶ Icons page (one Vector per icon)
figma/contracts.json ─┐
Storybook :6004 ──────┴─probe.browser.js──▶ spec ──builder.figma.js──▶ component set
                              │                         │
                              └── gaps (no single token) └── report (raw values, size vs browser)
```

| File | Runs in | Does |
| --- | --- | --- |
| `scripts/figma-mirror/tokens-to-figma.mjs` | Node | `theme.css` → the variable / style payload. `--summary`, `--map` |
| `scripts/figma-mirror/icons.mjs` | Node | every icon's path data. `--batch from to` for one Figma call |
| `src/stories/_course/Mirror.stories.tsx` | Storybook | renders any component with any props from JSON in the URL |
| `scripts/figma-mirror/probe.browser.js` | the Storybook page | measures a rendered component and follows each value back to its `--sds-*` token |
| `scripts/figma-mirror/builder.figma.js` | Figma (Console MCP) | spec → auto-layout frames with every value bound, variants, properties; audits size against the browser |
| `scripts/figma-mirror/pack.mjs` | Node | strips comments so the builder fits one `figma_execute` call |
| `scripts/figma-mirror/lz.mjs` | Node | squeezes a call that is too big to carry (a 41 KB Table spec → 7 KB): prints a literal plus its decoder, which checks the length before running |
| `scripts/figma-mirror/check-upstream.mjs` | Node | what changed in the code since the library was built |
| `figma/contracts.json` | — | one entry per Figma component: props → variants, what to render, which text / boolean / swap properties |
| `figma/GAPS.md` | — | what Figma cannot express, and what was done instead |

## Before you start

1. Storybook must run on **6004** (`.claude/launch.json`). The Figma file must
   be open with the Console MCP Desktop Bridge plugin running.
2. Install the builder once per Figma session: `node scripts/figma-mirror/pack.mjs`,
   paste the output into `figma_execute`, then `return await __sds.init()`.
   Expect `{ vars: 333, text: 16, effects: 15, icons: 287 }` or the current counts.
3. In the Storybook tab: `const m = await import('/scripts/figma-mirror/probe.browser.js?v=' + Date.now())`.
4. Figma writes are strictly sequential. Browser probing can run meanwhile.
5. **Keep the Browser pane visible.** A hidden pane throttles the page. The probe
   avoids timers for that reason, but a visible pane is still several times faster.

## One component

1. Read its `.tsx`, its `.css` and its story. Write the contract in
   `figma/contracts.json`:
   - `props`: every prop that changes the look, **default value first**; names
     and values verbatim. State that a parent decides (`isSelected` on a Tab)
     goes in `virtual` and is fed through `$map`.
   - `mirror`: the JSON the harness renders. `"$props": true` spreads the
     variant's props. `layer` names a Figma layer. `inst` marks a nested
     library component.
   - `text` / `bool` / `swap` / `hiddenText`: the properties, by sample text or
     layer name. `boolDefaults` for parts that start hidden.
   - `width` for anything that fills its container (fields, cards).
   - `description`: starts `Contract — <source>:` and names every prop, its
     values and its default.
2. `await m.figmaCall('<Name>')` → `{ code, gaps }`. Read `gaps` first: each one
   is either a probe bug to fix or a line for `figma/GAPS.md`.
3. Paste `code` into `figma_execute` (timeout 30000). Read the `report`:
   `raw` must be empty or explained, `size` must be empty (Figma within 1px of
   the browser), `layout` lists grid and margin translations for GAPS.
4. Screenshot the set and compare it with Storybook. Look, do not assume.
5. `node scripts/figma-mirror/check-upstream.mjs --write`, commit the contract,
   any GAPS entry and the manifest together.

Build order: icons → atoms (Button, IconButton, Tag, Avatar, fields) → what
contains them (ButtonGroup, Search, Notification, Pagination, Dialog) →
compositions. The shared `$insts` rules in `contracts.json` turn any `.button`,
`.avatar`, `.field` … found inside another component into a real instance with
its properties read off the DOM, so **a component must exist before anything
that contains it is built.**

## Tokens or icons changed

1. `node scripts/figma-mirror/tokens-to-figma.mjs --summary` must say "no warnings".
2. Compare the payload with the live variables and apply only the differences:
   create what is missing, update changed values. **List, do not delete**, what
   the payload no longer contains: deleting a variable unbinds it everywhere.
3. New icons: `icons.mjs --batch`, through `__sdsIcons` (see the builder's
   header). Regenerate `figma/token-map.json` and `figma/icon-paths.json`.

## Figma behaviours that bit, here

- `loadFontAsync(style.fontName)` hangs for some styles because `fontName`
  carries `variationSettings`. Load by `{ family, style }` only.
- A new frame has `strokesIncludedInLayout = true` in this file. An inset
  box-shadow border must switch it off, a real CSS border keeps it on.
- The plugin sandbox cannot `fetch` localhost, whatever the manifest allows.
  Specs travel through the conversation; that is why they are compacted
  (token names only, variants as differences from the default).
- A BOOLEAN property's default hides the layer in the main component too, so
  lay the variant grid out **after** wiring properties.
- `display: contents`, visually-hidden inputs and `display: none` icons are
  skipped by the probe. If a layer is missing, check there first.
- The harness refuses `fetch` of code from a public URL inside `figma_execute`
  ("code from external"), so the builder and the cover script travel as text.
  For anything over ~10 KB run it through `lz.mjs` and paste that instead.
- The builder's `component()` uses its own `unpack`; a variant that *drops* a key
  (a Card with no radius) needs the source's prune fix. If you run an older
  installed builder, call `def.items = __sds.unpack(def.items)` before
  `__sds.component(def)`.
- While the session is not on screen the Browser pane is hidden and a probe of
  a big component takes a minute or two. Start it in the background
  (`window.pending = m.figmaCall(name).then(...)`) and poll, instead of waiting
  in one `javascript_tool` call (it times out at 45 s).
- `figma.createFrame()` lands on the *current* page until the builder moves it.
  A failed build can leave stray frames on the Cover page: check it at the end.

## Always, before you finish

Update **`figma/GAPS.md` → "Status, open points and uncertainties"** in the same
commit as the work. Not optional, and not replaced by a summary in chat:

- what was checked, and how (size report, token report, looked at, not looked at);
- every difference left in, with both numbers;
- everything done by hand in Figma that a rebuild would not reproduce;
- everything not verified or not understood, written as uncertain;
- anything the next person needs to know to work on the file.

A component page's own notes (`$pages` in `contracts.json`, shown in its
documentation frame) get the designer-facing part of the same facts.

## When to stop

Stop and ask, rather than invent, when the code does not answer the question:
no text style fits, a state cannot be reached from props, a value only exists
at runtime. Record it in `figma/GAPS.md`, skip that part, carry on.
