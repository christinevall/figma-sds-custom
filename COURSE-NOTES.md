# Course notes — system 04

> **This file is ours. The components, tokens and stories are Figma's.**
> SDS is [github.com/figma/sds](https://github.com/figma/sds), MIT, by Figma.
> Cloned 2026-09-17 at commit `6afa4b4` (their push of 2026-09-15).
> Their components, tokens and stories are unchanged. One deliberate exception:
> Storybook was upgraded from 8.6 to 10 for the MCP server, which touched
> `package.json` and three files in `.storybook/` (see `docs/decisions.md`).
> Everything else the course added is a new file, listed below.

This is design system **04** in a course that compares how design systems are
built. The others: `01-base-ui`, `02-shadcn`, `03-altitude`, and Carbon, which
moved to `05`.

## The idea in one paragraph

Figma publishes SDS with a Community file, and their scripts pull tokens *out
of* that Figma file into code. Here it runs the other way, as in system 01:
**the code is the source, and the Figma library is built from it.** The Figma
file *Figma sds* (`e24pu4u3xplVzYuBpTR1Ti`) started empty. Its variables, styles,
icons and components were generated from this repository, with names that match
the code, so a frame that says `Button · variant=neutral, size=small` means
`<Button variant="neutral" size="small">` and nothing else.

## What we added, and nothing else

| Path | What |
| --- | --- |
| `COURSE-NOTES.md` | This file |
| `README.md` (top section only) | *Course edition* intro and the stack explained for beginners. Figma's text below it is unchanged |
| `.claude/launch.json` | Storybook on port **6004** (upstream's script uses 6006) |
| `.claude/skills/ds-inspection/` | The health check ([Brad Frost](https://github.com/bradfrost/skills), MIT), bundled |
| `.claude/skills/figma-mirror/` | How the Figma library is built and updated from this code |
| `src/stories/_course/` | Storybook pages: *Getting started*, *Foundations* (Colour, Typography, Size and effects), the hidden *Mirror* harness, and a **Code** page under every component group (`docs/`: all stories, then the component's `.tsx` and `.css`) |
| `scripts/course/docs-pages.mjs` | Writes those Code pages from `src/stories` and `src/ui`. Run it again after an upstream update |
| `scripts/figma-mirror/` | The pipeline: tokens → Figma, icons → Figma, the probe (browser), the builder (Figma), the upstream check |
| `figma/` | `contracts.json` (what each Figma component is), `token-map.json`, `icon-paths.json`, `manifest.json`, **`GAPS.md`** |
| `docs/decisions.md` | Decisions and why |

## How to see it

```bash
npm ci
npm run storybook      # http://localhost:6004 · MCP: http://localhost:6004/mcp
```

SDS follows the operating system for dark mode (`prefers-color-scheme`). There
is no theme switch, because the code has none.

## "If Figma updates SDS, can I still use this?"

Yes. Almost everything added is a new file, so their updates merge cleanly. The one exception is the Storybook 10 upgrade: `package.json` and `.storybook/` can conflict, and there you keep our Storybook lines.

```bash
git fetch upstream
git log --oneline main..upstream/main      # what is new on their side
git merge upstream/main                    # only package.json and .storybook/ can conflict
node scripts/figma-mirror/check-upstream.mjs
```

The last command compares the code with `figma/manifest.json` (a snapshot taken
when the Figma library was last built) and lists what changed since: tokens,
icons, and components by file. Only those need to go through the mirror again.
Nothing is rebuilt blindly, and nothing is deleted in Figma automatically,
because deleting a variable unbinds it everywhere. That stays a decision for a
person.

Think of it as three layers:

1. **Theirs** — `src/ui`, `src/theme.css`, their stories and scripts. Never edited here. Updates arrive by `git merge`.
2. **Generated from theirs** — the Figma library. Follows layer 1 through the mirror.
3. **Ours** — the files in the table above. Survive every update.

The moment one of *their* files is edited (a rebrand in `theme.css`, a fixed
component), this becomes a fork, and the next merge can conflict in exactly
that file. That is fine, and sometimes the point. Do it on purpose, and write
it down in `docs/decisions.md`.

The remote is called `upstream` and its push address is disabled, so nothing
here can be pushed to Figma's repository by accident. There is no `origin` yet.

## What makes this system different from 01, 02 and 03

- **It was designed in Figma first.** The token names (`background/brand/default`), the 100–1000 ramps and the text styles all started as Figma variables and styles. The code was written to match. You can feel it: almost every value in the CSS is a token.
- **Two token tiers, split by collection.** Primitives (`color/brand/800`, `typography/scale/03`) and semantic tokens (`color/background/brand/default`). Sizes have one tier and are used directly.
- **Every shadow value is a variable**, down to the offsets. No other system in the course does that.
- **React Aria underneath**, not Base UI. States arrive as `data-hovered`, `data-selected`, `data-disabled`.
- **Code Connect files** (`src/figma/`) ship with it. They point at Figma's own file, not ours, and need an Organization or Enterprise plan. See `figma/GAPS.md`.
- **Storybook 10 with the MCP server.** Upstream ships Storybook 8.6. This edition runs 10.6 so `@storybook/addon-mcp` works: an AI assistant in Cursor or Claude can ask Storybook which components exist (http://localhost:6004/mcp). Also added: the accessibility panel, and a *Code* page per component group.
- **The stack, explained for beginners**, is at the top of `README.md`.

## Known gaps

`figma/GAPS.md` lists everything the code does that Figma cannot express, what
was done instead, and a few bugs in upstream's code that the mirror ran into.
Read it before teaching from this system.
