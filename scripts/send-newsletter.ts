/**
 * Send a post to your Brevo subscribers as an email campaign.
 *
 * Runs in CI (see .forgejo/workflows/newsletter.yml) so the API key never
 * leaves your repository's secrets. Can also be run locally:
 *
 *   BREVO_API_KEY=… BREVO_LIST_IDS=3 BREVO_SENDER_NAME="Me" \
 *   BREVO_SENDER_EMAIL=me@example.com bun scripts/send-newsletter.ts <post-slug>
 */
import { readFile } from "node:fs/promises";
import { marked } from "marked";
import { parseDocument } from "../src/lib/frontmatter";
import { SITE } from "../src/config/site";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
  console.error("Usage: bun scripts/send-newsletter.ts <post-slug>");
  process.exit(1);
}

const apiKey = process.env.BREVO_API_KEY;
const listIds = (process.env.BREVO_LIST_IDS ?? "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter((id) => Number.isFinite(id) && id > 0);
const senderName = process.env.BREVO_SENDER_NAME ?? SITE.author;
const senderEmail = process.env.BREVO_SENDER_EMAIL;

if (!apiKey || listIds.length === 0 || !senderEmail) {
  console.error(
    "Missing configuration. Required env vars: BREVO_API_KEY, BREVO_LIST_IDS (comma-separated), BREVO_SENDER_EMAIL (a sender verified in Brevo). Optional: BREVO_SENDER_NAME.",
  );
  process.exit(1);
}

const filePath = `src/content/posts/${slug}.md`;
const raw = await readFile(filePath, "utf8");
const { data, body } = parseDocument(raw);

if (data.draft === true) {
  console.error(`"${slug}" is still a draft — publish it before sending.`);
  process.exit(1);
}

const title = String(data.title ?? slug);
const postUrl = `${SITE.url}/posts/${slug}`;
const bodyHtml = marked.parse(body) as string;

const html = `<!doctype html>
<html lang="${SITE.locale}">
<body style="margin:0;padding:0;background:#f5f5f7;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;">
    <p style="font-size:13px;color:#6e6e73;margin:0 0 24px;">${escapeHtml(SITE.title)}</p>
    <h1 style="font-size:26px;line-height:1.25;margin:0 0 16px;">${escapeHtml(title)}</h1>
    <div style="font-size:16px;line-height:1.65;">${bodyHtml}</div>
    <p style="margin:32px 0;">
      <a href="${postUrl}" style="color:#0066cc;">Read on the site →</a>
    </p>
    <hr style="border:none;border-top:1px solid #d2d2d7;margin:24px 0;">
    <p style="font-size:12px;color:#6e6e73;">
      You're receiving this because you subscribed on ${escapeHtml(SITE.title)}.
      {{ unsubscribe }}
    </p>
  </div>
</body>
</html>`;

console.log(`Creating Brevo campaign for "${title}" → lists [${listIds.join(", ")}]…`);

const createRes = await fetch("https://api.brevo.com/v3/emailCampaigns", {
  method: "POST",
  headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    name: `Post: ${title} (${new Date().toISOString().slice(0, 10)})`,
    subject: title,
    sender: { name: senderName, email: senderEmail },
    htmlContent: html,
    recipients: { listIds },
  }),
});

if (!createRes.ok) {
  console.error(`Brevo campaign creation failed (${createRes.status}):`, await createRes.text());
  process.exit(1);
}

const campaign = (await createRes.json()) as { id: number };
console.log(`Campaign #${campaign.id} created. Sending now…`);

const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
  method: "POST",
  headers: { "api-key": apiKey, Accept: "application/json" },
});

if (!sendRes.ok) {
  console.error(`Brevo send failed (${sendRes.status}):`, await sendRes.text());
  console.error(`The campaign is saved as a draft in Brevo — you can review and send it there.`);
  process.exit(1);
}

console.log(`Sent! "${title}" is on its way to your subscribers.`);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
