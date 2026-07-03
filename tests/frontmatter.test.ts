import { describe, expect, test } from "bun:test";
import { parseDocument, stringifyDocument } from "../src/lib/frontmatter";

describe("parseDocument", () => {
  test("parses typical post frontmatter", () => {
    const doc = parseDocument(
      `---
title: Hello, world
date: 2026-07-01
draft: true
tags: [meta, astro]
---

Body text here.
`,
    );
    expect(doc.data.title).toBe("Hello, world");
    expect(doc.data.date).toBe("2026-07-01");
    expect(doc.data.draft).toBe(true);
    expect(doc.data.tags).toEqual(["meta", "astro"]);
    expect(doc.body).toBe("Body text here.\n");
  });

  test("parses quoted strings and block lists", () => {
    const doc = parseDocument(
      `---
title: "Colons: are fine"
tags:
  - one
  - "two, three"
---
Body`,
    );
    expect(doc.data.title).toBe("Colons: are fine");
    expect(doc.data.tags).toEqual(["one", "two, three"]);
  });

  test("handles documents without frontmatter", () => {
    const doc = parseDocument("Just text.");
    expect(doc.data).toEqual({});
    expect(doc.body).toBe("Just text.");
  });

  test("handles CRLF and BOM", () => {
    const doc = parseDocument("﻿---\r\ntitle: Windows\r\n---\r\nBody\r\n");
    expect(doc.data.title).toBe("Windows");
    expect(doc.body).toBe("Body\n");
  });

  test("parses empty flow arrays", () => {
    const doc = parseDocument("---\ntags: []\n---\n");
    expect(doc.data.tags).toEqual([]);
  });
});

describe("stringifyDocument", () => {
  test("round-trips a document", () => {
    const data = {
      title: "A title: with a colon",
      date: "2026-07-03",
      draft: true,
      tags: ["a", "b c"],
      mastodon: "https://mastodon.social/@me/123",
    };
    const text = stringifyDocument(data, "Hello **world**\n");
    const parsed = parseDocument(text);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe("Hello **world**\n");
  });

  test("quotes only when needed", () => {
    const text = stringifyDocument({ title: "Plain title", note: "with: colon" }, "");
    expect(text).toContain("title: Plain title\n");
    expect(text).toContain('note: "with: colon"\n');
  });

  test("writes booleans and numbers bare", () => {
    const text = stringifyDocument({ draft: false, count: 3 }, "body");
    expect(text).toContain("draft: false");
    expect(text).toContain("count: 3");
  });
});
