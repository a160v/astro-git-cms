# astro-git-cms

A tiny, headless, git-based CMS. Your content is Markdown in your own
repository — GitHub or Forgejo/Codeberg — and publishing means committing.
No database, no server, no accounts.

Two ways to use it:

1. **Headless** — build the admin as a standalone app and point it at *any*
   static site's repository (Astro, Hugo, Eleventy…). Your site's deploy
   pipeline (Cloudflare Pages, GitHub Pages, Codeberg Pages…) picks up the
   commits and rebuilds.
2. **Full site** — this repo is also a complete Astro starter theme (posts,
   notes, pictures, pages, blogroll) with the admin bundled at `/admin`.

Built with **Bun** and **TypeScript**. Mobile-friendly, installable as an
app (PWA), accessible, and small (~28 kB gzipped).

## Quick start

```sh
bun install
bun run dev          # theme + admin at http://localhost:4321
bun run dev:admin    # standalone admin only
bun test
```

## Headless: manage any site

```sh
bun run build:admin  # → dist-admin/ — a self-contained static app
```

Host `dist-admin/` anywhere (a Cloudflare Pages project, a `/admin` folder
of an existing site, or just your laptop) and open it:

- **Where is your repository?** GitHub, or any Forgejo/Codeberg instance.
- **Access token** — GitHub: a fine-grained PAT scoped to the one repository
  with read/write *Contents*. Forgejo: *Settings → Applications*, repository
  read/write. Entered once; stored only in that browser/device.

Then describe your site's content model in a **`cms.config.json`** at the
target repository's root — collections, directories, frontmatter fields,
filename patterns and upload paths. See
[`cms.config.example.json`](./cms.config.example.json). Without one, the
admin manages this theme's default collections.

Everything the admin does is a commit: create/edit/delete entries, upload
images, save drafts (`draft: true` in frontmatter). Entries written from
the admin start as drafts; make sure your site skips drafts when building.

## The admin

- **Write from anywhere** — phone-friendly editor with Markdown toolbar,
  live preview, and smart paste (Google Docs, Word, Notion, web pages →
  clean Markdown).
- **Media library** — upload, browse and delete images; committed to your
  uploads directory with dated folders.
- **Cross-post** (optional) — announce entries on Mastodon and Bluesky;
  replies appear as comments on your site (theme feature).
- **Newsletter** (optional) — trigger a Brevo send through your repo's CI,
  so the API key never touches the browser.

## The theme (optional)

A quiet, Apple-inspired personal site: posts, notes (microblog), pictures
(photo feed), standalone pages, a visual blogroll, RSS feeds, sitemap,
OpenGraph tags, fediverse/Bluesky comments, GoatCounter analytics and a
Brevo signup form. Accessibility is a first-class concern (WCAG AA,
keyboard, screen readers, reduced motion).

Edit **`src/config/site.ts`** — title, URL, author, navigation and every
feature switch live there. Content schemas are in `src/content.config.ts`.

```
src/
  config/site.ts   ← the one file to edit
  content/         ← your writing (posts/, notes/, pages/, pictures/, blogroll/)
  admin/           ← the CMS app (shared by /admin and the standalone build)
  layouts/, components/, pages/, styles/  ← the theme
admin/             ← standalone admin entry + PWA assets
scripts/           ← deploy.sh (Codeberg Pages), send-newsletter.ts (Brevo)
```

### Deploying the theme

- **Cloudflare Pages / GitHub Pages**: build command `bun run build`, output
  `dist/`.
- **Codeberg Pages** (no CI runner needed): set `url`/`basePath` in
  `src/config/site.ts`, then `bun run deploy` — it builds and pushes `dist/`
  to the `pages` branch. Serving from a sub-path? Set `basePath: "/<repo>/"`.

## Integrations, in one paragraph each

**Mastodon / Bluesky** — in the admin's Settings, add your Mastodon instance
+ token (`write:statuses`) and/or Bluesky handle + app password. *Post to
Mastodon/Bluesky* announces an entry and records the announcement URL in its
frontmatter; the theme's comments section then renders replies (as plain
text) fetched in the reader's browser. Nothing to host or moderate.

**Newsletter (Brevo)** — add `BREVO_API_KEY`, `BREVO_LIST_IDS`,
`BREVO_SENDER_EMAIL` (and optionally `BREVO_SENDER_NAME`) as repository
secrets; the *Send as newsletter* button dispatches
`.forgejo/workflows/newsletter.yml`, which runs
`scripts/send-newsletter.ts` in CI. The signup form is enabled in
`src/config/site.ts` with your Brevo form's action URL.

**Analytics (GoatCounter)** — put your code in `src/config/site.ts` and
enable `features.analytics`. Cookie-free.

## Security model

The admin is a static page; anyone can load it, nobody can use it without a
repository token. Tokens live in the browser's localStorage only and go
straight to your forge's API — treat the admin like a signed-in app on your
device, and use a narrowly-scoped token you can revoke.
