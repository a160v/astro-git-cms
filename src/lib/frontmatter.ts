/**
 * A small, dependency-free frontmatter reader/writer.
 *
 * It intentionally supports only the flat YAML this project's content uses:
 * strings, numbers, booleans, ISO dates and arrays of strings
 * (both `[a, b]` flow style and `- item` block style).
 * That keeps round-tripping from the admin editor lossless and predictable.
 */

export type FrontmatterValue = string | number | boolean | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedDocument {
  data: Frontmatter;
  body: string;
}

const FENCE = "---";

export function parseDocument(text: string): ParsedDocument {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith(FENCE + "\n")) {
    return { data: {}, body: normalized };
  }
  const end = normalized.indexOf("\n" + FENCE, FENCE.length);
  if (end === -1) {
    return { data: {}, body: normalized };
  }
  const rawHeader = normalized.slice(FENCE.length + 1, end);
  const afterFence = normalized.indexOf("\n", end + 1 + FENCE.length);
  const body = afterFence === -1 ? "" : normalized.slice(afterFence + 1).replace(/^\n+/, "");
  return { data: parseHeader(rawHeader), body };
}

function parseHeader(header: string): Frontmatter {
  const data: Frontmatter = {};
  const lines = header.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    i++;
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    const rest = match[2]!.trim();
    if (rest === "") {
      // Either an empty value or a block-style list on the following lines.
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i]!)) {
        items.push(parseScalar(lines[i]!.replace(/^\s*-\s+/, "").trim()) as string);
        i++;
      }
      if (items.length > 0) data[key] = items;
      continue;
    }
    data[key] = parseValue(rest);
  }
  return data;
}

function parseValue(raw: string): FrontmatterValue {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    return splitFlowItems(inner).map((item) => String(parseScalar(item.trim())));
  }
  return parseScalar(raw);
}

/** Split `a, "b, c", d` on commas that are not inside quotes. */
function splitFlowItems(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") items.push(current);
  return items;
}

function parseScalar(raw: string): string | number | boolean {
  if (
    (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
    (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
  ) {
    const inner = raw.slice(1, -1);
    return raw.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner;
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export function stringifyDocument(data: Frontmatter, body: string): string {
  const lines: string[] = [FENCE];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(quoteScalar).join(", ")}]`);
    } else if (typeof value === "boolean" || typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${quoteScalar(value)}`);
    }
  }
  lines.push(FENCE, "");
  const trimmedBody = body.replace(/\s+$/, "");
  return lines.join("\n") + trimmedBody + "\n";
}

/** Quote a string only when YAML would otherwise misread it. */
function quoteScalar(value: string): string {
  const needsQuoting =
    value === "" ||
    /^[\s]|[\s]$/.test(value) ||
    /[:#\[\]{}"'`,&*?|>%@!\\]/.test(value) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(value) ||
    /^-?\d/.test(value);
  if (!needsQuoting) return value;
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
