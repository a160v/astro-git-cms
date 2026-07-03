/** Turn any title into a safe, readable filename slug. */
export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

/** yyyy-mm-dd of "now", used to prefix note and picture filenames. */
export function todayStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
