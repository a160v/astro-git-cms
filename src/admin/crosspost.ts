/**
 * Cross-posting to the fediverse (Mastodon) and the atmosphere (Bluesky/ATProto).
 * Both calls run from the author's browser using credentials stored locally.
 * The returned status/post URL is written back into the entry's frontmatter,
 * which is what makes the comments section work.
 */

export async function postToMastodon(
  instance: string,
  token: string,
  status: string,
): Promise<string> {
  const base = normalizeInstance(instance);
  const res = await fetch(`${base}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, visibility: "public" }),
  });
  if (!res.ok) throw new Error(`Mastodon replied ${res.status} — check instance URL and token.`);
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function postToBluesky(
  service: string,
  identifier: string,
  appPassword: string,
  text: string,
): Promise<string> {
  const base = normalizeInstance(service || "https://bsky.social");

  const sessionRes = await fetch(`${base}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  if (!sessionRes.ok) {
    throw new Error(`Bluesky sign-in failed (${sessionRes.status}) — check handle and app password.`);
  }
  const session = (await sessionRes.json()) as { accessJwt: string; did: string; handle: string };

  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    facets: linkFacets(text),
  };

  const createRes = await fetch(`${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!createRes.ok) throw new Error(`Bluesky posting failed (${createRes.status}).`);
  const created = (await createRes.json()) as { uri: string };
  const rkey = created.uri.split("/").pop();
  return `https://bsky.app/profile/${session.handle}/post/${rkey}`;
}

/** Make URLs in the post text clickable on Bluesky (rich-text link facets). */
function linkFacets(text: string) {
  const encoder = new TextEncoder();
  const facets: object[] = [];
  const regex = /https?:\/\/[^\s)]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
    });
  }
  return facets.length > 0 ? facets : undefined;
}

function normalizeInstance(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}
