# Where Figma cannot mirror the code exactly

Every entry is a decision, not an oversight: what the code does, what Figma
does instead, and why. The list is not written from memory. The probe reports
every value that does not end in exactly one `--sds-*` token, and the builder
reports every layer whose size differs from the browser's by more than a pixel.
Anything not listed here is expected to match.

**Read the last section first** if you are about to rely on this file or rebuild
it: [Status, open points and uncertainties](#status-open-points-and-uncertainties)
says what was checked, what was only assumed, and what was fixed by hand.

How to read the "How to deal with it" column: **keep** means the difference is
accepted and documented; **code** means the real fix is a change in the code
(upstream's, so: an issue or a pull request for Figma, not an edit here);
**ours** means the course could close it without touching upstream files.

## Tokens

| Code | Figma | Why | How to deal with it |
| --- | --- | --- | --- |
| A text style is one `font` shorthand: style, weight, size, family. **No line height.** The browser falls back to `normal` (about 1.21 for Inter) | Text styles use line height **Auto**, which is the same thing. `font/body-base` has 160% and the two `font/single-line/*` styles 100% | `Text` adds `line-height: 1.6` itself (`--global-line-height-body`), and controls set `line-height: 1`. Neither is part of the token | keep. Code: line height belongs in the text style tokens |
| `--sds-font-single-line-body-base` has the same value as `--sds-font-body-base` | The single-line style carries 100% line height | In Figma's own file the two differ by line height only, and their export drops line height. The builder picks the single-line twin whenever the code renders `line-height: 1` | keep |
| Button small, Tag, Navigation: `font-body-small` at `line-height: 1`, and there is no `single-line/body-small` | No text style: family, size and weight bound one by one, line height 100% raw, node marked `textStyle` | Figma cannot override one field of a text style without detaching it | code: add the missing single-line styles. Until then: keep |
| `--global-line-height-body: 1.6`, `--global-line-height-paragraph: 1.4`, `--global-focus-ring-color: rgb(0,106,255)`, `--global-container-max-width: 75rem` … (`src/index.css`) | Raw values | They are CSS variables but not design tokens: not in `theme.css`, not in any collection | keep. Code: promote the ones that are decisions |
| Weights with italics are one value: `--sds-typography-weight-bold-italic: 700 italic` | A STRING variable with the font style name, `Bold Italic`, scoped to font style | CSS packs weight and style together; Figma has a style name | keep |
| Font family is `"inter", sans-serif` | `Inter` | Figma needs the one real family name | keep |
| `--sds-size-radius-full: 624.9375rem` | 9999 | The same pill, written in rem | keep |
| Sizes are rem | Pixels (× 16) | Figma has no rem. `html { font-size: 16px }` is fixed in `index.css`, so nothing is lost today | keep |
| Icon sizes 14, 16, 20 and 48 come from the **type scale**: `--icon-diameter: var(--sds-typography-scale-03)` | Width and height bound to `typography/scale/03` | That is what the code says. The variable is scoped to font size, so it will not show in a width picker; the binding was set through the API | keep. Code: `size/icon` has only three steps, the type scale fills in for the rest |
| An icon inside a Button takes the button's **text** colour: `--icon-color: var(--button-color)` → `color/text/brand/on-brand` | The icon's stroke is bound to that text variable | Same: faithful, but a text-scoped variable on a stroke. `color/icon/*` exists and mirrors `color/text/*` value for value | keep |
| Dark mode follows `prefers-color-scheme` only | `Light` and `Dark` modes on the *Color* collection | No class or attribute to switch in code, so Storybook has no theme toggle either | keep. Ours would need an edit to `theme.css` |
| `scripts/tokens/tokens.json` has a third colour mode, `brand_b_light`, and a `responsive` collection | Not mirrored | `theme.css` never emits them, so no component can use them | keep |
| `src/responsive.css`: `--sds-responsive-*` change at 600px and 1024px | Not mirrored | Breakpoint behaviour. Components are drawn at desktop width | keep |
| `white` and `black` ramps are one colour at ten opacities | COLOR variables with alpha, exact (`#0c0c0db2` is 178/255, Figma shows 70%) | — | keep |
| Shadows | Effect styles with **every** value bound: offsets, blur, spread (`size/depth/*`, `size/blur/*`) and colour (`color/black/*`) | The code does it that way too. The black primitives are scoped to effect colour for this reason | keep |
| `effects/backdrop-filter/blur-overlay` and `blur-glass` are the same value | Two effect styles | The code has two names | keep |

## Values with no token

Found by the probe. In Figma they are raw numbers, and the node is marked
(`sharedPluginData sds/raw`) so an audit knows it is deliberate.

| Where | Code | In Figma | How to deal with it |
| --- | --- | --- | --- |
| Input, Select trigger, Search | `padding-block: calc(space-300 − stroke-border × 2)` = 10px | 10 | keep. A `calc()` of two tokens has no Figma equivalent; variables cannot do arithmetic |
| Search | `padding-right: calc(space-800 + space-100)` = 36px, room for the button | 36 | keep |
| Switch | `width: calc(space-400 + space-600)` = 40px | 40 | keep |
| Avatar initials | SVG `<text>` at 40 units in a 100-unit viewBox, so it scales with the avatar: 9.6, 12.8, 16px | A text layer at those sizes, no text style | keep. Resize an avatar in Figma and the initials do not follow |
| Dialog | `max-width: 32rem`, `width: calc(100% − 2 × space-400)` | 512 wide | keep |
| Tooltip | `max-width: calc(32rem / 2)` | 256 wide | keep |
| Image | heights `10rem` / `20rem` / `30rem`, `aspect-ratio` | Fixed sizes | keep. Code: sizes that are decisions could be tokens |
| TextList | `padding-left: 1rem` | 16 | keep |
| Icons | `strokeWidth="1.6"` on a 16-unit viewBox, scaling with the icon | 1.6, and it does **not** scale when an instance is resized | keep. Use the Scale tool (K), or accept thinner strokes on large icons |
| TextPrice | currency `font-size: 0.6em` | Raw size | keep |
| Textarea | No height: the browser sizes a `<textarea>` by its `rows` (the default is 2) | Fixed at 68.8 | keep. Code: a height token, or `rows` as a prop |
| Accordion chevron, Notification icon, Logo | An inline `<svg>` inside a block sits in a line box taller than itself (24 for a 20px icon) | The span has that fixed height; the icon stays at its top | keep. It is what the browser draws |
| Tooltip arrow | Two `<svg>` paths, filled from CSS, rotated per placement, the inner one shifted by `1.5 × stroke-border` | Two vectors with the fills bound, rotated, at the measured offsets | keep |
| Logo | An inline SVG whose paths stroke with `var(--logo-color)` | The vector, rescaled to `size/icon/small` so the stroke scales with it, stroke bound to `color/icon/default/default` | keep |
| Image inside a horizontal Card | `flex-shrink` squeezes the 160px image to 108 / 93 / 87px | The Image instance is resized to the measured width (marked `sds/resized`) | keep. Faithful: the code squeezes it too |

## Things Figma has no concept for

| Code | Figma | Why | How to deal with it |
| --- | --- | --- | --- |
| `:hover`, `[data-hovered]`, `[data-pressed]`, `[data-focus-visible]` styles | Not mirrored | They are states, not props, so they are not in the contract. Every hover token exists as a variable (`…/hover`) | keep. Candidate for prototype interactions later |
| Focus ring: a `::before` with `box-shadow: 0 0 0 2px` | Not mirrored | Only while focused | keep |
| `box-shadow: inset 0 0 0 1px <colour>` used as a border that takes no space | An inside stroke, not counted in layout, width bound to `size/stroke/border` | Same pixels | keep |
| A real `border` | An inside stroke that **is** counted in layout | A CSS border adds to the box | keep |
| `margin` (field labels and descriptions, list titles) | Spacing on the parent when it is the same everywhere, bound to the margin's token; otherwise a wrapper frame named `… · margin` with that padding | Figma has no margin | keep. The builder's report names each case |
| CSS grid (`.field`, `.checkbox-field`, `.avatar-block`) | One column: a vertical stack. More columns: a row of `column n` frames, track widths bound to their token | Auto layout has no grid areas | keep |
| Grid rows align items **across** columns (the checkbox sits centred on the label's first line) | The column gets raw top padding to match | No cross-column alignment in auto layout | keep |
| `.checkbox-field`'s first track is `space-300` (12px) and the 16px box overflows it | Column 1 is 12 wide, not clipped, and the box overflows the same way | Faithful, odd, and worth a look upstream | code |
| `currentColor`, inherited `color` | The token the element ends up with, set on each layer | Figma has no inheritance. Change a parent's colour and children do not follow | keep |
| `display: contents` wrappers, React Aria's visually-hidden inputs | Not drawn | They draw nothing | keep |
| Popovers (Menu, Select list, Tooltip) are positioned at runtime | The popup is its own component, drawn at rest | Position only exists while open | keep |
| Slider: thumb and fill sit at `value` | Drawn at 50 of 0–100 | A runtime value. Two thumbs (a range) are not drawn | keep |
| Accordion panel height animates; `max-height: 0` when closed | Open shows the panel, closed has none | Motion is not in the contract | keep |
| `useMediaQuery`: Card goes vertical on phones, PaginationList hides, TextContentTitle drops a size | Desktop only | Breakpoint behaviour | keep |
| An image | A placeholder fill (`color/background/default/tertiary`), node marked `image` | The plugin cannot load a local file | keep. Drop your own picture on it |
| `margin: 0 auto` on a child narrower than its column (the open Accordion panel) | A wrapper frame that fills the column and centres it (`… · margin`) | Figma has no per-child alignment; `layoutAlign` is deprecated and ignored | keep |
| `margin-left` / `margin-right` on a child of a column (the Menu separator's `space/400`) | A wrapper that fills the column, its side padding bound to the margin tokens | Same: Figma has no margin | keep |
| Adjacent children with different margins, each a token (the Dialog: description `space/200`, buttons `space/600`) | Each child in a wrapper whose top padding is bound to its own token; the frame keeps the CSS gap | One frame has one item spacing | keep |
| AvatarGroup overlaps avatars with `margin-left: calc(-space-300 + gap)` and keeps `gap: space-300` before the +n badge | An `avatars` frame whose item spacing is bound to the spacing token (`size/space/200` … `size/space/negative-300`), inside the group frame at `space/300`. Negative variants get `effects/shadows/drop-shadow-200` on each avatar, as the CSS does | The net distance between avatars *is* the token; a calc() is not | keep |
| A `<textarea>`'s text starts at the top whatever `align-items` says | Top-aligned | `align-items: center` on a textarea does nothing in a browser | keep |
| An inline element next to text in a block (`<sup>$</sup>50` in TextPrice) | A row, the children at the line's top | Inline formatting has no auto-layout equivalent; MIN is 2px off the raised `<sup>` | keep |
| A positioned child with `z-index` (the Tooltip arrow over the dialog border) | Moved to the top of its parent | Layer order is z-order | keep |
| A flex child that is neither sized nor `flex-grow` but takes what is left of the row (the content of a horizontal Card, wrapping its text) | Fill | Flex shrinks both children; Figma needs one to fill | keep |
| The Dialog sheet is `width: 100%` of the viewport | Fixed at 1280, the mirror's viewport | A root has no container | keep |

## Properties

| Component | Code | Figma | Why |
| --- | --- | --- | --- |
| Button, ButtonDanger | Icons are children: `<Button><IconArrowLeft />Label</Button>` | `hasIconStart` / `hasIconEnd` (boolean) and `iconStart` / `iconEnd` (swap) | Children have no names. A Figma property name cannot be both a boolean and a swap |
| IconButton | `aria-label` is required and renders nothing | A hidden text layer bound to a TEXT property | The frame has to carry the accessible name back |
| Tag | `onRemove` is a function | A boolean `onRemove` that shows the remove button | Its presence is what changes the look |
| TagToggle, Tab, RadioField, MenuItem | `isSelected` / `isDisabled` come from the parent (`selectedKeys`, `value`, `disabledKeys`) | Variant properties on the item, named as React Aria names the state | A designer selects the item, not the group. Coming back: the selected item's key is the group's value |
| Input, Textarea, Select | Placeholder through `::placeholder`, value replaces it | A variant `hasValue`, with `placeholder` and `value` as separate TEXT properties | One layer, two colours, two texts |
| Card | `padding` is optional (`"600" \| "800"`) | `padding=0` stands for leaving it out | A variant needs a value |
| Nested components (a Button in a Card, an IconButton in Search) | — | Real instances, exposed, properties read off the DOM | So a Button inside a Card is still a Button |

## Not mirrored, by decision

| What | Why |
| --- | --- |
| `Text`, `TextSmall`, `TextStrong`, `TextHeading` … | Each is one text style. Use the style (`font/body-base`, `font/heading` …); a component would add nothing but a layer |
| `Link`, `TextLink` | `font/body-link` |
| `Flex`, `Grid`, `Section` (`src/ui/layout`) | Auto layout *is* these. Upstream says the same in its README |
| `Fieldset`, `Legend`, `FieldGroup`, `Form` | Layout only |
| `Header`, `Hero`, `Panel` | Page furniture tied to demo data and auth state (`useAuth`). Table and Footer are mirrored (see above); these three are open |
| `src/figma/**` (Code Connect) | They map to node ids in **Figma's** Community file, not this one. Pointing them here means editing upstream files |

## Found in upstream's code while mirroring

Not ours to fix here. Each is worth an issue on `figma/sds`.

| Where | What |
| --- | --- |
| `text.css` | `.text-list-item { font: var(--sds-font-body) }` and `.text-input { font: var(--sds-font-input) }`: neither variable exists in `theme.css`. The rule is dropped and the list item inherits |
| `text.css` | `.text-line-height-body` is declared **before** `.text-body-small`, `.text-body-strong` and the rest, and their `font` shorthand resets line height. So `lineHeight="body"` only ever works on `Text`; `TextSmall` with the same prop renders `normal` |
| `Accordion.tsx` | `AccordionItem` takes `isExpanded` and `isDisabled` out of its props and never passes them on. They do nothing; `defaultExpanded` works because it travels in `...props` |
| `Tag.tsx` | `Tag` spreads `...props` and then sets `className`, so a `className` passed to `Tag` is thrown away |
| `checkbox.css` | `grid-template-columns: var(--sds-size-space-300) 1fr` for a 16px box (see above) |
| `tab.css` | No `[data-disabled]` rule: a disabled Tab looks exactly like an enabled one. The Figma variant `isDisabled=true` is identical on purpose |
| `menu.css` | `.menu-item` is `grid-template-columns: 1fr auto` and puts the icon in the first, `1fr`, column. With an icon the label and description are pushed to the far right of the item (label at x=160 in a 264px item). Mirrored as it renders |
| `Menu.tsx` | `MenuSection` and `MenuHeader` are plain `<div>`s. Inside a React Aria `Menu` the collection ignores them and everything in them, so a Menu with sections renders empty. Upstream's own story does not use them; neither does the mirror |
| `Accordion.tsx` | Inside a `DisclosureGroup` an item's `defaultExpanded` is ignored (the group owns the state through `defaultExpandedKeys`), so the only way to open an `AccordionItem` in an `Accordion` is a key on the group |
| Type check | On a clean `npm ci` at commit `6afa4b4`, `npx tsc --noEmit` reports 7 errors, all in upstream files (`Button.tsx` 4, `AnchorOrButton.tsx` 2, `Tag.figma.ts` 1). Their `app:build` script starts with `tsc`, so it stops there. Storybook is not affected. The course files add none |
| Storybook | Upstream is on Storybook 8.6. Upgraded here to 10 (2026-09-17) for the MCP server; see `docs/decisions.md` |

## Status, open points and uncertainties

Last updated 2026-09-18. The tables above say where Figma *cannot* match the
code. This section says how sure we are about the rest. **It is always kept:**
every mirror session ends by updating it (see "The rule" at the bottom).

### What was checked, and how

| Check | How | Covers |
| --- | --- | --- |
| Size | The builder compares every layer with the browser's box: more than 1px off (plus 0.5px per text layer inside) is reported | All 46 components, every variant |
| Tokens | The builder lists every value that is not bound to a variable or style | All 46 |
| Look | A screenshot of each component set, read by eye against what the code should draw. **Not** overlaid on a browser screenshot | The 29 sets built on 2026-09-18, one by one. The first 17 by the earlier session (Button page, CheckboxField, SliderField, Search looked at; the others size-checked only) |
| Upstream snapshot | `check-upstream.mjs --write` after the build: 333 variables, 16 text styles, 15 effect styles, 287 icons, 46 components | Code ↔ manifest, not Figma ↔ code |
| Storybook | The public build passed after the push | Build only |

### Small differences left in (measured, accepted)

| Where | Figma | Browser | Why |
| --- | --- | --- | --- |
| Any hugging text: a Button label, "Tab three", `⌘K` | 75, 97, 32 wide | 73.29, 95.55, 30.75 | Figma and Chrome set Inter a pixel or two apart |
| Text at line-height `normal` | 19 tall (16px Inter) | 19.5 | Same. It adds up: MenuItem 66 vs 67, Menu 223 vs 226 |
| `card-asset` in a horizontal Card | 160 tall | 168.69 | The browser stretches the empty wrapper to the row. The image inside is 160 in both |
| Notification's icon wrapper | 20 tall | 24 | Built before the probe learned the line box around an inline icon. Nothing visible moves. A rebuild fixes it |
| TextPrice `$` | At the line's top | 2px lower (`<sup>`) | Inline formatting has no auto-layout equivalent |
| ProductInfoCard's Image | The default Image variant, resized to 232 | `size="natural"` | `natural` and `fill` are not drawn as Image variants |
| Tooltip | At rest | `position: absolute` with runtime insets | Position only exists while open |
| Dialog sheet, Pagination, Footer | 1280, 1248, 1200 wide | `100%` | The mirror's viewport. Resize the instance |

### Fixed by hand in Figma

A rebuild from the pipeline would **not** reproduce the first two. The rest are
in the pipeline now, but see the first row of the next table.

| What | Done in Figma | In the pipeline? |
| --- | --- | --- |
| AvatarGroup | Avatars moved into an `avatars` frame spaced by the spacing token, group gap bound to `space/300`, `+2` made one text layer wired to `overflow`, drop shadow on the avatars of the negative variants | **No.** The probe now merges `+` and `2` by itself; the structure and the shadow are hand work. Open |
| Footer logo | Stroke bound to `color/icon/brand/on-brand` | **No.** The brand Section sets `--logo-color`. The probe carries an inherited `color` into a nested instance, but not inherited custom properties (`--logo-color`, `--icon-color`). Open, and worth checking wherever an icon or logo instance sits on a brand surface |
| SliderField and NavigationPill labels | Text set to hug (it was fill-width inside a hugging frame, so a longer label would have wrapped) | Cause not found. The builder's rule should already give a hug. A scan of the whole library found only these two |
| TextareaField (top alignment), Tooltip (centred text hugs, arrow above the border), Dialog sheet and Pagination (fixed width), Footer (270px columns), ProductInfoCard (description fills), PricingCard (brand price is on-brand) | Patched in place after the build | Yes, as probe or builder rules |
| Cover | Component count typed as 48, corrected to 46 (the contracts file has two entries, `$insts` and `$pages`, that are not components). Code Connect note set to fill | The numbers on the Cover are **passed in by hand** when the script runs. Count components, do not count contract keys |

### Not verified, or not sure

| What | Why it matters |
| --- | --- |
| **The committed builder and probe have not run end to end.** On 2026-09-18 Figma ran the builder installed at the start of the session plus patches applied live; each patch was then written into the source. The source is syntax-checked, not executed | The first rebuild of any component is the real test of those rules. Build one simple and one complex component (Tab, Card) and compare the reports before trusting a batch |
| Dark mode | No component built on 2026-09-18 was looked at in Dark. Every colour is bound to a semantic variable, so it should follow. Not seen |
| Component properties in use | The builder reports how many layers each property is wired to. Nobody has toggled them on an instance. Known problem: **MenuItem with `hasIcon=false` keeps the empty fill column, so the label stays on the right; in code, without an icon, the label is on the left** |
| Boolean properties and layout in general | Hiding a part (`hasDescription`, `hasLabel`, `asset`) was not checked against the code's layout without that part |
| Exposed nested instances | Set by the builder, not tried |
| Using the library from another file | The file is not published as a library or to the Community. Nothing was instantiated outside it |
| The first 17 components | Built and checked by the earlier session. This session only scanned them for one text-sizing pattern |
| Icons, variables, styles | Not re-checked in Figma this session. The manifest matches the code |
| The thumbnail | Holds **pictures** of the Overview and Tokens sheets. They go stale when a sheet changes: re-export them (the thumbnail step of `cover.figma.js`) |
| Images | Placeholder fills everywhere. The plugin cannot load a local file |

### Things to know when working on it

- **Figma must be on screen.** With its window hidden, `loadFontAsync` stalls for 15 to 30 seconds every few calls. Load each font once (the builder and the cover script do).
- **The Browser pane must be visible** or a probe of a large component takes minutes. Start it in the background and poll.
- **Code cannot be fetched into the plugin.** Not from localhost, and a public URL is refused by the harness. Scripts and large specs are pasted; over about 10 KB use `scripts/figma-mirror/lz.mjs`.
- **A plugin restart forgets the installed builder.** Re-install it (and the cover script) before the next call.
- **New frames land on the current page first.** A failed build can leave strays on whatever page is open: look at the Cover page at the end of a session.
- **A probe can fail once for no reason** while the pane is hidden (a detached document, "nothing drawn"). Run it again before debugging.

### The rule

Every session that touches the mirror ends by updating this section, in the
same commit as the work: what was checked and how, what was left different and
by how much, what was done by hand, and what is not known. A chat message is
not documentation. If something is uncertain, it is written here as uncertain,
not left out.
