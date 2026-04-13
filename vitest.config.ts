import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    // Playwright tests live in e2e/ and have their own runner
    exclude: ["node_modules", "e2e", ".next", "out"],
  },
});
