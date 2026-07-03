/**
 * The admin app: a small single-page application served at /admin.
 *
 * It has no backend of its own — it reads and writes content by talking to
 * your Forgejo/Codeberg repository through its API, from your browser.
 * Publishing a change means making a commit; the CI pipeline rebuilds the
 * static site. Works comfortably on a phone.
 */
import { marked } from "marked";
import { COLLECTIONS, collectionByKey, entryRoute, type CollectionDef, type Field } from "./schema";
import { Forgejo, ForgejoError, bytesToBase64, type DirEntry } from "./forgejo";
import {
  getConnection,
  setConnection,
  getIntegrations,
  setIntegrations,
  type Connection,
} from "./store";
import { parseDocument, stringifyDocument, type Frontmatter } from "../lib/frontmatter";
import { enableSmartPaste, insertAtCursor } from "./paste";
import { postToMastodon, postToBluesky } from "./crosspost";
import { slugify } from "../lib/slug";
import { SITE } from "../config/site";
import { el, toast, busy } from "./ui";

const app = document.getElementById("admin-app")!;

/* ------------------------------------------------------------------------ */
/* Router                                                                    */
/* ------------------------------------------------------------------------ */

async function route(): Promise<void> {
  const segments = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const conn = getConnection();
  if (!conn && segments[0] !== "connect") {
    location.hash = "#/connect";
    return;
  }
  app.setAttribute("aria-busy", "true");
  try {
    switch (segments[0]) {
      case "connect":
        renderView(connectView());
        break;
      case "list":
        await listView(segments[1] ?? "");
        break;
      case "new":
        await editorView(segments[1] ?? "", null);
        break;
      case "edit":
        await editorView(segments[1] ?? "", decodeURIComponent(segments[2] ?? ""));
        break;
      case "media":
        await mediaView();
        break;
      case "settings":
        renderView(settingsView());
        break;
      default:
        renderView(dashboardView());
    }
  } catch (err) {
    renderView(errorView(err));
  } finally {
    app.removeAttribute("aria-busy");
  }
}

function renderView(node: Node): void {
  app.replaceChildren(node);
  const heading = app.querySelector("h1");
  heading?.setAttribute("tabindex", "-1");
  (heading as HTMLElement | null)?.focus?.();
}

function forgejo(): Forgejo {
  return new Forgejo(getConnection()!);
}

/* ------------------------------------------------------------------------ */
/* Chrome                                                                    */
/* ------------------------------------------------------------------------ */

function shell(title: string, back: string | null, ...content: (Node | string)[]): HTMLElement {
  return el(
    "div",
    { class: "admin-view" },
    el(
      "header",
      { class: "admin-bar" },
      back !== null
        ? el("a", { class: "admin-back", href: back, "aria-label": "Back" }, "‹ Back")
        : el("span", {}),
      el("h1", {}, title),
      el("a", { class: "admin-back", href: "/", "aria-label": "View site" }, "View site"),
    ),
    el("div", { class: "admin-content" }, ...content),
  );
}

function errorView(err: unknown): HTMLElement {
  const message = err instanceof Error ? err.message : String(err);
  const isAuth = err instanceof ForgejoError && (err.status === 401 || err.status === 403);
  return shell(
    "Something went wrong",
    "#/",
    el("p", {}, message),
    isAuth
      ? el("p", {}, "Your token may be invalid or expired. ", el("a", { href: "#/connect" }, "Reconnect"))
      : el("p", {}, el("a", { href: "#/", onclick: () => location.reload() }, "Try again")),
  );
}

/* ------------------------------------------------------------------------ */
/* Connect                                                                   */
/* ------------------------------------------------------------------------ */

function connectView(): HTMLElement {
  const existing = getConnection();
  const form = el("form", { class: "admin-form" });

  const fields: { key: keyof Connection; label: string; value: string; type?: string; help?: string }[] = [
    { key: "baseUrl", label: "Forgejo instance", value: existing?.baseUrl ?? "https://codeberg.org" },
    { key: "owner", label: "Repository owner", value: existing?.owner ?? "" },
    { key: "repo", label: "Repository name", value: existing?.repo ?? "" },
    { key: "branch", label: "Branch", value: existing?.branch ?? "main" },
    {
      key: "token",
      label: "Access token",
      value: existing?.token ?? "",
      type: "password",
      help: "Create one under Settings → Applications on your Forgejo instance, with read/write permission for repositories. It is stored only in this browser.",
    },
  ];

  const inputs = new Map<keyof Connection, HTMLInputElement>();
  for (const f of fields) {
    const id = `connect-${f.key}`;
    const input = el("input", {
      id,
      type: f.type ?? "text",
      value: f.value,
      required: true,
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: false,
    });
    inputs.set(f.key, input);
    form.append(
      el(
        "p",
        { class: "admin-field" },
        el("label", { htmlFor: id }, f.label),
        input,
        f.help ? el("span", { class: "admin-help" }, f.help) : null,
      ),
    );
  }

  const submit = el("button", { class: "btn", type: "submit" }, "Connect");
  form.append(el("p", {}, submit));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const conn: Connection = {
      baseUrl: inputs.get("baseUrl")!.value.trim().replace(/\/+$/, ""),
      owner: inputs.get("owner")!.value.trim(),
      repo: inputs.get("repo")!.value.trim(),
      branch: inputs.get("branch")!.value.trim() || "main",
      token: inputs.get("token")!.value.trim(),
    };
    const done = busy(submit, "Connecting…");
    try {
      const repo = await new Forgejo(conn).getRepo();
      setConnection(conn);
      toast(`Connected to ${repo.full_name}`);
      location.hash = "#/";
    } catch (err) {
      toast(err instanceof Error ? err.message : "Connection failed", "error");
    } finally {
      done();
    }
  });

  return shell(
    "Connect your site",
    null,
    el(
      "p",
      { class: "muted" },
      "The admin writes straight to your git repository — nothing is stored anywhere else.",
    ),
    form,
  );
}

/* ------------------------------------------------------------------------ */
/* Dashboard                                                                 */
/* ------------------------------------------------------------------------ */

function dashboardView(): HTMLElement {
  const quick = el(
    "div",
    { class: "admin-quick" },
    el("a", { class: "btn", href: "#/new/posts" }, "＋ New post"),
    el("a", { class: "btn btn-secondary", href: "#/new/notes" }, "＋ Note"),
    el("a", { class: "btn btn-secondary", href: "#/new/pictures" }, "＋ Picture"),
  );

  const cards = el("div", { class: "admin-cards" });
  for (const def of COLLECTIONS) {
    cards.append(
      el(
        "a",
        { class: "admin-card", href: `#/list/${def.key}` },
        el("strong", {}, def.label),
        el("span", { class: "admin-help" }, describeCollection(def)),
      ),
    );
  }
  cards.append(
    el(
      "a",
      { class: "admin-card", href: "#/media" },
      el("strong", {}, "Media"),
      el("span", { class: "admin-help" }, "Images uploaded to your posts"),
    ),
    el(
      "a",
      { class: "admin-card", href: "#/settings" },
      el("strong", {}, "Settings"),
      el("span", { class: "admin-help" }, "Connection, fediverse, Bluesky, newsletter"),
    ),
  );

  return shell(SITE.title, null, quick, cards);
}

function describeCollection(def: CollectionDef): string {
  switch (def.key) {
    case "posts":
      return "Long-form writing";
    case "notes":
      return "Short thoughts, microblog-style";
    case "pages":
      return "About, contact and other standalone pages";
    case "pictures":
      return "Your photo feed";
    case "blogroll":
      return "Sites you recommend";
    default:
      return "";
  }
}

/* ------------------------------------------------------------------------ */
/* List                                                                      */
/* ------------------------------------------------------------------------ */

interface ListedEntry {
  filename: string;
  title: string;
  date: string;
  draft: boolean;
}

async function listView(key: string): Promise<void> {
  const def = collectionByKey(key);
  if (!def) throw new Error(`Unknown collection "${key}"`);
  const fj = forgejo();

  const files = (await fj.listDir(def.dir)).filter(
    (e) => e.type === "file" && e.name.endsWith(".md"),
  );

  const entries: ListedEntry[] = await Promise.all(
    files.map(async (file) => {
      try {
        const { data } = parseDocument((await fj.getFile(file.path)).text);
        return {
          filename: file.name,
          title: String(data.title ?? data.name ?? file.name.replace(/\.md$/, "")),
          date: String(data.date ?? ""),
          draft: data.draft === true,
        };
      } catch {
        return { filename: file.name, title: file.name, date: "", draft: false };
      }
    }),
  );
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.filename.localeCompare(b.filename)));

  const list = el("ul", { class: "admin-list" });
  if (entries.length === 0) {
    list.append(el("li", { class: "muted" }, `No ${def.label.toLowerCase()} yet.`));
  }
  for (const entry of entries) {
    list.append(
      el(
        "li",
        {},
        el(
          "a",
          { class: "admin-row", href: `#/edit/${def.key}/${encodeURIComponent(entry.filename)}` },
          el(
            "span",
            { class: "admin-row-main" },
            el("strong", {}, entry.title),
            el("span", { class: "admin-help" }, entry.date || entry.filename),
          ),
          entry.draft ? el("span", { class: "admin-pill" }, "draft") : null,
        ),
      ),
    );
  }

  renderView(
    shell(
      def.label,
      "#/",
      el("p", {}, el("a", { class: "btn", href: `#/new/${def.key}` }, `＋ New ${def.labelSingular}`)),
      list,
    ),
  );
}

/* ------------------------------------------------------------------------ */
/* Editor                                                                    */
/* ------------------------------------------------------------------------ */

async function editorView(key: string, filename: string | null): Promise<void> {
  const def = collectionByKey(key);
  if (!def) throw new Error(`Unknown collection "${key}"`);
  const fj = forgejo();

  let sha: string | undefined;
  let data: Frontmatter = {};
  let body = "";

  if (filename) {
    const file = await fj.getFile(`${def.dir}/${filename}`);
    sha = file.sha;
    const parsed = parseDocument(file.text);
    data = parsed.data;
    body = parsed.body;
  } else {
    // New entries start as drafts — publishing is a deliberate act.
    data = { draft: true };
    if (def.fields.some((f) => f.name === "date")) {
      data.date = new Date().toISOString().slice(0, 10);
    }
  }

  const isNew = !filename;
  const fieldInputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();

  /* --- frontmatter fields --------------------------------------------- */
  const fieldsWrap = el("div", { class: "admin-form" });
  const advancedWrap = el("div", { class: "admin-form" });

  for (const field of def.fields) {
    const target = field.advanced ? advancedWrap : fieldsWrap;
    target.append(renderField(field, data, fieldInputs, fj));
  }

  /* --- draft switch ---------------------------------------------------- */
  const draftInput = el("input", {
    type: "checkbox",
    id: "field-draft",
    checked: data.draft === true,
    role: "switch",
  });
  const draftRow = el(
    "p",
    { class: "admin-draft" },
    el("label", { htmlFor: "field-draft" }, "Draft"),
    draftInput,
    el("span", { class: "admin-help" }, "Drafts are saved to git but never published."),
  );

  /* --- body ------------------------------------------------------------ */
  const bodyInput = el("textarea", {
    id: "field-body",
    rows: 14,
    value: body,
    placeholder: "Write in Markdown. Paste from anywhere — formatting is converted automatically.",
  });
  enableSmartPaste(bodyInput);

  const preview = el("div", { class: "prose admin-preview", hidden: true });
  const previewToggle = el(
    "button",
    { class: "btn btn-secondary", type: "button", "aria-pressed": "false" },
    "Preview",
  );
  previewToggle.addEventListener("click", () => {
    const showing = !preview.hidden;
    if (showing) {
      preview.hidden = true;
      bodyInput.hidden = false;
      previewToggle.setAttribute("aria-pressed", "false");
    } else {
      preview.innerHTML = marked.parse(bodyInput.value) as string;
      preview.hidden = false;
      bodyInput.hidden = true;
      previewToggle.setAttribute("aria-pressed", "true");
    }
  });

  const toolbar = def.hasBody
    ? el(
        "div",
        { class: "admin-toolbar", role: "toolbar", "aria-label": "Formatting" },
        mdButton(bodyInput, "H2", "Heading", "\n## ", ""),
        mdButton(bodyInput, "B", "Bold", "**", "**"),
        mdButton(bodyInput, "I", "Italic", "*", "*"),
        mdButton(bodyInput, "”", "Quote", "\n> ", ""),
        mdButton(bodyInput, "•", "List", "\n- ", ""),
        mdButton(bodyInput, "‹›", "Code", "`", "`"),
        linkButton(bodyInput),
        imageUploadButton(fj, (publicPath, alt) =>
          insertAtCursor(bodyInput, `![${alt}](${publicPath})`),
        ),
        previewToggle,
      )
    : null;

  /* --- save / delete ---------------------------------------------------- */
  const saveButton = el("button", { class: "btn", type: "submit" }, isNew ? "Create" : "Save");
  const form = el("form", { class: "admin-editor" });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const missing = def.fields.filter(
      (f) => f.required && !String(fieldInputs.get(f.name)?.value ?? "").trim(),
    );
    if (missing.length > 0) {
      toast(`Please fill in: ${missing.map((f) => f.label).join(", ")}`, "error");
      fieldInputs.get(missing[0]!.name)?.focus();
      return;
    }
    const done = busy(saveButton, "Saving…");
    try {
      const next = collectValues(def, fieldInputs, data);
      if (draftInput.checked) next.draft = true;
      const targetName = filename ?? def.newFilename(next);
      const path = `${def.dir}/${targetName}`;
      const text = stringifyDocument(next, def.hasBody ? bodyInput.value : "");
      const message = `content: ${isNew ? "create" : "update"} ${path} (via admin)`;
      sha = await fj.saveFile(path, text, message, sha);
      data = next;
      toast(isNew ? "Created — the site will rebuild shortly." : "Saved.");
      if (isNew) {
        location.hash = `#/edit/${def.key}/${encodeURIComponent(targetName)}`;
      }
    } catch (err) {
      if (err instanceof ForgejoError && err.status === 422) {
        toast("A file with this name already exists — change the title.", "error");
      } else {
        toast(err instanceof Error ? err.message : "Saving failed", "error");
      }
    } finally {
      done();
    }
  });

  const actions: (Node | string)[] = [];
  if (!isNew) {
    const deleteButton = el("button", { class: "btn btn-danger", type: "button" }, "Delete");
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete this ${def.labelSingular}? This makes a commit removing the file.`)) return;
      const done = busy(deleteButton, "Deleting…");
      try {
        await fj.deleteFile(`${def.dir}/${filename}`, sha!, `content: delete ${def.dir}/${filename} (via admin)`);
        toast("Deleted.");
        location.hash = `#/list/${def.key}`;
      } catch (err) {
        toast(err instanceof Error ? err.message : "Delete failed", "error");
        done();
      }
    });
    actions.push(deleteButton);
  }

  form.append(
    fieldsWrap,
    def.hasBody
      ? el(
          "div",
          { class: "admin-field admin-body-field" },
          el("label", { htmlFor: "field-body" }, def.bodyLabel),
          toolbar,
          bodyInput,
          preview,
        )
      : "",
    advancedWrap.childElementCount > 0
      ? el("details", { class: "admin-advanced" }, el("summary", {}, "Advanced"), advancedWrap)
      : "",
    draftRow,
    el("p", { class: "admin-actions" }, saveButton, ...actions),
  );

  /* --- share & newsletter ----------------------------------------------- */
  const extras = el("div", {});
  if (!isNew && def.supportsCrosspost) {
    extras.append(shareSection(def, filename!, data, fieldInputs, fj, () => draftInput.checked, (d) => (sha = d)));
  }
  if (!isNew && def.supportsNewsletter) {
    extras.append(newsletterSection(filename!, fj));
  }

  const publicUrl = filename ? entryRoute(def, filename) : null;
  renderView(
    shell(
      isNew ? `New ${def.labelSingular}` : `Edit ${def.labelSingular}`,
      `#/list/${def.key}`,
      publicUrl
        ? el(
            "p",
            { class: "admin-help" },
            "Public URL: ",
            el("a", { href: publicUrl, rel: "noopener" }, publicUrl),
          )
        : "",
      form,
      extras,
    ),
  );
}

function renderField(
  field: Field,
  data: Frontmatter,
  inputs: Map<string, HTMLInputElement | HTMLTextAreaElement>,
  fj: Forgejo,
): HTMLElement {
  const id = `field-${field.name}`;
  const raw = data[field.name];
  let input: HTMLInputElement | HTMLTextAreaElement;

  switch (field.type) {
    case "textarea":
      input = el("textarea", { id, rows: 3, value: raw === undefined ? "" : String(raw) });
      break;
    case "date": {
      const value = raw === undefined ? "" : String(raw).slice(0, 10);
      input = el("input", { id, type: "date", value });
      break;
    }
    case "tags":
      input = el("input", {
        id,
        type: "text",
        value: Array.isArray(raw) ? raw.join(", ") : String(raw ?? ""),
        autocapitalize: "none",
      });
      break;
    case "url":
      input = el("input", { id, type: "url", value: raw === undefined ? "" : String(raw), inputmode: "url" });
      break;
    default:
      input = el("input", { id, type: "text", value: raw === undefined ? "" : String(raw) });
  }
  inputs.set(field.name, input);

  const wrap = el(
    "p",
    { class: "admin-field" },
    el("label", { htmlFor: id }, field.label + (field.required ? " *" : "")),
    input,
  );

  if (field.type === "image") {
    input.placeholder = "/uploads/…";
    wrap.append(
      imageUploadButton(fj, (publicPath) => {
        input.value = publicPath;
      }),
    );
  }
  if (field.help) wrap.append(el("span", { class: "admin-help" }, field.help));
  return wrap;
}

function collectValues(
  def: CollectionDef,
  inputs: Map<string, HTMLInputElement | HTMLTextAreaElement>,
  previous: Frontmatter,
): Frontmatter {
  const next: Frontmatter = {};
  for (const field of def.fields) {
    const value = String(inputs.get(field.name)?.value ?? "").trim();
    if (!value) continue;
    if (field.type === "tags") {
      const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) next[field.name] = tags;
    } else {
      next[field.name] = value;
    }
  }
  // Preserve any frontmatter keys the admin doesn't know about.
  for (const [key, value] of Object.entries(previous)) {
    if (key === "draft") continue;
    if (!(key in next) && !def.fields.some((f) => f.name === key)) next[key] = value;
  }
  return next;
}

/* --- markdown toolbar helpers -------------------------------------------- */

function mdButton(
  textarea: HTMLTextAreaElement,
  label: string,
  title: string,
  before: string,
  after: string,
): HTMLButtonElement {
  const button = el(
    "button",
    { class: "btn btn-secondary admin-tool", type: "button", title, "aria-label": title },
    label,
  );
  button.addEventListener("click", () => {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end);
    textarea.setRangeText(`${before}${selected}${after}`, start, end, "end");
    if (!selected && after) {
      textarea.selectionStart = textarea.selectionEnd = start + before.length;
    }
    textarea.focus();
  });
  return button;
}

function linkButton(textarea: HTMLTextAreaElement): HTMLButtonElement {
  const button = el(
    "button",
    { class: "btn btn-secondary admin-tool", type: "button", title: "Link", "aria-label": "Insert link" },
    "🔗",
  );
  button.addEventListener("click", () => {
    const url = prompt("Link URL:");
    if (!url) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end) || "link text";
    textarea.setRangeText(`[${selected}](${url})`, start, end, "end");
    textarea.focus();
  });
  return button;
}

function imageUploadButton(
  fj: Forgejo,
  onUploaded: (publicPath: string, alt: string) => void,
): HTMLElement {
  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "visually-hidden",
    "aria-hidden": "true",
    tabindex: -1,
  });
  const button = el(
    "button",
    { class: "btn btn-secondary admin-tool", type: "button" },
    "🖼 Upload image",
  );
  button.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const done = busy(button, "Uploading…");
    try {
      const publicPath = await uploadImage(fj, file);
      onUploaded(publicPath, "");
      toast("Image uploaded — remember to describe it (alt text).");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      done();
      fileInput.value = "";
    }
  });
  return el("span", { class: "admin-upload" }, button, fileInput);
}

async function uploadImage(fj: Forgejo, file: File): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ".bin").toLowerCase();
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "image";
  const unique = now.getTime().toString(36).slice(-4);
  const path = `public/uploads/${yyyy}/${mm}/${base}-${unique}${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await fj.saveBase64(path, bytesToBase64(bytes), `content: upload ${file.name} (via admin)`);
  return `/${path.slice("public/".length)}`;
}

/* --- share (fediverse + atmosphere) --------------------------------------- */

function shareSection(
  def: CollectionDef,
  filename: string,
  data: Frontmatter,
  fieldInputs: Map<string, HTMLInputElement | HTMLTextAreaElement>,
  fj: Forgejo,
  isDraft: () => boolean,
  onSha: (sha: string) => void,
): HTMLElement {
  const integrations = getIntegrations();
  const route = entryRoute(def, filename);
  const url = route ? new URL(route, SITE.url).href : SITE.url;

  const statusText = (): string => {
    const title = String(data.title ?? "").trim();
    const bodyText = String(
      (document.getElementById("field-body") as HTMLTextAreaElement | null)?.value ?? "",
    )
      .replace(/[#*_>`]/g, "")
      .trim();
    const lead = title || bodyText.slice(0, 240) || "New on my site";
    return `${lead}\n\n${url}`;
  };

  const section = el("section", { class: "admin-share card" }, el("h2", {}, "Share"));

  const hasMastodon = integrations.mastodonInstance && integrations.mastodonToken;
  const hasBluesky = integrations.blueskyHandle && integrations.blueskyPassword;

  if (!hasMastodon && !hasBluesky) {
    section.append(
      el(
        "p",
        { class: "admin-help" },
        "Connect Mastodon or Bluesky in ",
        el("a", { href: "#/settings" }, "Settings"),
        " to announce entries and collect replies as comments.",
      ),
    );
    return section;
  }

  const writeBack = async (key: "mastodon" | "bluesky", value: string) => {
    data[key] = value;
    const input = fieldInputs.get(key);
    if (input) input.value = value;
    const path = `${def.dir}/${filename}`;
    const file = await fj.getFile(path);
    const parsed = parseDocument(file.text);
    parsed.data[key] = value;
    const sha = await fj.saveFile(
      path,
      stringifyDocument(parsed.data, parsed.body),
      `content: record ${key} announcement for ${filename} (via admin)`,
      file.sha,
    );
    onSha(sha);
  };

  const makeButton = (label: string, existingKey: "mastodon" | "bluesky", action: () => Promise<string>) => {
    const button = el("button", { class: "btn btn-secondary", type: "button" }, label);
    button.addEventListener("click", async () => {
      if (isDraft()) {
        toast("This entry is still a draft — publish it first (untick Draft and save).", "error");
        return;
      }
      if (data[existingKey]) {
        if (!confirm("Already announced once — post again?")) return;
      }
      const done = busy(button, "Posting…");
      try {
        const postedUrl = await action();
        await writeBack(existingKey, postedUrl);
        toast(`Posted! Replies will appear as comments. ${postedUrl}`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Posting failed", "error");
      } finally {
        done();
      }
    });
    return button;
  };

  const row = el("p", { class: "admin-actions" });
  if (hasMastodon) {
    row.append(
      makeButton("Post to Mastodon", "mastodon", () =>
        postToMastodon(integrations.mastodonInstance, integrations.mastodonToken, statusText()),
      ),
    );
  }
  if (hasBluesky) {
    row.append(
      makeButton("Post to Bluesky", "bluesky", () =>
        postToBluesky(
          integrations.blueskyService,
          integrations.blueskyHandle,
          integrations.blueskyPassword,
          statusText(),
        ),
      ),
    );
  }
  section.append(
    el("p", { class: "admin-help" }, "Announces this entry with a link. Replies show up as comments on the site."),
    row,
  );
  return section;
}

/* --- newsletter (Brevo via CI) --------------------------------------------- */

function newsletterSection(filename: string, fj: Forgejo): HTMLElement {
  const slug = filename.replace(/\.md$/, "");
  const button = el("button", { class: "btn btn-secondary", type: "button" }, "Send as newsletter");
  button.addEventListener("click", async () => {
    if (!confirm("Send this post to your Brevo subscribers now?")) return;
    const done = busy(button, "Starting…");
    try {
      await fj.dispatchWorkflow("newsletter.yml", { slug });
      toast("Newsletter workflow started — check your repository's Actions tab for progress.");
    } catch (err) {
      toast(
        err instanceof Error
          ? `${err.message} — make sure the newsletter workflow and Brevo secrets are set up (see README).`
          : "Could not start the workflow",
        "error",
      );
    } finally {
      done();
    }
  });
  return el(
    "section",
    { class: "admin-share card" },
    el("h2", {}, "Newsletter"),
    el(
      "p",
      { class: "admin-help" },
      "Sends this post to your subscribers through Brevo. Runs in your repository's CI, so the API key never touches the browser.",
    ),
    el("p", { class: "admin-actions" }, button),
  );
}

/* ------------------------------------------------------------------------ */
/* Media library                                                             */
/* ------------------------------------------------------------------------ */

async function mediaView(): Promise<void> {
  const fj = forgejo();
  const files = await listUploads(fj, "public/uploads", 0);
  files.sort((a, b) => b.path.localeCompare(a.path));

  const grid = el("ul", { class: "admin-media-grid" });
  if (files.length === 0) {
    grid.append(el("li", { class: "muted" }, "No uploads yet."));
  }

  for (const file of files) {
    const publicPath = `/${file.path.slice("public/".length)}`;
    const img = el("img", { alt: "", loading: "lazy" });
    fj.getRawObjectUrl(file.path)
      .then((src) => (img.src = src))
      .catch(() => img.replaceWith(el("span", { class: "admin-help" }, "preview unavailable")));

    const copyButton = el("button", { class: "btn btn-secondary admin-tool", type: "button" }, "Copy Markdown");
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(`![](${publicPath})`);
      toast("Markdown copied — add alt text where it lands.");
    });

    const deleteButton = el("button", { class: "btn btn-danger admin-tool", type: "button" }, "Delete");
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete ${file.name}? Posts that reference it will show a broken image.`)) return;
      const done = busy(deleteButton, "Deleting…");
      try {
        await fj.deleteFile(file.path, file.sha, `content: delete ${file.path} (via admin)`);
        toast("Deleted.");
        await mediaView();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Delete failed", "error");
        done();
      }
    });

    grid.append(
      el(
        "li",
        { class: "admin-media-item" },
        img,
        el("span", { class: "admin-help", style: "overflow-wrap: anywhere;" }, publicPath),
        el("span", { class: "admin-actions" }, copyButton, deleteButton),
      ),
    );
  }

  renderView(
    shell(
      "Media",
      "#/",
      el(
        "p",
        {},
        imageUploadButton(fj, () => {
          void mediaView();
        }),
      ),
      grid,
    ),
  );
}

async function listUploads(fj: Forgejo, dir: string, depth: number): Promise<DirEntry[]> {
  if (depth > 4) return [];
  const entries = await fj.listDir(dir);
  const files: DirEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "dir") {
      files.push(...(await listUploads(fj, entry.path, depth + 1)));
    } else if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(entry.name)) {
      files.push(entry);
    }
  }
  return files;
}

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

function settingsView(): HTMLElement {
  const conn = getConnection()!;
  const integrations = getIntegrations();

  const field = (
    id: string,
    label: string,
    value: string,
    opts: { type?: string; help?: string; placeholder?: string } = {},
  ) => {
    const input = el("input", {
      id,
      type: opts.type ?? "text",
      value,
      placeholder: opts.placeholder ?? "",
      autocapitalize: "none",
      autocomplete: "off",
      spellcheck: false,
    });
    const wrap = el(
      "p",
      { class: "admin-field" },
      el("label", { htmlFor: id }, label),
      input,
      opts.help ? el("span", { class: "admin-help" }, opts.help) : null,
    );
    return { input, wrap };
  };

  const mastoInstance = field("set-masto-instance", "Mastodon instance", integrations.mastodonInstance, {
    placeholder: "https://mastodon.social",
  });
  const mastoToken = field("set-masto-token", "Mastodon access token", integrations.mastodonToken, {
    type: "password",
    help: "On your instance: Settings → Development → New application, with write:statuses scope.",
  });
  const bskyService = field("set-bsky-service", "Bluesky service", integrations.blueskyService, {
    placeholder: "https://bsky.social",
  });
  const bskyHandle = field("set-bsky-handle", "Bluesky handle", integrations.blueskyHandle, {
    placeholder: "you.bsky.social",
  });
  const bskyPassword = field("set-bsky-password", "Bluesky app password", integrations.blueskyPassword, {
    type: "password",
    help: "Create one at bsky.app → Settings → App passwords. Never use your main password.",
  });

  const saveButton = el("button", { class: "btn", type: "submit" }, "Save settings");
  const form = el(
    "form",
    { class: "admin-form" },
    el("h2", {}, "Fediverse (Mastodon)"),
    mastoInstance.wrap,
    mastoToken.wrap,
    el("h2", {}, "Atmosphere (Bluesky)"),
    bskyService.wrap,
    bskyHandle.wrap,
    bskyPassword.wrap,
    el(
      "p",
      { class: "admin-help" },
      "These credentials stay in this browser's storage only. They are used to cross-post entries; replies then appear as comments on your site.",
    ),
    el("p", {}, saveButton),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setIntegrations({
      mastodonInstance: mastoInstance.input.value.trim(),
      mastodonToken: mastoToken.input.value.trim(),
      blueskyService: bskyService.input.value.trim() || "https://bsky.social",
      blueskyHandle: bskyHandle.input.value.trim().replace(/^@/, ""),
      blueskyPassword: bskyPassword.input.value.trim(),
    });
    toast("Settings saved.");
  });

  const disconnect = el("button", { class: "btn btn-danger", type: "button" }, "Disconnect");
  disconnect.addEventListener("click", () => {
    if (!confirm("Forget the repository connection and token stored in this browser?")) return;
    setConnection(null);
    location.hash = "#/connect";
  });

  return shell(
    "Settings",
    "#/",
    el(
      "section",
      { class: "card", style: "margin-bottom: 1.5rem;" },
      el("h2", {}, "Connection"),
      el("p", {}, `${conn.baseUrl}/${conn.owner}/${conn.repo} (branch ${conn.branch})`),
      el("p", {}, disconnect),
    ),
    form,
    el(
      "section",
      { class: "card", style: "margin-top: 1.5rem;" },
      el("h2", {}, "Newsletter (Brevo)"),
      el(
        "p",
        { class: "admin-help" },
        "Newsletter sending runs in your repository's CI so the Brevo API key is never exposed here. Add the BREVO_API_KEY, BREVO_LIST_IDS, BREVO_SENDER_NAME and BREVO_SENDER_EMAIL secrets to the repository, then use “Send as newsletter” on any post. The signup form on the site is configured in src/config/site.ts.",
      ),
    ),
  );
}

/* ------------------------------------------------------------------------ */

window.addEventListener("hashchange", () => void route());
void route();
