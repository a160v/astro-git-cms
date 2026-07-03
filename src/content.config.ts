import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Shared fields for anything that can receive comments from
 * the fediverse (Mastodon) or the atmosphere (Bluesky).
 * The admin fills these in automatically when you cross-post.
 */
const syndication = {
  /** URL of the Mastodon status announcing this entry. Replies to it become comments. */
  mastodon: z.string().url().optional(),
  /** URL of the Bluesky post announcing this entry. Replies to it become comments. */
  bluesky: z.string().url().optional(),
};

/** Long-form writing. */
const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    /** Path to a cover image, e.g. /uploads/2026/07/cover.jpg */
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    ...syndication,
  }),
});

/** Short, title-less thoughts — a microblog. */
const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    ...syndication,
  }),
});

/** Standalone pages (About, Now, Contact…), served at /<id>. */
const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

/** A photo feed. Each entry is one picture with a required alt text. */
const pictures = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pictures" }),
  schema: z.object({
    title: z.string().optional(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    /** Path to the image, e.g. /uploads/2026/07/photo.jpg */
    image: z.string(),
    /** Alternative text is required — no exceptions. */
    alt: z.string(),
    ...syndication,
  }),
});

/** Sites you follow, shown as a visual grid. */
const blogroll = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blogroll" }),
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
    /** Optional preview image/avatar for the card. */
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts, notes, pages, pictures, blogroll };
