/** COURSE FILE — not part of figma/sds. See COURSE-NOTES.md. */
import type { Meta, StoryObj } from "@storybook/react";
import {
  Group,
  Page,
  colorPrimitives,
  colorSemantic,
  mono,
  muted,
  short,
} from "./tokens";

const meta: Meta = {
  title: "Foundations/Colour",
  parameters: { layout: "fullscreen", controls: { disable: true } },
};
export default meta;

const CATEGORIES = ["background", "text", "icon", "border"] as const;
const ROLES = [
  "default",
  "brand",
  "neutral",
  "positive",
  "warning",
  "danger",
  "disabled",
  "utilities",
];

export const Semantic: StoryObj = {
  render: () => (
    <Page
      title="Colour · semantic"
      intro={
        <>
          The layer components use. A name says what the colour is for:{" "}
          <code>background</code>, <code>text</code>, <code>icon</code> or{" "}
          <code>border</code>, then the role, then the variant. Each one points
          at a primitive, once for light and once for dark. SDS follows your
          operating system: switch it to dark and the swatches change, the names
          do not.
        </>
      }
    >
      {CATEGORIES.map((category) => (
        <Group key={category} title={category}>
          {ROLES.map((role) => {
            const tokens = colorSemantic.filter((t) =>
              t.name.startsWith(`--sds-color-${category}-${role}-`),
            );
            if (!tokens.length) return null;
            return (
              <div key={role} style={{ marginBottom: 24 }}>
                <div style={{ ...mono, ...muted, marginBottom: 8 }}>
                  {category} / {role}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 8,
                  }}
                >
                  {tokens.map((t) => (
                    <div
                      key={t.name}
                      style={{ display: "flex", gap: 12, alignItems: "center" }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          flexShrink: 0,
                          borderRadius: "var(--sds-size-radius-200)",
                          boxShadow:
                            "inset 0 0 0 1px var(--sds-color-border-default-default)",
                          background: `var(${t.name})`,
                        }}
                      />
                      <div>
                        <div style={mono}>
                          {t.name.replace(`--sds-color-${category}-${role}-`, "")}
                        </div>
                        <div style={{ ...mono, ...muted }}>
                          {short(t.value)} · {short(t.dark ?? "")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Group>
      ))}
    </Page>
  ),
};

const RAMPS = [
  "white",
  "black",
  "gray",
  "slate",
  "brand",
  "red",
  "yellow",
  "green",
  "pink",
];

export const Primitives: StoryObj = {
  render: () => (
    <Page
      title="Colour · primitives"
      intro={
        <>
          The raw ramps. A primitive says what a colour is, not what it is for,
          so components never use these directly. <code>white</code> and{" "}
          <code>black</code> are not ramps of greys: they are one colour at ten
          opacities, which is why they sit on a checkerboard here.{" "}
          <code>brand</code> ships with the same values as <code>gray</code>.
          That is the slot you would rebrand.
        </>
      }
    >
      {RAMPS.map((ramp) => (
        <div
          key={ramp}
          style={{
            display: "grid",
            gridTemplateColumns: "72px 1fr",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={mono}>{ramp}</div>
          <div
            style={{
              display: "flex",
              borderRadius: "var(--sds-size-radius-200)",
              overflow: "hidden",
              boxShadow:
                "inset 0 0 0 1px var(--sds-color-border-default-default)",
              background:
                "repeating-conic-gradient(#d9d9d9 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px",
            }}
          >
            {colorPrimitives
              .filter((t) => t.name.startsWith(`--sds-color-${ramp}-`))
              .map((t) => (
                <div
                  key={t.name}
                  title={`${t.name}: ${t.value}`}
                  style={{
                    flex: 1,
                    height: 56,
                    background: `var(${t.name})`,
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 6,
                  }}
                >
                  <span
                    style={{
                      ...mono,
                      fontSize: 10,
                      background: "#ffffffcc",
                      color: "#1e1e1e",
                      padding: "0 3px",
                      borderRadius: 2,
                    }}
                  >
                    {t.name.split("-").pop()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </Page>
  ),
};
