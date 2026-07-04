/**
 * Admin settings, kept in the browser's localStorage only.
 * Nothing here is ever committed to the repository or sent anywhere
 * except to the APIs the user explicitly connects (GitHub/Forgejo,
 * Mastodon, Bluesky).
 */

export type Provider = "github" | "forgejo";

export interface Connection {
  provider: Provider;
  /** Forge instance, e.g. https://github.com or https://codeberg.org */
  baseUrl: string;
  owner: string;
  repo: string;
  branch: string;
  /** Personal access token with repository read/write scope. */
  token: string;
}

export interface Integrations {
  mastodonInstance: string;
  mastodonToken: string;
  blueskyService: string;
  blueskyHandle: string;
  blueskyPassword: string;
}

/**
 * Where the public site lives, so the admin can link to it and build
 * absolute URLs for cross-posting. When the admin is bundled into a site
 * (this repo's theme), the host page injects defaults via
 * `window.__CMS_SITE__`; when it runs standalone (headless), these are
 * set in the admin's Settings instead.
 */
export interface SiteSettings {
  /** Heading shown on the dashboard. */
  title: string;
  /** Public origin of the site, e.g. https://example.com — no trailing slash. */
  url: string;
  /** Sub-path the site is served under; "/" when at the domain root. */
  basePath: string;
}

declare global {
  interface Window {
    __CMS_SITE__?: Partial<SiteSettings>;
  }
}

const CONNECTION_KEY = "agc.connection";
const INTEGRATIONS_KEY = "agc.integrations";
const SITE_KEY = "agc.site";

export function getConnection(): Connection | null {
  const conn = read<Connection>(CONNECTION_KEY);
  if (conn && !conn.provider) {
    // Connections saved before multi-provider support were always Forgejo.
    conn.provider = /github\.com/.test(conn.baseUrl) ? "github" : "forgejo";
  }
  return conn;
}

export function setConnection(conn: Connection | null): void {
  write(CONNECTION_KEY, conn);
}

export function getIntegrations(): Integrations {
  return {
    mastodonInstance: "",
    mastodonToken: "",
    blueskyService: "https://bsky.social",
    blueskyHandle: "",
    blueskyPassword: "",
    ...read<Partial<Integrations>>(INTEGRATIONS_KEY),
  };
}

export function setIntegrations(value: Integrations): void {
  write(INTEGRATIONS_KEY, value);
}

/** Site defaults injected by the host page (empty when running standalone). */
export function injectedSite(): Partial<SiteSettings> {
  return typeof window !== "undefined" ? (window.__CMS_SITE__ ?? {}) : {};
}

export function getSiteSettings(): SiteSettings {
  return {
    title: "",
    url: "",
    basePath: "/",
    ...injectedSite(),
    ...read<Partial<SiteSettings>>(SITE_KEY),
  };
}

export function setSiteSettings(value: Partial<SiteSettings> | null): void {
  write(SITE_KEY, value);
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (value === null || value === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}
