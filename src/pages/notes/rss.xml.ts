import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SITE } from "~/config/site";
import { getPublished, byDateDesc } from "~/lib/content";

export async function GET(context: APIContext) {
  const notes = (await getPublished("notes"))
    .filter((note) => !note.data.draft)
    .sort(byDateDesc);
  return rss({
    title: `${SITE.title} — Notes`,
    description: `Short notes from ${SITE.title}.`,
    site: context.site ?? SITE.url,
    trailingSlash: false,
    items: notes.map((note) => ({
      title: `Note from ${note.data.date.toISOString().slice(0, 10)}`,
      description: note.body ?? "",
      pubDate: note.data.date,
      link: `/notes/${note.id}`,
    })),
    customData: `<language>${SITE.locale}</language>`,
  });
}
