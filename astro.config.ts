import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./src/config/site";
import { rehypeBasePaths } from "./src/lib/rehype-base";

// Sub-path support. Comes from SITE.basePath; the deploy script can override
// it with the SITE_BASE env var without editing config.
const base = process.env.SITE_BASE || SITE.basePath;

export default defineConfig({
  site: SITE.url,
  base,
  // Prefix root-absolute links/images written in Markdown bodies with the base.
  markdown: {
    rehypePlugins: [[rehypeBasePaths, base]],
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/admin"),
    }),
  ],
});
