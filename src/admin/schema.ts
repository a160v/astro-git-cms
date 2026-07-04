/**
 * What the admin knows about each content collection: where it lives,
 * which frontmatter fields it has, and how new filenames are generated.
 *
 * The definitions below are the defaults, mirroring this repo's zod schemas
 * in src/content.config.ts. When the admin connects to a repository that
 * contains a `cms.config.json` at its root, that file replaces them — so the
 * same admin build can manage any site's content model (headless mode).
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
  /** Short line shown on the dashboard card. */
  description?: string;
  dir: string;
  fields: Field[];
  hasBody: boolean;
  bodyLabel: string;
  /** Route prefix on the public site, or null if entries have no page of their own. */
  route: string | null;
  supportsCrosspost: boolean;
  supportsNewsletter: boolean;
  /**
   * Pattern for new filenames. Tokens: {slug} (from the title/name field),
   * {date} (yyyy-mm-dd, UTC), {time} (hhmm, UTC). ".md" is appended.
   */
  filename: string;
}

export interface UploadsConfig {
  /** Repo directory images are committed to (dated subfolders are added). */
  dir: string;
  /** URL prefix that directory is served under on the public site. */
  publicBase: string;
}

export interface CmsConfig {
  collections: CollectionDef[];
  uploads: UploadsConfig;
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

export const DEFAULT_UPLOADS: UploadsConfig = {
  dir: "public/uploads",
  publicBase: "/uploads",
};

export const DEFAULT_COLLECTIONS: CollectionDef[] = [
  {
    key: "posts",
    label: "Posts",
    labelSingular: "post",
    description: "Long-form writing",
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
    filename: "{slug}",
  },
  {
    key: "notes",
    label: "Notes",
    labelSingular: "note",
    description: "Short thoughts, microblog-style",
    dir: "src/content/notes",
    hasBody: true,
    bodyLabel: "Note",
    route: "/notes",
    supportsCrosspost: true,
    supportsNewsletter: false,
    fields: [{ name: "date", label: "Date", type: "date", required: true }, ...syndicationFields],
    filename: "{date}-{time}",
  },
  {
    key: "pages",
    label: "Pages",
    labelSingular: "page",
    description: "About, contact and other standalone pages",
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
    filename: "{slug}",
  },
  {
    key: "pictures",
    label: "Pictures",
    labelSingular: "picture",
    description: "Your photo feed",
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
    filename: "{date}-{slug}",
  },
  {
    key: "blogroll",
    label: "Blogroll",
    labelSingular: "blogroll entry",
    description: "Sites you recommend",
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
    filename: "{slug}",
  },
];

export function defaultConfig(): CmsConfig {
  return { collections: DEFAULT_COLLECTIONS, uploads: DEFAULT_UPLOADS };
}

/** Render a collection's filename pattern for a new entry. */
export function renderFilename(def: CollectionDef, data: Frontmatter, now: Date = new Date()): string {
  const source = String(data.title ?? data.name ?? "").trim();
  const slug = source ? slugify(source) : slugify(def.labelSingular) || "entry";
  const hm = `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const name = def.filename
    .replace(/\{slug\}/g, slug)
    .replace(/\{date\}/g, todayStamp(now))
    .replace(/\{time\}/g, hm);
  return `${name}.md`;
}

/** The field an entry is dated and sorted by (e.g. `date` or `pubDate`). */
export function dateFieldOf(def: CollectionDef): string | null {
  return def.fields.find((f) => f.type === "date")?.name ?? null;
}

/** Public URL path of an entry, e.g. /posts/hello-world — or null when it has no page. */
export function entryRoute(def: CollectionDef, filename: string): string | null {
  if (def.route === null) return null;
  const id = filename.replace(/\.mdx?$/, "");
  return `${def.route}/${id}`;
}

const FIELD_TYPES: FieldType[] = ["text", "textarea", "date", "boolean", "tags", "image", "url"];

/**
 * Parse and validate a `cms.config.json` read from the connected repository.
 * Throws with a readable message when the shape is wrong, so the admin can
 * fall back to the defaults and tell the user why.
 */
export function parseCmsConfig(json: string): CmsConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("cms.config.json is not valid JSON");
  }
  const root = raw as { collections?: unknown; uploads?: Partial<UploadsConfig> };
  if (!Array.isArray(root.collections) || root.collections.length === 0) {
    throw new Error('cms.config.json needs a non-empty "collections" array');
  }

  const collections = root.collections.map((c, i) => {
    const col = c as Partial<CollectionDef> & { fields?: Partial<Field>[] };
    if (!col.key || !col.dir) {
      throw new Error(`cms.config.json: collection #${i + 1} needs at least "key" and "dir"`);
    }
    const fields: Field[] = (col.fields ?? []).map((f) => {
      if (!f.name) throw new Error(`cms.config.json: a field in "${col.key}" is missing "name"`);
      return {
        name: f.name,
        label: f.label ?? f.name,
        type: FIELD_TYPES.includes(f.type as FieldType) ? (f.type as FieldType) : "text",
        required: f.required === true,
        help: f.help,
        advanced: f.advanced === true,
      };
    });
    const label = col.label ?? col.key;
    return {
      key: col.key,
      label,
      labelSingular: col.labelSingular ?? label.toLowerCase().replace(/s$/, ""),
      description: col.description,
      dir: col.dir.replace(/\/+$/, ""),
      fields,
      hasBody: col.hasBody !== false,
      bodyLabel: col.bodyLabel ?? "Body",
      route: col.route === null ? null : (col.route ?? null),
      supportsCrosspost: col.supportsCrosspost === true,
      supportsNewsletter: col.supportsNewsletter === true,
      filename: col.filename || "{slug}",
    } satisfies CollectionDef;
  });

  return {
    collections,
    uploads: {
      dir: (root.uploads?.dir ?? DEFAULT_UPLOADS.dir).replace(/\/+$/, ""),
      publicBase: root.uploads?.publicBase ?? DEFAULT_UPLOADS.publicBase,
    },
  };
}
