import { describe, expect, test } from "bun:test";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
  test("basic titles", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  test("diacritics and apostrophes", () => {
    expect(slugify("Café de l'Été")).toBe("cafe-de-lete");
  });

  test("empty input falls back", () => {
    expect(slugify("???")).toBe("untitled");
  });

  test("caps length", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
