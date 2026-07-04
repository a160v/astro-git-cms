/**
 * The backend boundary of the desktop app.
 *
 * Inside Tauri, every call goes to a Rust command that works on a local
 * clone of your site's repository (offline-first; `publish` = git commit +
 * push). In a plain browser (`bun run dev` without Tauri) a mock, in-memory
 * backend stands in, so the whole UI can be developed and demoed without
 * Rust.
 */

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface GitStatus {
  branch: string;
  /** Number of changed (unstaged or staged) files. */
  dirty: number;
  /** Commits waiting to be pushed. */
  ahead: number;
}

export interface Backend {
  /** Ask the user for the project folder; returns its path, or null if cancelled. */
  openProject(): Promise<string | null>;
  readFile(relPath: string): Promise<string>;
  writeFile(relPath: string, contents: string): Promise<void>;
  deleteFile(relPath: string): Promise<void>;
  listDir(relPath: string): Promise<DirEntry[]>;
  exists(relPath: string): Promise<boolean>;
  gitStatus(): Promise<GitStatus>;
  /** Stage everything, commit with `message`, push to origin. Returns a summary. */
  publish(message: string): Promise<string>;
}

function inTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

class TauriBackend implements Backend {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }

  async openProject(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: "Open your site's repository" });
    if (typeof dir !== "string") return null;
    return this.invoke<string>("set_project", { path: dir });
  }

  readFile(relPath: string): Promise<string> {
    return this.invoke("read_project_file", { relPath });
  }
  writeFile(relPath: string, contents: string): Promise<void> {
    return this.invoke("write_project_file", { relPath, contents });
  }
  deleteFile(relPath: string): Promise<void> {
    return this.invoke("delete_project_file", { relPath });
  }
  listDir(relPath: string): Promise<DirEntry[]> {
    return this.invoke("list_project_dir", { relPath });
  }
  exists(relPath: string): Promise<boolean> {
    return this.invoke("project_file_exists", { relPath });
  }
  gitStatus(): Promise<GitStatus> {
    return this.invoke("git_status");
  }
  publish(message: string): Promise<string> {
    return this.invoke("git_publish", { message });
  }
}

/** In-memory stand-in used when the app runs in a plain browser. */
class MockBackend implements Backend {
  private files = new Map<string, string>(
    Object.entries({
      "cms.config.json": JSON.stringify({
        uploads: { dir: "public/assets/uploads", publicBase: "/assets/uploads" },
        collections: [
          {
            key: "blog",
            label: "Blog posts",
            labelSingular: "post",
            description: "Long-form writing",
            dir: "src/content/blog",
            route: "/blog",
            filename: "{slug}",
            fields: [
              { name: "title", label: "Title", type: "text", required: true },
              { name: "description", label: "Description", type: "textarea" },
              { name: "pubDate", label: "Date", type: "date", required: true },
              { name: "tags", label: "Tags", type: "tags" },
            ],
          },
          {
            key: "notes",
            label: "Notes",
            labelSingular: "note",
            description: "Short thoughts",
            dir: "src/content/notes",
            route: "/notes",
            bodyLabel: "Note",
            filename: "{date}-{time}",
            fields: [{ name: "date", label: "Date", type: "date", required: true }],
          },
        ],
      }),
      "src/content/blog/hello-world.md": `---\ntitle: Hello world\ndescription: A first post to try the editor.\npubDate: 2026-07-01\ntags:\n  - meta\n---\n\n## Welcome\n\nThis is a **demo post** running against the in-browser mock backend.\n\n- Type \`/\` for the block menu\n- Drag blocks by their handle\n- Paste rich text from anywhere\n`,
      "src/content/notes/2026-07-02-0910.md": `---\ndate: 2026-07-02\n---\n\nShort thought, in passing.\n`,
    }),
  );
  private committed = new Map(this.files);

  async openProject(): Promise<string | null> {
    return "/demo/my-site";
  }
  async readFile(relPath: string): Promise<string> {
    const text = this.files.get(relPath);
    if (text === undefined) throw new Error(`No such file: ${relPath}`);
    return text;
  }
  async writeFile(relPath: string, contents: string): Promise<void> {
    this.files.set(relPath, contents);
  }
  async deleteFile(relPath: string): Promise<void> {
    this.files.delete(relPath);
  }
  async listDir(relPath: string): Promise<DirEntry[]> {
    const prefix = relPath.replace(/\/+$/, "") + "/";
    const out = new Map<string, DirEntry>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const name = rest.split("/")[0]!;
      out.set(name, { name, isDir: rest.includes("/") });
    }
    return [...out.values()];
  }
  async exists(relPath: string): Promise<boolean> {
    return this.files.has(relPath);
  }
  async gitStatus(): Promise<GitStatus> {
    let dirty = 0;
    for (const [path, text] of this.files) {
      if (this.committed.get(path) !== text) dirty++;
    }
    for (const path of this.committed.keys()) {
      if (!this.files.has(path)) dirty++;
    }
    return { branch: "master", dirty, ahead: 0 };
  }
  async publish(message: string): Promise<string> {
    const { dirty } = await this.gitStatus();
    this.committed = new Map(this.files);
    return `[mock] committed ${dirty} file(s) (“${message}”) and pushed`;
  }
}

export function createBackend(): Backend {
  return inTauri() ? new TauriBackend() : new MockBackend();
}

export const IS_TAURI = typeof window !== "undefined" && inTauri();
