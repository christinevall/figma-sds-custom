import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";
import { toId } from "storybook/internal/csf";

const config: StorybookConfig = {
  stories: [
    "../src/stories/**/*.mdx",
    "../src/stories/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],

  addons: [
    "@storybook/addon-links",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    // COURSE: the Storybook MCP server, so an AI can ask Storybook which components exist
    "@storybook/addon-mcp",
  ],

  // COURSE: plain group names in the sidebar (Components, Patterns …). The story files keep
  // Figma's titles ("SDS Primitives/Buttons"); only the index Storybook builds is renamed.
  // The id is rebuilt from the new title too: the browser derives ids from the index title,
  // so a renamed title with an old id makes every story "not found".
  experimental_indexers: async (existing) =>
    (existing ?? []).map((indexer) => ({
      ...indexer,
      createIndex: async (fileName, options) =>
        (await indexer.createIndex(fileName, options)).map((entry) => {
          const title = entry.title
            ?.replace(/^SDS Primitives\//, "Components/")
            .replace(/^SDS Compositions\//, "Patterns/")
            .replace(/^SDS Layout\//, "Layout/")
            .replace(/^SDS Hooks\//, "Utilities/")
            .replace(/^SDS\//, "About SDS/");
          if (!title || title === entry.title || !entry.__id) return { ...entry, title };
          const story = entry.__id.split("--")[1];
          return { ...entry, title, __id: `${toId(title, "x").split("--")[0]}--${story}` };
        }),
    })),

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  docs: {},

  viteFinal: async (config) => {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // COURSE: Storybook 10 moved this package into "storybook"; two upstream stories still import the old name
        "@storybook/preview-api": "storybook/preview-api",
        compositions: path.resolve(import.meta.dirname, "/src/ui/compositions"),
        hooks: path.resolve(import.meta.dirname, "/src/ui/hooks"),
        icons: path.resolve(import.meta.dirname, "/src/ui/icons"),
        images: path.resolve(import.meta.dirname, "/src/ui/images"),
        layout: path.resolve(import.meta.dirname, "/src/ui/layout"),
        primitives: path.resolve(import.meta.dirname, "/src/ui/primitives"),
        providers: path.resolve(import.meta.dirname, "/src/ui/providers"),
        utils: path.resolve(import.meta.dirname, "/src/ui/utils"),
      };
    }

    return config;
  },

  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};
export default config;
