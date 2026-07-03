import { describe, expect, test } from "bun:test";
import { htmlToMarkdown } from "../src/admin/paste";

describe("htmlToMarkdown — pasted content recognition", () => {
  test("converts a simple web page fragment", () => {
    const md = htmlToMarkdown(
      "<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> text.</p>",
    );
    expect(md).toContain("# Title");
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
  });

  test("converts lists and links (e.g. from Notion/Medium)", () => {
    const md = htmlToMarkdown(
      '<ul><li>First</li><li>See <a href="https://example.com">this link</a></li></ul>',
    );
    expect(md).toContain("- First");
    expect(md).toContain("[this link](https://example.com)");
  });

  test("unwraps styled spans from Google Docs / Word", () => {
    const md = htmlToMarkdown(
      '<p><span style="font-weight:400;color:#222">Hello</span>&nbsp;<span>world</span></p>',
    );
    expect(md).toBe("Hello world");
  });

  test("drops script and style tags", () => {
    const md = htmlToMarkdown("<style>p{color:red}</style><p>Safe</p><script>evil()</script>");
    expect(md).toBe("Safe");
  });

  test("keeps code blocks fenced", () => {
    const md = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
    expect(md).toContain("```");
    expect(md).toContain("const x = 1;");
  });
});
