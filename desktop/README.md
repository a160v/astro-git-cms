# Writer — the desktop app

Offline-first writing for your git-based site: open a **local clone** of the
repository, write in a **Notion-like block editor** (BlockNote — slash menu,
drag handles, paste from anywhere), and hit **Publish** to commit & push.
Your host (Cloudflare Pages, etc.) rebuilds the site from the push.

The content model comes from the repository's `cms.config.json` — the same
file the web admin uses, so both stay in sync. The frontmatter/schema core
is shared with `../src/admin` (no duplication).

## Develop

```sh
cd desktop
bun install
bun run dev            # UI only, in a browser, with an in-memory demo project
bun run tauri dev      # the real app (requires Rust; see below)
```

`bun run dev` needs no Rust at all — the app detects it isn't inside Tauri
and uses a mock backend, which is handy for UI work and demos.

## Build the real app

Prereqs: [Rust](https://rustup.rs) and the Tauri v2 system packages for your
OS (see tauri.app → Prerequisites; on Linux that includes `libwebkit2gtk-4.1-dev`).

```sh
bun run tauri icon ../admin/public/icon.svg   # generate app icons once
bun run tauri build                            # installers in src-tauri/target/release/bundle
```

## Auth model (no tokens in the app)

Publishing uses your **system git credentials** via libgit2: first the
configured credential helper (`gh auth login`, Git Credential Manager,
macOS keychain), then the SSH agent. The app itself never stores or even
sees a token.
