import type { Preview } from "@storybook/react";
import "../src/index.css";
import "../src/theme.css";
import theme from "./theme";

const preview: Preview = {
  parameters: {
    docs: {
      theme: theme,
    },
    // COURSE: sidebar in the order people read a design system, not the alphabet.
    // Group names are renamed in main.tsx (experimental_indexers); the story files keep Figma's titles.
    options: {
      storySort: {
        order: [
          "Getting started",
          "Foundations",
          ["Colour", "Typography", "Size and effects", "Icons"],
          "Components",
          ["*", ["Code", "*"]],
          "Layout",
          ["*", ["Code", "*"]],
          "Patterns",
          ["*", ["Code", "*"]],
          "Utilities",
          "About SDS",
          "*",
        ],
      },
    },
  },

  tags: [],
};

export default preview;
