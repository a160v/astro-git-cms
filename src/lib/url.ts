/**
 * Prefix a site-absolute path with the configured base path.
 *
 * When the site is hosted under a sub-path (e.g. Codeberg Pages at
 * `https://you.codeberg.page/repo/`), `base` in astro.config is set and this
 * helper turns `/posts` into `/repo/posts`. When hosted at the root, `base`
 * is `/` and paths pass through unchanged. External URLs are returned as-is.
 *
 * Astro/Vite replaces `import.meta.env.BASE_URL` at build time, so this works
 * in .astro frontmatter, endpoint files, and the client-side admin bundle.
 */
export function withBase(path = "/"): string {
  if (/^https?:\/\//.test(path) || path.startsWith("//") || path.startsWith("#")) {
    return path;
  }
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const clean = path.replace(/^\//, "");
  return clean ? `${base}/${clean}` : `${base}/`;
}
