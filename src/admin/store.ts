/**
 * Admin settings, kept in the browser's localStorage only.
 * Nothing here is ever committed to the repository or sent anywhere
 * except to the APIs the user explicitly connects (Forgejo, Mastodon, Bluesky).
 */

export interface Connection {
  /** Forgejo instance, e.g. https://codeberg.org */
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

const CONNECTION_KEY = "agc.connection";
const INTEGRATIONS_KEY = "agc.integrations";

export function getConnection(): Connection | null {
  return read<Connection>(CONNECTION_KEY);
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
