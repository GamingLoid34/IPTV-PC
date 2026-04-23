import type { XtreamCredentials } from "@/types/xtream";

export const STORAGE_KEY = "iptv-pc:playlist";

function isValidStoredCredentials(x: unknown): x is XtreamCredentials {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.serverUrl !== "string" ||
    typeof o.username !== "string" ||
    typeof o.password !== "string"
  ) {
    return false;
  }
  if (
    o.serverUrl.trim() === "" ||
    o.username.trim() === "" ||
    o.password === ""
  ) {
    return false;
  }
  return true;
}

export function savePlaylist(credentials: XtreamCredentials): void {
  if (typeof window === "undefined") return;
  try {
    const payload: XtreamCredentials = {
      serverUrl: credentials.serverUrl.trim(),
      username: credentials.username.trim(),
      password: credentials.password,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota, private mode, etc. — best-effort only
  }
}

export function loadPlaylist(): XtreamCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw) as unknown;
    if (!isValidStoredCredentials(parsed)) return null;
    return {
      serverUrl: parsed.serverUrl.trim(),
      username: parsed.username.trim(),
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

export function clearPlaylist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
