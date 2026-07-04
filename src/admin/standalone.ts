/**
 * Entry point for the standalone ("headless") admin build — the same app
 * that ships at /admin of the theme, bundled on its own so it can be hosted
 * anywhere (or wrapped in a desktop shell) and pointed at any repository.
 */
import "../styles/global.css";
import "./admin.css";
import "./main";

// Installable, offline-capable app shell. The service worker only caches
// this app's own files — API calls to your git forge always hit the network.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is progressive enhancement */
    });
  });
}
