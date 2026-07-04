/**
 * Standalone ("headless") build of the admin app.
 *
 *   bun run build:admin   → dist-admin/  (a self-contained static app)
 *   bun run dev:admin     → local dev server for the admin alone
 *
 * The output has no coupling to this repo's theme: host it anywhere
 * (Cloudflare Pages, Codeberg Pages, a subfolder of an existing site, a
 * desktop shell) and connect it to any GitHub or Forgejo repository.
 * Relative asset paths mean it works from any URL path.
 */
import { defineConfig } from "vite";

export default defineConfig({
  root: "admin",
  base: "./",
  publicDir: "public",
  build: {
    outDir: "../dist-admin",
    emptyOutDir: true,
  },
});
