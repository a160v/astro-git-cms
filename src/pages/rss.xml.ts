import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SITE } from "~/config/site";
import { getPublished, byDateDesc } from "~/lib/content";

export async function GET(context: APIContext) {
  const posts = (await getPublished("posts"))
    .filter((post) => !post.data.draft)
    .sort(byDateDesc);
  return rss({
    title: `${SITE.title} — Posts`,
    description: SITE.description,
    site: context.site ?? SITE.url,
    trailingSlash: false,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/posts/${post.id}`,
      categories: [...post.data.tags],
    })),
    customData: `<language>${SITE.locale}</language>`,
  });
}
