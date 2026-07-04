/**
 * Loads the CMS configuration from the connected repository.
 *
 * If the repo has a `cms.config.json` at its root, it defines the content
 * model the admin manages (collections, fields, upload paths) — this is what
 * makes the admin headless: the same build can manage any site. Without one,
 * the defaults in schema.ts (this repo's own theme) apply.
 */
import type { GitClient } from "./git";
import { defaultConfig, parseCmsConfig, type CmsConfig } from "./schema";

export const CMS_CONFIG_FILE = "cms.config.json";

let cached: CmsConfig | null = null;
let cachedFor = "";
let source: "defaults" | "repo" = "defaults";

/** Where the active content model came from (for display in Settings). */
export function cmsConfigSource(): "defaults" | "repo" {
  return source;
}

export async function loadCmsConfig(client: GitClient, onWarning?: (message: string) => void): Promise<CmsConfig> {
  const signature = client.signature;
  if (cached && cachedFor === signature) return cached;

  let config = defaultConfig();
  source = "defaults";
  try {
    const file = await client.getFile(CMS_CONFIG_FILE);
    config = parseCmsConfig(file.text);
    source = "repo";
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      onWarning?.(
        err instanceof Error && !status
          ? `${err.message} — using the default content model.`
          : `Could not read ${CMS_CONFIG_FILE} — using the default content model.`,
      );
    }
  }
  cached = config;
  cachedFor = signature;
  return config;
}

export function resetCmsConfig(): void {
  cached = null;
  cachedFor = "";
  source = "defaults";
}
