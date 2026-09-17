/** COURSE FILE — not part of figma/sds. See COURSE-NOTES.md. */
import type { Meta, StoryObj } from "@storybook/react";
import * as icons from "icons";
import type { IconProps } from "primitives";
import { Page, mono, muted } from "./tokens";

const meta: Meta = {
  title: "Foundations/Icons",
  parameters: { layout: "fullscreen", controls: { disable: true } },
};
export default meta;

const all = Object.entries(icons).filter(([name]) =>
  name.startsWith("Icon"),
) as [string, (props: IconProps) => React.ReactNode][];

export const Icons: StoryObj = {
  render: () => (
    <Page
      title="Icons"
      intro={
        <>
          {all.length} icons, each its own React component:{" "}
          <code>{"<IconArrowLeft />"}</code>. They are stroked lines on a 16px
          grid, sized with the <code>size</code> prop (14 to 48) and coloured by the
          component around them. The same icons are components in the Figma
          library, with the same names.
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        {all.map(([name, I]) => {
          return (
            <div
              key={name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: 12,
                borderRadius: "var(--sds-size-radius-200)",
                boxShadow:
                  "inset 0 0 0 1px var(--sds-color-border-default-default)",
              }}
            >
              <I size="24" />
              <span style={{ ...mono, ...muted, fontSize: 11 }}>
                {name.replace(/^Icon/, "")}
              </span>
            </div>
          );
        })}
      </div>
    </Page>
  ),
};
