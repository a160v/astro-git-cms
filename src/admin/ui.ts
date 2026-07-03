/** Tiny DOM helpers — the admin is plain TypeScript, no framework. */

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      node.className = String(value);
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign(node.dataset, value);
    } else if (key === "style" && typeof value === "string") {
      node.setAttribute("style", value);
    } else if (key in node) {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, kind: "ok" | "error" = "ok"): void {
  document.querySelector(".admin-toast")?.remove();
  const node = el(
    "div",
    {
      class: `admin-toast admin-toast-${kind}`,
      role: kind === "error" ? "alert" : "status",
    },
    message,
  );
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), kind === "error" ? 7000 : 3500);
}

export function busy<T extends HTMLButtonElement>(button: T, label = "Working…"): () => void {
  const original = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = label;
  return () => {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = original;
  };
}
