/** COURSE FILE — not part of figma/sds. See COURSE-NOTES.md. */
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef, useState } from "react";
import { Group, Page, mono, muted, styles, typographyPrimitives } from "./tokens";

const meta: Meta = {
  title: "Foundations/Typography",
  parameters: { layout: "fullscreen", controls: { disable: true } },
};
export default meta;

const textStyles = styles.filter((t) => t.name.startsWith("--sds-font-"));

/** One row per text style, with what the browser actually renders. */
function Row({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [facts, setFacts] = useState("");
  useEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(ref.current);
    setFacts(
      `${parseFloat(cs.fontSize)}px · ${cs.fontWeight}${cs.fontStyle === "italic" ? " italic" : ""} · line-height ${cs.lineHeight}`,
    );
  }, []);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 24,
        alignItems: "baseline",
        padding: "12px 0",
        borderBottom: "1px solid var(--sds-color-border-default-default)",
      }}
    >
      <div>
        <div style={mono}>{name}</div>
        <div style={{ ...mono, ...muted }}>{facts}</div>
      </div>
      <div
        ref={ref}
        style={{
          font: `var(${name})`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        The quick brown fox
      </div>
    </div>
  );
}

export const TextStyles: StoryObj = {
  name: "Text styles",
  render: () => (
    <Page
      title="Typography"
      intro={
        <>
          Sixteen text styles. In code each one is a single{" "}
          <code>font</code> shorthand: style, weight, size, family. Line height
          is not part of it, so the browser falls back to <code>normal</code>{" "}
          unless a component sets its own. That is why the rows below report{" "}
          <code>line-height normal</code>, and why the matching Figma text
          styles use Auto.
        </>
      }
    >
      <Group title="Text styles">
        {textStyles.map((t) => (
          <Row key={t.name} name={t.name} />
        ))}
      </Group>
      <Group
        title="Primitives"
        note="Families, the type scale and the weights the text styles choose from."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "4px 24px",
          }}
        >
          {typographyPrimitives.map((t) => (
            <div key={t.name} style={{ ...mono, display: "flex", gap: 8 }}>
              <span>{t.name.replace("--sds-typography-", "")}</span>
              <span style={muted}>{t.value}</span>
            </div>
          ))}
        </div>
      </Group>
    </Page>
  ),
};
