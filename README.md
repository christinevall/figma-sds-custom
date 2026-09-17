# Figma Simple Design System, customized

> **Based on [figma/sds](https://github.com/figma/sds) (MIT, © Figma), customized by Christine Vallaure.**
> **Live Storybook:** https://christinevall.github.io/figma-sds-custom/
>
> The components, tokens and stories are Figma's. What was changed or added is marked, and listed in [`COURSE-NOTES.md`](COURSE-NOTES.md).
>
> **Course edition — system 04 of the *AI Design System* course by moonlearning.io.**
> Everything below the line "Figma's original README" is Figma's own text, unchanged.
> What the course added, and why, is in [`COURSE-NOTES.md`](COURSE-NOTES.md).

## In plain words: what is in here?

**A design system in code is the same idea as a Figma library.** Figma has components, variables and styles. The code has the same three things, just written as text files that a browser can show.

| In Figma you know… | In this code it is… | Written in… |
| --- | --- | --- |
| A component (Button) with variants | A **React component** (`Button.tsx`) with **props** (`variant="primary"`) | React + TypeScript |
| Variables (colours, spacing) | **Design tokens**: CSS variables like `--sds-color-background-brand-default` | `src/theme.css` |
| The look of a component (fills, padding, radius) | A **stylesheet** that uses those tokens | one `.css` file per component |
| A library file you open to browse | **Storybook**, a website that shows every component and state | http://localhost:6004 or the live link |

**React** is the most common way to build web interfaces from reusable pieces. You write a piece once (a Button) and reuse it everywhere, just like a Figma component. **Props** are its component properties.

### How a colour gets from Figma to the screen

Take the dark background of the primary button.

1. **Figma:** Figma's designers defined a variable `Background/Brand/Default`, pointing at the colour `Brand/800` (#2C2C2C) in Light mode.
2. **Export:** a script in this repository (`scripts/tokens`) read those variables and wrote them into one text file, `src/theme.css`:
   `--sds-color-background-brand-default: var(--sds-color-brand-800);`
3. **Component:** the button's stylesheet does not say "#2C2C2C". It says "use the brand background token":
   `--button-background-color: var(--sds-color-background-brand-default);`
4. **Browser:** when the page loads, the browser looks the token up and paints #2C2C2C. In dark mode it looks up the dark value instead.

So **change the token once, and every component that uses it changes**. That is the whole point of tokens, in Figma and in code.

In this customized edition the direction is also reversed: the course reads `theme.css` and the components, and *builds* the Figma library from them, so Figma always matches what the code really does.

### Words you will hear

| Word | Means |
| --- | --- |
| **Repository (repo)** | The project folder, with its full history of changes. This one lives on GitHub |
| **Fork** | A copy of someone else's repository that you can change. This is a fork of Figma's |
| **npm / Node** | The tools that install and run everything. You type `npm run storybook`, they do the rest |
| **Build** | Turning the source files into a finished website. The live Storybook is a build |
| **Token** | A named design decision (a colour, a spacing step) that code and Figma share |
| **Primitive / semantic token** | *What* a value is (`brand-800`) / *what it is for* (`background/brand/default`). Components only use semantic ones |
| **Story** | One example of a component in one state, shown in Storybook |
| **MCP** | A plug that lets an AI assistant (Cursor, Claude) look things up in a tool, here: which components exist in Storybook |
| **Code Connect** | A Figma feature that shows the real code in Dev Mode. Needs an Organization or Enterprise plan |

## The stack, tool by tool

A design system in code is not one tool but a small chain of them. This is SDS's chain, from the bottom up. You do not need to know how to write any of it to use the system. It helps to know what each piece is *for*.

| Tool | Version | What it is, in one sentence | What it does in SDS | Where you see it |
| --- | --- | --- | --- | --- |
| **Node.js + npm** | — | The engine that runs JavaScript tools on your computer, and the app store for them | Installs everything (`npm ci`) and starts Storybook (`npm run storybook`) | Terminal |
| **React** | 18.3 | A library for building interfaces out of reusable pieces, called components | Every SDS component is a React component: `<Button variant="primary">` | `src/ui/**/*.tsx` |
| **TypeScript** | 5.9 | JavaScript that says which values are allowed | Lists each prop and its options, e.g. `variant: "primary" \| "neutral" \| "subtle"`. The Figma variants use exactly these names | the types at the top of each `.tsx` |
| **React Aria Components** (by Adobe) | 1.13 | Invisible behaviour, no looks: keyboard, focus, screen readers | Makes a Button a real button, a Menu keyboard-friendly, a Dialog trap focus. It also reports states (`data-hovered`, `data-selected`) that the CSS styles | inside every component; states in the browser's inspector |
| **Plain CSS with custom properties** | — | Normal stylesheets, where every value is a variable | One `.css` file next to each component. Colours, spacing and radii are all tokens: `var(--sds-color-background-brand-default)` | `src/ui/**/*.css` |
| **Design tokens** | — | Named design decisions: a colour, a spacing step, a text style | Two tiers: *primitives* (what a value is, `brand-800`) and *semantic tokens* (what it is for, `background/brand/default`), with Light and Dark | `src/theme.css` · Storybook → Foundations · Figma variables |
| **Vite** | 6.4 | A fast development server and bundler | Shows your code change in the browser within a second | runs quietly under Storybook |
| **Storybook** | **10.6** | A workshop where each component is shown on its own, in all its states | Getting started, Foundations, every story, and a *Code* page with the component's `.tsx` and `.css` | http://localhost:6004 |
| **Storybook MCP** (`@storybook/addon-mcp`) | 10.6 | A connection that lets an AI assistant ask Storybook questions | Cursor or Claude can look up which components and stories really exist instead of guessing. **The reason this edition moved from Storybook 8 to 10**: the MCP addon only exists for 10 | http://localhost:6004/mcp · `.cursor/mcp.json` · `.mcp.json` |
| **Storybook a11y** (`@storybook/addon-a11y`) | 10.6 | An accessibility checker | Flags contrast and labelling problems per story | Storybook → Accessibility panel |

### Two pipelines between Figma and code

SDS comes with Figma's pipeline. The course added a second one that runs the other way.

| | **Figma's pipeline** (ships with SDS) | **The course's mirror** (added here) |
| --- | --- | --- |
| Direction | Figma → code | Code → Figma |
| Source of truth | Figma's Community file | this repository |
| Tokens | `scripts/tokens` reads Figma's variables (REST API, Enterprise plan, or a plugin export) and writes `src/theme.css` | `scripts/figma-mirror/tokens-to-figma.mjs` reads `src/theme.css` and creates the Figma variables and styles |
| Icons | `scripts/icons` turns Figma icons into React components | `scripts/figma-mirror/icons.mjs` turns the React icons into Figma components |
| Components | built by hand in Figma, connected with **Code Connect** | measured in the browser (the *probe*) and drawn in Figma with every value bound (the *builder*), through the **Figma Console MCP** plugin |
| Keeping in sync | Code Connect snippets in Dev Mode | `scripts/figma-mirror/check-upstream.mjs` lists what changed in code since the library was built |
| Plan needed | Code Connect: **Organization or Enterprise**. Not available on Pro | any plan, Figma desktop app |

**Code Connect** (`@figma/code-connect` 1.4, files in `src/figma/`) shows the real code for a component in Figma's Dev Mode. SDS ships these files for Figma's own file. On a Pro account you cannot publish them, and in this edition they are not connected. Because the course library uses the code's names and props one to one, most of what Code Connect gives you is already there: the layer says `Button · variant=neutral, size=small`, and that is the code.

---

*Figma's original README:*

Using Figma's [Code Connect](https://github.com/figma/code-connect).

Simple Design System (SDS) is a base design system that shows how Figma’s Variables, Styles, Components, and Code Connect can be used alongside a React codebase to form a complete picture of a responsive web design system.

SDS is not just another design system in Figma. There are still many gaps between design and development, and SDS provides some best practices for how to bridge them. SDS tries to remain honest about its implications in code, while also offering customizability in design beyond the simple theming layer that is typical of many code-first component libraries.

Whether you’re looking to use SDS to start a new project, or are looking for examples of some common design systems best practices, you'll find tools inside this codebase and design file to steer you in the right direction.

## Resources

- [Storybook](https://figma.github.io/sds/storybook)
- [Figma Community File](https://www.figma.com/community/file/1380235722331273046/simple-design-system)

## Setup

- `npm i` to install dependencies
- `npm run app:dev` will run server at [localhost:8000](http://localhost:8000) which renders contents of [App.tsx](src/App.tsx)
- `npm run storybook` to start storybook at [localhost:6006](http://localhost:6006)

### Figma Auth

- [Create a Figma API token](https://www.figma.com/developers/api#authentication) and request the following scopes to work with Code Connect
  - ```file_code_connect_scope:write``` - to work with Code Connect
  - [More on Code Connect scopes](https://developers.figma.com/docs/code-connect/quickstart-guide/#before-you-begin)

and these scopes, if you want to use the integrations in [scripts](./scripts/)
  - ```file_dev_resources:read```- Read dev resources in files.
  - ```file_dev_resources:write``` - Write dev resources to files
  - ```file_variables:read``` - Read variables in files. Note: Enterprise plan only.
  - ```file_variables:write``` - Write variables and collections in files. Note: Enterprise plan only.
  - ```file_metadata:read``` - Read metadata of files.
  - ```file_versions:read``` - Read the version history for files you can access.
  - [More on REST API scopes](https://www.figma.com/developers/api#authentication-scopes)
- Duplicate [.env-rename](./.env-rename)
- Rename it to `.env`, it will be ignored by git.
  - Set `FIGMA_ACCESS_TOKEN=` as your token in `.env`
  - Set `FIGMA_FILE_KEY=` as your file's key (grab it from the file URL) in `.env`

### Code Connect

SDS is fully backed by Figma's Code Connect. This includes examples for how to connect [primitives](./src/figma/primitives/), as well as [compositions](./src/figma/compositions/) of those primitives for your design system.

This repo utilizes `documentUrlSubstitutions` in [figma.config.json](./figma.config.json). This allows us to keep our templates Figma file-agnostic and colocates all the Figma file-specific information for easy url swapping. The document URL substitutions are also named in a way that helps you find the associated component without clicking a link. A key `<FIGMA_INPUTS_CHECKBOX_GROUP>` is broken down as `<FIGMA_[PAGE_NAME]_[COMPONENT_NAME]>`.

```json
{
  "documentUrlSubstitutions": {
    "<FIGMA_INPUTS_CHECKBOX_GROUP>": "https://figma.com/design/whatever?node-id=123-456"
  }
}
```

Allows us to have more expressive URLs in our Code Connect templates:

```ts
// url=<FIGMA_INPUTS_CHECKBOX_GROUP>
```

### Connecting this repo to a duplicated Figma file

With the above in mind, a fresh clone of the Simple Design System Figma file should maintain all the node-ids. The steps should be as follows:

- Duplicate the [Figma Community File](https://www.figma.com/community/file/1380235722331273046/simple-design-system)
- Clone this repo
- Update urls in [figma.config.json](./figma.config.json) to point to your Figma file
  - Note: the file keys (eg. `J0KLPKXiONDRssXD1AX9Oi`) should be the only change in the urls unless you're creating new components, detaching and recreating.
- Create and set your [Figma Auth Token](#figma-auth)
- At that point, `npx figma connect publish` should work and your new file should have Code Connect.

## Structure

All components and styles are in [src/ui](./src/ui). Within that directory, code is broken down into a few categories.

### [src/ui/compositions](./src/ui/compositions/)

Example arrangements of primitive components to demonstrate how you might use SDS to build a responsive website.

### [src/ui/hooks](./src/ui/hooks/)

Custom React hook definitions

### [src/ui/icons](./src/ui/icons/)

All icon components. Automatically generated by [scripts/icons](./scripts/icons)

### [src/ui/images](./src/ui/images/)

Placeholder images.

### [src/ui/layout](./src/ui/layout/)

Layout components. Crucial to SDS layouts, but do not have analogous component in Figma.

### [src/ui/primitives](./src/ui/primitives/)

The main component library. SDS primitives can't be reduced further into sub components.

### [src/ui/providers](./src/ui/providers/)

Custom React provider definitions

### [src/ui/utils](./src/ui/utils/)

Custom utilities and utility components

### Code Connect and Storybook

All Code Connect templates and Storybook stories follow the same categorization are defined in [src/figma](./src/figma) and [src/stories](./src/stories).

## Scripts

Some example integrations are available in `scripts` directory. They may require additional API scope that your org may or may not have access to. Where possible, there are some plugin examples to help fill gaps.

### [scripts/component-metadata](./scripts/component-metadata)

- Scripts to run in the JS Console in Figma
- Bulk manage descriptions for all components in the file. Instead of making a complicated plugin, you can do this more simply by running scripts directly from the JavaScript console.
- Copy the contents of [scripts/component-metadata/exportComponentJSON.js](./scripts/component-metadata/exportComponentJSON.js) and run in the console with the file open.
  - "Copy as object" the result and paste into [scripts/component-metadata/components.json](./scripts/component-metadata/components.json).
- There you can modify descriptions more easily.
- Once you have modified the descriptions, copy the JSON and paste at the top of [scripts/component-metadata/importComponentJSON.js](./scripts/component-metadata/importComponentJSON.js) as the value of the `json` variable.
- Copy all the contents of the import file and run in the console to batch update descriptions for the entire file.
- **This will only update the descriptions.** To update Dev Resources, you can use [scripts/dev-resources](#scriptsdev-resources).

### [scripts/dev-resources](./scripts/dev-resources)

- `npm run script:dev-resources` (REST API only)
- Sets dev resources for all components described in [scripts/dev-resources/devResources.mjs](./scripts/dev-resources/devResources.mjs) to match.
- Useful when swapping urls in bulk. Requires `Dev Resources: Write` scope on your REST API token.

### [scripts/icons](./scripts/icons)

- `npm run script:icons:rest`
- Gets all icons from the file, and generates components in the [src/ui/icons](./src/ui/icons) directory.
- Also generates [src/figma/icons/Icons.figma.batch.json](./src/figma/icons/Icons.figma.batch.json) for Code Connect.
- `npm run script:icons` regenerates those outputs from the checked-in [scripts/icons/icons.json](./scripts/icons/icons.json) cache without calling the REST API.

### [scripts/tokens](./scripts/tokens)

- `npm run script:tokens:rest`
- Gets all variables and styles from Figma, and converts them to [src/theme.css](./src/theme.css).
- Creates [scripts/tokens/tokensCodeSyntaxes.js](./scripts/tokens/tokensCodeSyntaxes.js) which is a script you can run in the JS console in Figma to update all the variable's [codeSyntaxes](https://www.figma.com/plugin-docs/api/Variable/#codesyntax) with CSS that matches this repo.
- Includes some example plugins for how to get the same data without the Variables REST API.
  - [Install plugins](https://www.figma.com/plugin-docs/plugin-quickstart-guide/) in Development
  - Run plugins, and copy plugin outputs into [scripts/tokens/styles.json](./scripts/tokens/styles.json) and [scripts/tokens/tokens.json](./scripts/tokens/tokens.json)
  - Run `npm run script:tokens` (without `:rest`) and it will reference the JSON files directly without making a REST API request to update them
