# Decisions — 04 Figma SDS

Decisions that shape this system, with the reason. Newest first. Anything Figma cannot express lives in `figma/GAPS.md`, not here.

## 2026-09-18

**The Figma library is complete: 46 components, 223 variants, Cover, Tokens, a documentation frame on every page.**
The second half of the components (Textarea to Footer) went in through the same probe → builder pipeline. Everything the pipeline could not express was fixed in the pipeline, not by hand in Figma, so a rebuild gives the same result; the few hand edits (the AvatarGroup restructure) are recorded in `figma/GAPS.md`. What the pipeline learned, in `probe.browser.js` and `builder.figma.js`: a textarea's `rows` height and top alignment; the line box around an inline icon; a closed panel (`max-height: 0`) is a hidden layer; `margin: 0 auto`, side margins and per-child margin tokens become wrapper frames; a CSS grid with a spanning child keeps its column positions; a raw SVG keeps its fill or stroke token, rotation and z-index, and is rescaled so strokes follow; inline `<sup>` text is a row; adjacent text nodes on one line are one text layer; a widthless flex child that takes the rest of a row (or column) fills; an instance squeezed by flex is resized; a nested instance takes the text colour it inherits; a `100%` root and a `max-width` child are fixed at the measured size; a one-line centred text as wide as its block hugs.

**Nested components are instances.** `figma/contracts.json` `$insts` now covers Image, AvatarBlock, TextPrice, TextContentHeading, TextContentTitle, Notification, AccordionItem, MenuItem and Logo, so the cards and the menu hold real instances.

**Menu without sections, Accordion opened through the group.** `MenuSection` and `MenuHeader` are plain divs that a React Aria `Menu` drops, so the Menu is composed as upstream's own story is. An `AccordionItem` inside an `Accordion` opens only through `defaultExpandedKeys` on the group. Both are in GAPS as upstream findings.

**Big calls travel compressed.** The harness refuses `fetch` of code from a public URL inside `figma_execute`, and the plugin cannot reach localhost, so a 41 KB Table spec was carried as a 7 KB literal with an eight-line decoder that checks the length before running (`scripts/figma-mirror/lz.mjs`).

**Cover updated:** Storybook 10, the public Storybook and the GitHub fork as links, a Code Connect note (SDS ships the files, they need an Organization plan, the names here already match the code).

## 2026-09-17

**Sidebar in reading order, with plain group names.**
Getting started → Foundations (with a new Icons page) → Components → Layout → Patterns → Utilities → About SDS. Figma's story titles ("SDS Primitives/Buttons") are renamed when Storybook indexes them (`experimental_indexers` in `.storybook/main.tsx`), so their story files stay untouched. Story URLs change with the names: `components-buttons--code` instead of `sds-primitives-buttons--code`. Getting started now shows the README's plain-words stack section, read from the README itself.

**GitHub and a public Storybook.**
The existing fork `christinevall/sds` had no commits of its own, so it was renamed to `figma-sds-custom` and updated; it keeps GitHub's "forked from figma/sds" label. `.github/workflows/main.yml` (upstream's) now builds only Storybook on Node 22 and publishes it to GitHub Pages: https://christinevall.github.io/figma-sds-custom/. `.npmrc` sets `legacy-peer-deps` so `npm ci` behaves the same locally and in CI.

**Name: "Figma SDS, customized", folder `04-figma-sds-custom`.**
It has to be obvious that the system is Figma's and that Christine changes and adds to it. Future GitHub repo: `figma-sds-custom`. The MIT licence and Figma's copyright stay in `LICENSE`.

**The stack, for beginners, at the top of `README.md`.**
Christine wanted it where people land first. It is a block above Figma's text, which stays word for word. On an upstream merge, a README conflict is resolved by keeping both.

**Storybook 8.6 → 10, the first edit to upstream files.**
Christine needs the Storybook MCP server (`@storybook/addon-mcp`), which exists for Storybook 10 only. Edited: `package.json` and `package-lock.json` (Storybook packages, `storybook` script now on port 6004), `.storybook/main.tsx` (addons docs, a11y, mcp; `import.meta.dirname`; an alias so two upstream stories keep importing `@storybook/preview-api`), `.storybook/manager.tsx` and `.storybook/theme.tsx` (new import paths). No component or story was changed. A future `git merge upstream/main` can conflict in exactly these files; keep ours for the Storybook lines. Installed with `--legacy-peer-deps` so the rest of upstream's lockfile stays as it was.

**The code is the source; the Figma file is built from it.**
Figma's own setup runs the other way (their scripts export tokens from their Community file). Christine wanted her own library, made the way systems 01 to 03 are: names and values come from the code, so a frame can be read back as code. Their Community file is not used.

**Not one upstream file is edited.**
Every addition is a new file (list in `COURSE-NOTES.md`). That is what keeps `git merge upstream/main` free of conflicts. It has a price: no theme toggle in Storybook (the code only follows the operating system), no changed sidebar order, no fixed upstream bugs. Those are recorded, not repaired.

**`src/theme.css` is the token source, not `scripts/tokens/tokens.json`.**
`theme.css` is what the components consume. `tokens.json` is upstream's export of *their* Figma file and carries things the CSS never emits (a third colour mode, `brand_b_light`; a `responsive` collection). It is only used to split a CSS name into a path, because hyphens alone cannot tell `default-hover` from `default` / `hover`.

**Naming: the token path joined by `/`, lower case; code syntax is the real CSS variable.**
`--sds-color-background-brand-default` is `color/background/brand/default`. The same rule as system 01, so the two libraries read alike. Upstream's own Figma names are Title Case (`Background/Brand/Default`).

**Typography primitives are grouped by kind.**
Upstream's keys are flat: `family-sans`, `scale-03`, `weight-bold`. In Figma they are `typography/family/sans`, `typography/scale/03`, `typography/weight/bold`, so the variable panel groups them. The CSS name is the same either way.

**Collections: primitives hidden, semantics offered.**
*Color Primitives* and *Typography Primitives* have no scopes and are hidden from publishing. *Color*, *Size* and *Typography* are what a designer picks from, each scoped to where it belongs (a text colour never shows in a fill picker). Exception: the black alpha ramp has the effect-colour scope, because the shadows use those primitives directly, as the code does.

**Reading order, not the alphabet.**
Ramps run white, black, gray, slate, brand, then the status colours; roles run default, brand, neutral, positive, warning, danger, disabled, utilities; sizes run space, radius, stroke, icon, depth, blur. `theme.css` is alphabetical because a script wrote it.

**Component properties are the code's props, verbatim.**
`variant=primary`, `size=medium`, `isDisabled=false`: never `Size=Medium`. States React Aria decides from outside (a Tab's `isSelected`, set by the Tabs around it) are named as React Aria names them. Hover, pressed and focus are not props, so they are not variants (see `figma/GAPS.md`).

**Icons passed as children get two properties.**
In code a Button's icons are just children: `<Button><IconArrowLeft />Label</Button>`. In Figma that is `hasIconStart` (show it) and `iconStart` (swap it). One Figma name cannot be both a boolean and an instance swap.

**Components are measured, not transcribed.**
A probe reads each rendered component in Storybook and follows every value back to its `--sds-*` token; a builder draws it in Figma with those tokens bound and compares the size with the browser's, to the pixel. Reason: SDS routes values through local custom properties (`--button-background-color`), switched by classes and data attributes. The browser already knows which rule wins. Whatever does not end in exactly one token is reported, and that report is where `figma/GAPS.md` comes from.

**A hidden "Mirror" story renders any component with any props.**
Upstream's stories show a handful of combinations. The mirror needs all of them. `src/stories/_course/Mirror.stories.tsx` is tagged `!dev`, so it does not show in the sidebar.

**Port 6004.** Fixed ports let two Storybooks run side by side in a demo. Carbon moves to 05 and 6005.
