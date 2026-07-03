# astro-git-cms

A tiny, git-based CMS and starter theme for [Astro](https://astro.build).
Your content lives as Markdown in your own git repository; publishing means
committing. No database, no server, nothing to maintain.

Built with **Bun** and **TypeScript**. Designed for personal sites, with a
minimalist, Apple-inspired UI and accessibility as a first-class concern.

## What you get

- **Content types**: pages, posts, notes (microblog), pictures (photo feed),
  and a blogroll shown as a visual grid.
- **Admin at `/admin`** — a mobile-friendly writing app that commits straight
  to your Forgejo/Codeberg repository through its API. Write comfortably from
  a phone.
- **Drafts** — new entries start as drafts; drafts are saved to git but never
  built, listed, or syndicated.
- **Image management** — upload images from the editor or the media library;
  they are committed to `public/uploads/YYYY/MM/`.
- **Smart paste** — paste formatted content from Google Docs, Word, Notion,
  Medium or any web page and it is converted to clean Markdown automatically.
- **Fediverse + Atmosphere** (both optional) — cross-post entries to Mastodon
  (ActivityPub) and Bluesky (ATProto) from the admin; replies show up as
  comments on your site. Purely client-side, conflicts with nothing.
- **RSS** — feeds for posts (`/rss.xml`) and notes (`/notes/rss.xml`), plus a
  sitemap and full meta/OpenGraph tags.
- **Newsletter via Brevo** (optional) — a signup form that posts to your Brevo
  form endpoint, and a "Send as newsletter" button that emails a post to your
  subscribers through CI (the API key never touches the browser).
- **Analytics** (optional) — GoatCounter, privacy-friendly and cookie-free.
- **Deploys to Codeberg Pages** (or any Forgejo instance) with the included
  workflow.

## Quick start

```sh
bun install
bun run dev        # local site + admin at http://localhost:4321
bun test           # unit tests
bun run build      # static build into dist/
```

Make it yours by editing **`src/config/site.ts`** — title, URL, author,
navigation, and every feature toggle live there.

## Deploying to Codeberg Pages

1. Push this repository to Codeberg (or any Forgejo instance).
2. Enable **Actions** for the repository (Settings → Units).
3. Set `url` in `src/config/site.ts` to your Pages URL
   (e.g. `https://<user>.codeberg.page` or a custom domain).
4. Push to `main`. The workflow in `.forgejo/workflows/deploy.yml` builds the
   site and force-pushes `dist/` to the `pages` branch, which Codeberg Pages
   serves. If the default Actions token can't push, add a `DEPLOY_TOKEN`
   secret containing a token with repository write access.

## Using the admin

Open `/admin` on your deployed site (or in `bun run dev`) and connect:

- **Instance**: `https://codeberg.org` (or your Forgejo)
- **Owner / repository / branch**: where this site lives
- **Access token**: create one under *Settings → Applications* on your Forgejo
  instance with **read/write repository** permission.

The token is stored **only in that browser's localStorage** — treat the admin
like a signed-in app on your device, and use a scoped token you can revoke.
Anyone can *load* `/admin` (it's a static page), but it is useless without a
valid token; all authorization is enforced by Forgejo.

Every save is a commit; the deploy workflow rebuilds the site. Add `/admin` to
your phone's home screen for an app-like experience.

## Connecting the fediverse and the atmosphere

Both features are **off per entry until you cross-post** and can be globally
disabled in `src/config/site.ts` → `features`.

- **Mastodon**: in the admin's Settings, enter your instance and an access
  token (*Preferences → Development → New application*, `write:statuses`).
- **Bluesky**: enter your handle and an **app password**
  (*Settings → App passwords*), never your main password.

Pressing *Post to Mastodon / Bluesky* on an entry announces it with a link and
writes the announcement URL into the entry's frontmatter (`mastodon:` /
`bluesky:`). The comments section fetches replies to those announcements in
the reader's browser and renders them — as plain text, so nobody can inject
HTML into your pages. Readers reply from their own accounts; there is nothing
to moderate or host.

Set `fediverse.creator` in the site config to get author attribution
(`fediverse:creator`) when your links are shared on Mastodon.

## Newsletter (Brevo)

Two pieces, deliberately non-overlapping with what Brevo already does:

1. **Signup form** — create a form in Brevo (*Contacts → Forms*), copy the
   form's action URL from the HTML embed, and put it in
   `src/config/site.ts` → `newsletter.brevoFormAction`, then enable
   `features.newsletter`. The site renders its own accessible form that posts
   to Brevo; double opt-in, storage and unsubscribes stay in Brevo.
2. **Sending posts** — add repository secrets `BREVO_API_KEY`,
   `BREVO_LIST_IDS` (comma-separated), `BREVO_SENDER_EMAIL` and optionally
   `BREVO_SENDER_NAME`, then use **Send as newsletter** on any published post
   in the admin (or run the *Send newsletter* workflow manually). The campaign
   is created and sent by `scripts/send-newsletter.ts` in CI.

## Analytics

Create a free [GoatCounter](https://www.goatcounter.com) account, put your
code in `src/config/site.ts` → `analytics.goatcounterCode`, and enable
`features.analytics`. No cookies, GDPR-friendly, and your dashboard lives at
`https://<code>.goatcounter.com`.

## Content model

```
src/content/
  posts/      title, description, date, tags, cover(+alt), draft, mastodon, bluesky
  notes/      date, draft, mastodon, bluesky           (title-less microblog)
  pages/      title, description, draft                (served at /<slug>)
  pictures/   title, date, image, alt (required!), draft, mastodon, bluesky
  blogroll/   name, url, image(+alt), draft            (body = short description)
```

Schemas are enforced by Astro content collections (`src/content.config.ts`)
and mirrored for the admin in `src/admin/schema.ts` — if you add a field, add
it in both places.

## Accessibility

Semantic landmarks, skip link, visible focus rings, `prefers-reduced-motion`
support, WCAG AA color contrast in light and dark mode, 44px touch targets,
labeled forms, `aria-live` status messages in the admin, and required alt
text for pictures. If you find something that could work better with a screen
reader or keyboard, please open an issue.

## Project layout

```
src/
  config/site.ts        ← the one file to edit
  content/              ← your writing (Markdown)
  content.config.ts     ← collection schemas
  layouts/, components/, pages/, styles/   ← the theme
  admin/                ← the /admin single-page app
  lib/                  ← shared frontmatter/slug utilities
scripts/send-newsletter.ts   ← Brevo campaign sender (CI)
.forgejo/workflows/     ← deploy + newsletter workflows
tests/                  ← bun test
```
