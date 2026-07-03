/**
 * Smart paste: recognizes rich/formatted content copied from other platforms
 * (Google Docs, Word, Notion, Medium, web pages…) and converts it to clean
 * Markdown on the fly, instead of dumping styled junk into your file.
 */
import TurndownService from "turndown";

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (!service) {
    service = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      hr: "---",
      emDelimiter: "*",
    });
    service.remove(["script", "style"] as never[]);
    // Word/Docs wrap everything in spans with inline styles — unwrap them.
    service.addRule("plainSpan", {
      filter: ["span", "font" as keyof HTMLElementTagNameMap],
      replacement: (content) => content,
    });
  }
  return service;
}

export function htmlToMarkdown(html: string): string {
  return getService()
    .turndown(html)
    .replace(/\u00a0/g, " ")
    .replace(/^([ \t]*(?:[-*+]|\d+\.))[ \t]+/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Wire a textarea so that pasting formatted content inserts Markdown.
 * Plain-text pastes (including hand-written Markdown) pass through untouched.
 */
export function enableSmartPaste(textarea: HTMLTextAreaElement, onChange?: () => void): void {
  textarea.addEventListener("paste", (event) => {
    const html = event.clipboardData?.getData("text/html");
    if (!html) return;
    const markdown = htmlToMarkdown(html);
    if (!markdown) return;
    event.preventDefault();
    insertAtCursor(textarea, markdown);
    onChange?.();
  });
}

export function insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  textarea.setRangeText(text, start, end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}
