import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./src/config/site";

export default defineConfig({
  site: SITE.url,
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/admin"),
    }),
  ],
});
