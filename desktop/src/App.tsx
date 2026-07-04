/**
 * Writer — offline-first desktop app for git-based sites.
 *
 * Open a local clone of your site's repository; its cms.config.json (the
 * same file the web admin uses) defines the collections. Write offline in a
 * Notion-like editor; every save is a local file write. One button —
 * Publish — commits everything and pushes, and your host (e.g. Cloudflare
 * Pages) rebuilds the site.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultConfig,
  parseCmsConfig,
  renderFilename,
  dateFieldOf,
  type CmsConfig,
  type CollectionDef,
  type Field,
} from "../../src/admin/schema";
import { parseDocument, stringifyDocument, type Frontmatter } from "../../src/lib/frontmatter";
import { createBackend, IS_TAURI, type Backend, type GitStatus } from "./backend";
import { MarkdownEditor } from "./Editor";
import "./app.css";

const backend: Backend = createBackend();

interface ListedEntry {
  filename: string;
  path: string;
  title: string;
  date: string;
  draft: boolean;
}

interface OpenEntry {
  collection: CollectionDef;
  /** null while the entry hasn't been saved yet. */
  filename: string | null;
  data: Frontmatter;
  body: string;
}

export default function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [cfg, setCfg] = useState<CmsConfig>(defaultConfig());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<ListedEntry[]>([]);
  const [open, setOpen] = useState<OpenEntry | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const active = useMemo(
    () => cfg.collections.find((c) => c.key === activeKey) ?? null,
    [cfg, activeKey],
  );

  const say = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage((m) => (m === text ? null : m)), 4000);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await backend.gitStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  const openProject = useCallback(async () => {
    const root = await backend.openProject();
    if (!root) return;
    let config = defaultConfig();
    try {
      if (await backend.exists("cms.config.json")) {
        config = parseCmsConfig(await backend.readFile("cms.config.json"));
      }
    } catch (err) {
      say(err instanceof Error ? err.message : "Could not read cms.config.json");
    }
    setProjectRoot(root);
    setCfg(config);
    setActiveKey(config.collections[0]?.key ?? null);
    setOpen(null);
    void refreshStatus();
  }, [refreshStatus, say]);

  const loadEntries = useCallback(async (def: CollectionDef) => {
    const dateField = dateFieldOf(def);
    const files = (await backend.listDir(def.dir).catch(() => []))
      .filter((e) => !e.isDir && /\.mdx?$/.test(e.name));
    const listed = await Promise.all(
      files.map(async (file): Promise<ListedEntry> => {
        const path = `${def.dir}/${file.name}`;
        try {
          const { data } = parseDocument(await backend.readFile(path));
          return {
            filename: file.name,
            path,
            title: String(data.title ?? data.name ?? file.name.replace(/\.mdx?$/, "")),
            date: dateField ? String(data[dateField] ?? "").slice(0, 10) : "",
            draft: data.draft === true,
          };
        } catch {
          return { filename: file.name, path, title: file.name, date: "", draft: false };
        }
      }),
    );
    listed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.filename.localeCompare(b.filename)));
    setEntries(listed);
  }, []);

  useEffect(() => {
    if (active) void loadEntries(active);
  }, [active, loadEntries]);

  const openEntry = useCallback(
    async (def: CollectionDef, filename: string | null) => {
      if (filename) {
        const parsed = parseDocument(await backend.readFile(`${def.dir}/${filename}`));
        setOpen({ collection: def, filename, data: parsed.data, body: parsed.body });
      } else {
        const data: Frontmatter = { draft: true };
        const dateField = dateFieldOf(def);
        if (dateField) data[dateField] = new Date().toISOString().slice(0, 10);
        setOpen({ collection: def, filename: null, data, body: "" });
      }
      setDirty(false);
    },
    [],
  );

  const save = useCallback(async () => {
    if (!open) return;
    const def = open.collection;
    const filename = open.filename ?? renderFilename(def, open.data);
    const text = stringifyDocument(open.data, open.body);
    await backend.writeFile(`${def.dir}/${filename}`, text);
    setOpen({ ...open, filename });
    setDirty(false);
    say(`Saved ${filename}`);
    void loadEntries(def);
    void refreshStatus();
  }, [open, say, loadEntries, refreshStatus]);

  const publish = useCallback(async () => {
    try {
      const summary = await backend.publish("content: update via Writer");
      say(summary);
      void refreshStatus();
    } catch (err) {
      say(err instanceof Error ? err.message : "Publish failed");
    }
  }, [say, refreshStatus]);

  // ⌘S / Ctrl-S saves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (!projectRoot) {
    return (
      <div className="welcome">
        <h1>Writer</h1>
        <p>
          Open a local clone of your site's repository. Write offline — a
          Notion-style editor over plain Markdown files — and publish with one
          button when you're back online.
        </p>
        <button className="primary" onClick={() => void openProject()}>
          Open project…
        </button>
        {!IS_TAURI && <p className="hint">Running in a browser — a demo project will open.</p>}
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="project" title={projectRoot}>
          <strong>{projectRoot.split(/[\\/]/).pop()}</strong>
          {status && (
            <span className="branch">
              {status.branch}
              {status.dirty > 0 ? ` · ${status.dirty} changed` : ""}
            </span>
          )}
        </div>
        <nav>
          {cfg.collections.map((def) => (
            <button
              key={def.key}
              className={def.key === activeKey ? "nav active" : "nav"}
              onClick={() => {
                setActiveKey(def.key);
                setOpen(null);
              }}
            >
              {def.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="primary publish"
            onClick={() => void publish()}
            disabled={status !== null && status.dirty === 0 && status.ahead === 0}
            title="Commit all changes and push"
          >
            Publish
          </button>
          <button className="ghost" onClick={() => void openProject()}>
            Switch project
          </button>
        </div>
      </aside>

      <section className="entries">
        <header>
          <h2>{active?.label ?? ""}</h2>
          <button className="ghost" onClick={() => active && void openEntry(active, null)}>
            ＋ New {active?.labelSingular}
          </button>
        </header>
        <ul>
          {entries.map((entry) => (
            <li key={entry.path}>
              <button
                className={open?.filename === entry.filename ? "entry active" : "entry"}
                onClick={() => active && void openEntry(active, entry.filename)}
              >
                <span className="entry-title">{entry.title}</span>
                <span className="entry-meta">
                  {entry.date}
                  {entry.draft && <em className="pill">draft</em>}
                </span>
              </button>
            </li>
          ))}
          {entries.length === 0 && <li className="empty">Nothing here yet.</li>}
        </ul>
      </section>

      <main className="editor-pane">
        {open ? (
          <>
            <div className="fields">
              {open.collection.fields
                .filter((f) => !f.advanced)
                .map((field) => (
                  <FieldInput
                    key={field.name}
                    field={field}
                    value={open.data[field.name]}
                    onChange={(value) => {
                      setOpen({ ...open, data: { ...open.data, [field.name]: value } });
                      setDirty(true);
                    }}
                  />
                ))}
              <label className="draft-toggle">
                <input
                  type="checkbox"
                  checked={open.data.draft === true}
                  onChange={(event) => {
                    const data = { ...open.data };
                    if (event.target.checked) data.draft = true;
                    else delete data.draft;
                    setOpen({ ...open, data });
                    setDirty(true);
                  }}
                />
                Draft
              </label>
            </div>
            {open.collection.hasBody && (
              <MarkdownEditor
                documentKey={`${open.collection.key}/${open.filename ?? "∅"}`}
                initialMarkdown={open.body}
                onMarkdownChange={(markdown) => {
                  setOpen((current) => (current ? { ...current, body: markdown } : current));
                  setDirty(true);
                }}
              />
            )}
            <footer className="editor-footer">
              <button className="primary" onClick={() => void save()} disabled={!dirty}>
                {open.filename ? "Save" : "Create"} {dirty ? "•" : ""}
              </button>
              <span className="hint">⌘S to save. Publishing commits & pushes everything.</span>
            </footer>
          </>
        ) : (
          <div className="placeholder">Select an entry, or create a new one.</div>
        )}
      </main>

      {message && <div className="toast">{message}</div>}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.name}`;
  const common = { id, placeholder: field.label };
  let input: React.ReactNode;
  switch (field.type) {
    case "textarea":
      input = (
        <textarea
          {...common}
          rows={2}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "date":
      input = (
        <input
          {...common}
          type="date"
          value={value === undefined ? "" : String(value).slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "tags":
      input = (
        <input
          {...common}
          type="text"
          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      );
      break;
    default:
      input = (
        <input
          {...common}
          type="text"
          className={field.name === "title" ? "title-input" : undefined}
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <p className="field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {input}
    </p>
  );
}
