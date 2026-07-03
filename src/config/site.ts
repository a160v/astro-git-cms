/**
 * Site-wide configuration.
 *
 * This is the single file you edit to make the site yours.
 * Every integration can be switched on/off in `features` below —
 * when a feature is off, nothing related to it is rendered or loaded.
 */
export const SITE = {
  /** Site title, shown in the header and in feeds. */
  title: "My Quiet Corner",
  /** One-line description, used on the home page and in meta tags. */
  description: "Notes, posts and pictures from a small personal website.",
  /** Public URL of the deployed site (no trailing slash). */
  url: "https://example.codeberg.page",
  /** Author name, used in feeds and meta tags. */
  author: "Your Name",
  /** BCP-47 language tag for the whole site. */
  locale: "en",

  /** Main navigation. `href` can point to any page, including entries of the `pages` collection. */
  nav: [
    { label: "Posts", href: "/posts" },
    { label: "Notes", href: "/notes" },
    { label: "Pictures", href: "/pictures" },
    { label: "Blogroll", href: "/blogroll" },
    { label: "About", href: "/about" },
  ],

  /** Feature switches. Turn anything off and it disappears completely. */
  features: {
    /** Show comments pulled from the fediverse (Mastodon) under posts/notes/pictures. */
    fediverseComments: true,
    /** Show comments pulled from the atmosphere (Bluesky / ATProto) under posts/notes/pictures. */
    atprotoComments: true,
    /** Load privacy-friendly analytics (GoatCounter). */
    analytics: false,
    /** Show the newsletter signup form (Brevo). */
    newsletter: false,
  },

  /**
   * Fediverse identity. Used for the `fediverse:creator` meta tag
   * (author attribution when your links are shared on Mastodon).
   * Example: "@you@mastodon.social"
   */
  fediverse: {
    creator: "",
  },

  /** Your Bluesky handle, linked in the footer when set. Example: "you.bsky.social" */
  bluesky: {
    handle: "",
  },

  /**
   * Analytics (GoatCounter — free, no cookies, GDPR-friendly).
   * Create an account at https://www.goatcounter.com and put your code here.
   * Example: code "mysite" → dashboard at https://mysite.goatcounter.com
   */
  analytics: {
    goatcounterCode: "",
  },

  /**
   * Newsletter signup (Brevo).
   * In Brevo: Contacts → Forms → create a form, then copy the form's
   * "action" URL from the HTML embed (looks like https://…sibforms.com/serve/…).
   * The site renders its own accessible form that submits to that URL,
   * so nothing overlaps with Brevo's own hosted pages.
   */
  newsletter: {
    brevoFormAction: "",
  },
};

export type SiteConfig = typeof SITE;
