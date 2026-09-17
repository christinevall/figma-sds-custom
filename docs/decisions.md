# Decisions — 04 Figma SDS

Decisions that shape this system, with the reason. Newest first. Anything Figma cannot express lives in `figma/GAPS.md`, not here.

## 2026-09-17

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
