/**
 * What the admin knows about each content collection: where it lives,
 * which frontmatter fields it has, and how new filenames are generated.
 * Mirrors the zod schemas in src/content.config.ts.
 */
import { slugify, todayStamp } from "../lib/slug";
import type { Frontmatter } from "../lib/frontmatter";

export type FieldType = "text" | "textarea" | "date" | "boolean" | "tags" | "image" | "url";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  /** Filled automatically by cross-posting; shown collapsed under "Advanced". */
  advanced?: boolean;
}

export interface CollectionDef {
  key: string;
  label: string;
  labelSingular: string;
  dir: string;
  fields: Field[];
  hasBody: boolean;
  bodyLabel: string;
  /** Route prefix on the public site, or null if entries have no page of their own. */
  route: string | null;
  supportsCrosspost: boolean;
  supportsNewsletter: boolean;
  newFilename: (data: Frontmatter) => string;
}

const syndicationFields: Field[] = [
  {
    name: "mastodon",
    label: "Mastodon announcement URL",
    type: "url",
    advanced: true,
    help: "Replies to this status appear as comments. Filled automatically when you cross-post.",
  },
  {
    name: "bluesky",
    label: "Bluesky announcement URL",
    type: "url",
    advanced: true,
    help: "Replies to this post appear as comments. Filled automatically when you cross-post.",
  },
];

export const COLLECTIONS: CollectionDef[] = [
  {
    key: "posts",
    label: "Posts",
    labelSingular: "post",
    dir: "src/content/posts",
    hasBody: true,
    bodyLabel: "Body",
    route: "/posts",
    supportsCrosspost: true,
    supportsNewsletter: true,
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea", help: "Shown in lists, feeds and social cards." },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "tags", label: "Tags", type: "tags", help: "Separate with commas." },
      { name: "cover", label: "Cover image", type: "image" },
      { name: "coverAlt", label: "Cover image description (alt text)", type: "text" },
      ...syndicationFields,
    ],
    newFilename: (data) => `${slugify(String(data.title ?? ""))}.md`,
  },
  {
    key: "notes",
    label: "Notes",
    labelSingular: "note",
    dir: "src/content/notes",
    hasBody: true,
    bodyLabel: "Note",
    route: "/notes",
    supportsCrosspost: true,
    supportsNewsletter: false,
    fields: [{ name: "date", label: "Date", type: "date", required: true }, ...syndicationFields],
    newFilename: () => {
      const now = new Date();
      const hm = `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
      return `${todayStamp(now)}-${hm}.md`;
    },
  },
  {
    key: "pages",
    label: "Pages",
    labelSingular: "page",
    dir: "src/content/pages",
    hasBody: true,
    bodyLabel: "Body",
    route: "",
    supportsCrosspost: false,
    supportsNewsletter: false,
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
    ],
    newFilename: (data) => `${slugify(String(data.title ?? ""))}.md`,
  },
  {
    key: "pictures",
    label: "Pictures",
    labelSingular: "picture",
    dir: "src/content/pictures",
    hasBody: true,
    bodyLabel: "Caption",
    route: "/pictures",
    supportsCrosspost: true,
    supportsNewsletter: false,
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "image", label: "Image", type: "image", required: true },
      {
        name: "alt",
        label: "Image description (alt text)",
        type: "textarea",
        required: true,
        help: "Describe the image for people who can't see it. Required.",
      },
      ...syndicationFields,
    ],
    newFilename: (data) =>
      `${todayStamp()}-${slugify(String(data.title || "picture"))}.md`,
  },
  {
    key: "blogroll",
    label: "Blogroll",
    labelSingular: "blogroll entry",
    dir: "src/content/blogroll",
    hasBody: true,
    bodyLabel: "Short description",
    route: null,
    supportsCrosspost: false,
    supportsNewsletter: false,
    fields: [
      { name: "name", label: "Site name", type: "text", required: true },
      { name: "url", label: "URL", type: "url", required: true },
      { name: "image", label: "Preview image", type: "image" },
      { name: "imageAlt", label: "Preview image description (alt text)", type: "text" },
    ],
    newFilename: (data) => `${slugify(String(data.name ?? ""))}.md`,
  },
];

export function collectionByKey(key: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.key === key);
}

/** Public URL path of an entry, e.g. /posts/hello-world — or null for blogroll. */
export function entryRoute(def: CollectionDef, filename: string): string | null {
  if (def.route === null) return null;
  const id = filename.replace(/\.md$/, "");
  return `${def.route}/${id}`;
}
