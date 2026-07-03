#!/usr/bin/env bash
#
# Build the site and publish it to the `pages` branch that Codeberg Pages serves.
#
# Codeberg does NOT host Forgejo Actions runners, so the site can't be built in
# Codeberg CI without attaching your own runner. This script does the build and
# publish from your machine instead — one command, no runner required.
#
#   bun run deploy
#
# Optional environment variables:
#   DEPLOY_REMOTE   git URL to push to        (default: this repo's `origin`)
#   DEPLOY_BRANCH   branch Pages serves        (default: pages)
#   SITE_BASE       build-time base path       (default: SITE.basePath in config)
#
# Example — publish to a separate repo served at the domain root:
#   DEPLOY_REMOTE=https://codeberg.org/you/pages.git SITE_BASE=/ bun run deploy
set -euo pipefail

REMOTE="${DEPLOY_REMOTE:-$(git remote get-url origin)}"
BRANCH="${DEPLOY_BRANCH:-pages}"

echo "→ Building…"
bun run build

echo "→ Publishing dist/ to ${REMOTE} (${BRANCH})…"
cd dist
touch .nojekyll                     # tell Pages to serve files as-is
rm -rf .git
git init -q -b "$BRANCH"
git add -A
git -c user.name="pages-bot" -c user.email="pages-bot@localhost" \
    commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -f "$REMOTE" "$BRANCH"
rm -rf .git
cd ..

echo "✓ Done. Codeberg Pages will serve the new build in a minute or two."
