/** COURSE FILE — not part of figma/sds. See COURSE-NOTES.md. */
import type { Meta, StoryObj } from "@storybook/react";
import { Group, Page, mono, muted, size, styles } from "./tokens";

const meta: Meta = {
  title: "Foundations/Size and effects",
  parameters: { layout: "fullscreen", controls: { disable: true } },
};
export default meta;

const px = (v: string) => `${parseFloat(v) * 16}px`;
const group = (g: string) =>
  size.filter(
    (t) => t.name.startsWith(`--sds-size-${g}-`) && !t.name.includes("negative"),
  );
const shadows = styles.filter((t) => t.name.includes("shadow"));

export const SizeAndEffects: StoryObj = {
  name: "Size and effects",
  render: () => (
    <Page
      title="Size and effects"
      intro={
        <>
          One collection holds every number: <code>space</code>,{" "}
          <code>radius</code>, <code>stroke</code>, <code>icon</code>, and the{" "}
          <code>depth</code> and <code>blur</code> values the shadows are built
          from. Values are written in rem in code and shown here in pixels,
          which is what Figma stores.
        </>
      }
    >
      <Group title="Space">
        {group("space").map((t) => (
          <div
            key={t.name}
            style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}
          >
            <div style={{ ...mono, width: 220 }}>
              {t.name.replace("--sds-size-", "")}{" "}
              <span style={muted}>{px(t.value)}</span>
            </div>
            <div
              style={{
                height: 12,
                width: `var(${t.name})`,
                minWidth: 1,
                background: "var(--sds-color-background-brand-default)",
                borderRadius: 2,
              }}
            />
          </div>
        ))}
      </Group>
      <Group title="Radius">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {group("radius").map((t) => (
            <div key={t.name}>
              <div
                style={{
                  width: 96,
                  height: 64,
                  borderRadius: `var(${t.name})`,
                  background: "var(--sds-color-background-default-secondary)",
                  boxShadow:
                    "inset 0 0 0 1px var(--sds-color-border-default-default)",
                }}
              />
              <div style={{ ...mono, marginTop: 6 }}>
                {t.name.replace("--sds-size-", "")}
              </div>
              <div style={{ ...mono, ...muted }}>{px(t.value)}</div>
            </div>
          ))}
        </div>
      </Group>
      <Group
        title="Shadows"
        note="Each shadow is an effect style. Its offsets, blur, spread and colour are all variables, in code and in Figma."
      >
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {shadows.map((t) => (
            <div key={t.name}>
              <div
                style={{
                  width: 120,
                  height: 80,
                  borderRadius: "var(--sds-size-radius-200)",
                  background: "var(--sds-color-background-default-default)",
                  boxShadow: `var(${t.name})`,
                }}
              />
              <div style={{ ...mono, marginTop: 10 }}>
                {t.name.replace("--sds-effects-shadows-", "")}
              </div>
            </div>
          ))}
        </div>
      </Group>
    </Page>
  ),
};
