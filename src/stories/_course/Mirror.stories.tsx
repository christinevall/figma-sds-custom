/**
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 * The mirror harness: renders any SDS component with any props, from a small
 * JSON description in the URL. The Figma mirror uses it to render every
 * variant of a component (upstream's own stories only show a few), so the
 * probe can measure it.
 *
 *   /iframe.html?id=course-mirror--mirror&mirror=<encoded JSON>
 *
 *   { "c": "Button", "p": { "variant": "neutral" },
 *     "k": [{ "c": "IconArrowLeft", "layer": "iconStart" }, "Label"] }
 *
 * `c` is any export of primitives, icons, layout or compositions. A prop value
 * that is itself `{ "c": … }` is rendered as an element (iconStart, and so on).
 * `layer` names the layer in Figma. `inst: { set, props }` says "this part is
 * the library's own <set>": Figma then places an instance instead of redrawing
 * it. Hidden from the sidebar: it is a tool, not
 * documentation.
 */
import type { Meta, StoryObj } from "@storybook/react";
import * as compositions from "compositions";
import * as icons from "icons";
import { placeholder } from "images";
import * as layout from "layout";
import * as primitives from "primitives";
import { createElement, type ReactNode } from "react";

type Node =
  | string
  | { c: string; p?: Record<string, unknown>; k?: Node[]; layer?: string; inst?: unknown };

const registry: Record<string, unknown> = {
  ...compositions,
  ...layout,
  ...icons,
  ...primitives,
};

const isNode = (v: unknown): v is Exclude<Node, string> =>
  !!v && typeof v === "object" && "c" in (v as object);

function render(node: Node, key?: number): ReactNode {
  if (typeof node === "string") return node;
  const isTag = /^[a-z]/.test(node.c);
  const Component = isTag ? node.c : registry[node.c];
  if (!Component) throw new Error(`Mirror: "${node.c}" is not exported by SDS`);
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.p ?? {})) {
    props[name] =
      value === "$placeholder" ? placeholder
      : value === "$noop" ? () => {}
      : isNode(value) ? render(value)
      : Array.isArray(value) && value.every(isNode) ? value.map((v, i) => render(v, i))
      : value;
  }
  if (node.layer) props.className = [props.className, `layer-${node.layer}`].filter(Boolean).join(" ");
  // `inst` rides along as a class, so the probe can tell the builder "this is a Button, use an instance"
  if (node.inst) props.className = [props.className, `inst-${btoa(JSON.stringify(node.inst))}`].filter(Boolean).join(" ");
  const children = node.k?.map((k, i) => render(k, i));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createElement(Component as any, props, ...(children ?? []));
}

const meta: Meta = {
  title: "Course/Mirror",
  tags: ["!dev", "!autodocs"],
  parameters: { layout: "centered" },
};
export default meta;

export const Mirror: StoryObj = {
  render: () => {
    const raw = new URLSearchParams(window.location.search).get("mirror");
    if (!raw) return <p>Pass ?mirror=&lt;JSON&gt;. See the comment in this file.</p>;
    const spec = JSON.parse(raw) as Node | { width?: number; node: Node };
    const node = "node" in (spec as object) ? (spec as { node: Node }).node : (spec as Node);
    const width = "node" in (spec as object) ? (spec as { width?: number }).width : undefined;
    return (
      <div id="mirror-root" style={{ width, display: width ? "block" : "contents" }}>
        {render(node)}
      </div>
    );
  },
};
