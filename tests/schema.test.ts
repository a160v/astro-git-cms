import { describe, expect, test } from "bun:test";
import {
  DEFAULT_COLLECTIONS,
  dateFieldOf,
  defaultConfig,
  entryRoute,
  parseCmsConfig,
  renderFilename,
} from "../src/admin/schema";

const posts = DEFAULT_COLLECTIONS.find((c) => c.key === "posts")!;
const notes = DEFAULT_COLLECTIONS.find((c) => c.key === "notes")!;
const pictures = DEFAULT_COLLECTIONS.find((c) => c.key === "pictures")!;

describe("renderFilename", () => {
  const now = new Date("2026-07-04T09:05:00Z");

  test("slug pattern uses the title", () => {
    expect(renderFilename(posts, { title: "Hello, Wörld!" }, now)).toBe("hello-world.md");
  });

  test("date-time pattern for title-less notes", () => {
    expect(renderFilename(notes, {}, now)).toBe("2026-07-04-0905.md");
  });

  test("date-slug pattern falls back to the singular label", () => {
    expect(renderFilename(pictures, {}, now)).toBe("2026-07-04-picture.md");
  });
});

describe("dateFieldOf", () => {
  test("finds the first date-typed field regardless of its name", () => {
    const def = { ...posts, fields: [{ name: "pubDate", label: "Date", type: "date" as const }] };
    expect(dateFieldOf(def)).toBe("pubDate");
  });
});

describe("entryRoute", () => {
  test("strips .md and .mdx", () => {
    expect(entryRoute(posts, "hello.md")).toBe("/posts/hello");
    expect(entryRoute(posts, "hello.mdx")).toBe("/posts/hello");
  });
});

describe("parseCmsConfig", () => {
  test("parses a minimal config and fills defaults", () => {
    const cfg = parseCmsConfig(
      JSON.stringify({
        collections: [
          {
            key: "blog",
            dir: "src/content/blog/",
            route: "/blog",
            fields: [
              { name: "title", required: true },
              { name: "pubDate", label: "Date", type: "date", required: true },
            ],
          },
        ],
      }),
    );
    const blog = cfg.collections[0]!;
    expect(blog.dir).toBe("src/content/blog");
    expect(blog.label).toBe("blog");
    expect(blog.hasBody).toBe(true);
    expect(blog.filename).toBe("{slug}");
    expect(blog.fields[0]).toMatchObject({ name: "title", label: "title", type: "text", required: true });
    expect(dateFieldOf(blog)).toBe("pubDate");
    expect(cfg.uploads).toEqual(defaultConfig().uploads);
  });

  test("rejects invalid JSON and missing collections", () => {
    expect(() => parseCmsConfig("not json")).toThrow("valid JSON");
    expect(() => parseCmsConfig("{}")).toThrow("collections");
    expect(() => parseCmsConfig('{"collections":[{"key":"x"}]}')).toThrow('"key" and "dir"');
  });

  test("collections without a route get none", () => {
    const cfg = parseCmsConfig(
      JSON.stringify({ collections: [{ key: "blogroll", dir: "src/content/blogroll" }] }),
    );
    expect(cfg.collections[0]!.route).toBeNull();
    expect(entryRoute(cfg.collections[0]!, "x.md")).toBeNull();
  });
});
