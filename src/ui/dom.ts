import { parseBold } from "../core/text.js";

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

/** A tiny element builder. Strings become text nodes; markup is never parsed. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Study wording: **bold** runs become <strong>, everything else plain text. */
export function rich(s: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const r of parseBold(s)) f.append(r.b ? h("strong", {}, r.t) : document.createTextNode(r.t));
  return f;
}


/** append, skipping null/false (Element.append would print "null") */
export function put(parent: Element, ...children: Child[]) {
  for (const c of children) if (c !== null && c !== undefined && c !== false) parent.append(c);
}
