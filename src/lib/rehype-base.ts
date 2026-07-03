/**
 * Rehype plugin: prefix root-absolute URLs inside rendered Markdown with the
 * site's base path, so `![](/uploads/x.jpg)` and `[link](/posts/y)` written in
 * post/note bodies keep working when the site is hosted under a sub-path.
 *
 * External URLs (`http…`, `//…`), in-page anchors (`#…`), and URLs that already
 * start with the base are left untouched. When base is "/" it's a no-op.
 *
 * Used as `rehypePlugins: [[rehypeBasePaths, base]]` in astro.config.
 */
type Node = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

export function rehypeBasePaths(base = "/") {
  const prefix = base.replace(/\/$/, "");

  const fix = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    if (!value.startsWith("/") || value.startsWith("//")) return value;
    if (value === prefix || value.startsWith(prefix + "/")) return value;
    return prefix + value;
  };

  const visit = (node: Node): void => {
    if (node.type === "element" && node.properties) {
      if (node.tagName === "img") node.properties.src = fix(node.properties.src);
      if (node.tagName === "a") node.properties.href = fix(node.properties.href);
    }
    node.children?.forEach(visit);
  };

  return (tree: Node): void => {
    if (prefix) visit(tree);
  };
}
