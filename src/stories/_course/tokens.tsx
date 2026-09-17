/**
 * COURSE FILE — not part of figma/sds. See COURSE-NOTES.md.
 *
 * Reads src/theme.css as text and turns it into lists the Foundations pages
 * draw. Nothing here is typed out by hand, so when upstream changes a token
 * these pages follow on the next reload.
 */
import themeCss from "../../theme.css?raw";

export type Token = { name: string; value: string; dark?: string };

const blocks: Record<string, Token[]> = {};
{
  let block = "";
  for (const line of themeCss.split("\n")) {
    const c = line.match(/\/\*\s*(.+?)\s*\*\//);
    if (c && !line.includes("--sds")) block = c[1];
    const d = line.match(/^\s*(--sds-[a-z0-9-]+):\s*(.+);\s*$/);
    if (d && block) (blocks[block] ??= []).push({ name: d[1], value: d[2].trim() });
  }
}
const find = (start: string) =>
  blocks[Object.keys(blocks).find((k) => k.startsWith(start)) ?? ""] ?? [];

const byNumber = (a: Token, b: Token) =>
  a.name.localeCompare(b.name, "en", { numeric: true });

export const colorPrimitives = [...find("color_primitives")].sort(byNumber);
const dark = new Map(find("color: sds_dark").map((t) => [t.name, t.value]));
export const colorSemantic = find("color: sds_light").map((t) => ({
  ...t,
  dark: dark.get(t.name),
}));
export const size = [...find("size")].sort(byNumber);
export const typographyPrimitives = find("typography_primitives");
export const typography = find("typography:");
export const styles = find("styles");

/** `var(--sds-color-brand-800)` → `brand-800` */
export const short = (v: string) =>
  v.replace(/^var\(--sds-(?:color-)?/, "").replace(/\)$/, "");

export const page: React.CSSProperties = {
  color: "var(--sds-color-text-default-default)",
  font: "var(--sds-font-body-base)",
  lineHeight: 1.5,
  maxWidth: 960,
  padding: "var(--sds-size-space-800)",
};
export const mono: React.CSSProperties = {
  font: "var(--sds-font-body-code)",
  fontSize: 12,
};
export const muted: React.CSSProperties = {
  color: "var(--sds-color-text-default-secondary)",
};

export function Page(props: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={page}>
      <h1 style={{ font: "var(--sds-font-title-page)", margin: 0 }}>
        {props.title}
      </h1>
      <p style={{ ...muted, maxWidth: "62ch", margin: "12px 0 40px" }}>
        {props.intro}
      </p>
      {props.children}
    </div>
  );
}

export function Group(props: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ font: "var(--sds-font-heading)", margin: "0 0 4px" }}>
        {props.title}
      </h2>
      {props.note && (
        <p style={{ ...muted, maxWidth: "62ch", margin: "0 0 16px" }}>
          {props.note}
        </p>
      )}
      {props.children}
    </section>
  );
}
