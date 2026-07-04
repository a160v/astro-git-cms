import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The desktop app reuses the content-model core from ../src (schema,
// frontmatter, slugs) — plain TypeScript with no framework dependencies.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
