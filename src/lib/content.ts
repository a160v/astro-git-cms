import { getCollection, type CollectionEntry, type CollectionKey } from "astro:content";

/**
 * Entries that should appear on the built site.
 * Drafts are visible while developing (`astro dev`) but never in a production build,
 * so saving a draft from the admin is always safe.
 */
export async function getPublished<C extends CollectionKey>(
  collection: C,
): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, ({ data }) => {
    const draft = "draft" in data ? (data.draft as boolean) : false;
    return import.meta.env.DEV || !draft;
  });
}

/** Newest first, for any collection with a `date` field. */
export function byDateDesc<T extends { data: { date: Date } }>(a: T, b: T): number {
  return b.data.date.valueOf() - a.data.date.valueOf();
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
