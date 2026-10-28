// Progress is a per-visitor convenience: storage can be missing, full or
// blocked (private windows, previews), so every access is wrapped.
export function safeStorage(s?: Storage | null): Storage | null {
  if (s === null) return null;
  try {
    const st = s ?? globalThis.localStorage;
    const k = "__bp_probe__";
    st.setItem(k, "1");
    st.removeItem(k);
    return st;
  } catch {
    return null;
  }
}

export function load<T>(st: Storage | null, key: string): T | null {
  try {
    const v = st?.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function save(st: Storage | null, key: string, v: unknown) {
  try {
    st?.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: progress just isn't kept */
  }
}

export function clear(st: Storage | null, key: string) {
  try {
    st?.removeItem(key);
  } catch {
    /* ignore */
  }
}
