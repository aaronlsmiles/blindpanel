import { afterEach, vi } from "vitest";

const mounted: { destroy(): void }[] = [];
export const track = <T extends { destroy(): void }>(c: T) => (mounted.push(c), c);

/** Vitest runs without globals: every UI test file registers this. */
export function cleanup() {
  while (mounted.length) mounted.pop()!.destroy();
  document.body.replaceChildren();
}

export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

export function stubMedia() {
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(() => Promise.resolve()) });
}

export const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

export { afterEach };
