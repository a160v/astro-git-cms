/**
 * Minimal Forgejo API client — everything the admin needs to act as a CMS:
 * read/write/delete files (= content entries and images) and trigger
 * workflow dispatches (= send newsletters). Works with any Forgejo instance,
 * including Codeberg.
 */
import type { Connection } from "./store";

export interface DirEntry {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  size: number;
}

export interface FileContent {
  text: string;
  sha: string;
}

export class ForgejoError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ForgejoError";
  }
}

export class Forgejo {
  constructor(private conn: Connection) {}

  get branch(): string {
    return this.conn.branch;
  }

  private url(path: string, query?: Record<string, string>): string {
    const base = this.conn.baseUrl.replace(/\/+$/, "");
    const u = new URL(`${base}/api/v1${path}`);
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
    return u.href;
  }

  private repoPath(sub: string): string {
    return `/repos/${encodeURIComponent(this.conn.owner)}/${encodeURIComponent(this.conn.repo)}${sub}`;
  }

  private async request<T>(method: string, path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path, query), {
      method,
      headers: {
        Authorization: `token ${this.conn.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        /* not json */
      }
      throw new ForgejoError(detail || `${res.status} ${res.statusText}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Verify the connection and token; returns the repo's metadata. */
  async getRepo(): Promise<{ full_name: string; default_branch: string; private: boolean }> {
    return this.request("GET", this.repoPath(""));
  }

  async listDir(path: string): Promise<DirEntry[]> {
    try {
      const entries = await this.request<DirEntry[]>("GET", this.repoPath(`/contents/${encodePath(path)}`), {
        ref: this.conn.branch,
      });
      return Array.isArray(entries) ? entries : [];
    } catch (err) {
      if (err instanceof ForgejoError && err.status === 404) return [];
      throw err;
    }
  }

  async getFile(path: string): Promise<FileContent> {
    const data = await this.request<{ content: string; sha: string; encoding: string }>(
      "GET",
      this.repoPath(`/contents/${encodePath(path)}`),
      { ref: this.conn.branch },
    );
    return { text: fromBase64(data.content), sha: data.sha };
  }

  /** Fetch a binary file (image thumbnails in the media library) as an object URL. */
  async getRawObjectUrl(path: string): Promise<string> {
    const res = await fetch(
      this.url(this.repoPath(`/raw/${encodePath(path)}`), { ref: this.conn.branch }),
      { headers: { Authorization: `token ${this.conn.token}` } },
    );
    if (!res.ok) throw new ForgejoError(`Could not load ${path}`, res.status);
    return URL.createObjectURL(await res.blob());
  }

  /** Create or update a text file. Pass `sha` when updating an existing file. */
  async saveFile(path: string, text: string, message: string, sha?: string): Promise<string> {
    return this.saveBase64(path, toBase64(text), message, sha);
  }

  /** Create or update a file from already-encoded base64 (used for image uploads). */
  async saveBase64(path: string, contentBase64: string, message: string, sha?: string): Promise<string> {
    const body = {
      content: contentBase64,
      message,
      branch: this.conn.branch,
      ...(sha ? { sha } : {}),
    };
    const data = await this.request<{ content: { sha: string } }>(
      sha ? "PUT" : "POST",
      this.repoPath(`/contents/${encodePath(path)}`),
      undefined,
      body,
    );
    return data.content.sha;
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    await this.request("DELETE", this.repoPath(`/contents/${encodePath(path)}`), undefined, {
      sha,
      message,
      branch: this.conn.branch,
    });
  }

  /** Trigger a workflow_dispatch workflow (used to send newsletters from CI). */
  async dispatchWorkflow(workflowFile: string, inputs: Record<string, string>): Promise<void> {
    await this.request(
      "POST",
      this.repoPath(`/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`),
      undefined,
      { ref: this.conn.branch, inputs },
    );
  }
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** UTF-8-safe base64 helpers (btoa alone breaks on non-ASCII). */
export function toBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function fromBase64(b64: string): string {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
