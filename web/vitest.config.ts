// Component tests for the Pattern Lab panels — the one place React behaviour
// (pointer gestures, keyboard shortcuts, undo, selection, the Director's
// keyframes) is exercised under a DOM. The rest of the test surface is the
// bespoke `check:*` smoke scripts; this is the harness they could not be.
//
//   npm run check:panels          (part of check:ci)
//
// jsdom has no canvas; test/setup.ts stubs a 2D context that accepts the
// calls the panels make and asserts nothing about pixels on screen — the
// tests read the layer's RGBA buffer in the store instead, which is what the
// device receives.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    restoreMocks: true,
  },
});
