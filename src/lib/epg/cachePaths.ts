import path from "node:path";
import { mkdir } from "node:fs/promises";

export const CACHE_ROOT = path.resolve(process.cwd(), "data/epg-cache");
export const MANIFEST_PATH = path.join(CACHE_ROOT, "manifest.json");
export const CHANNELS_PATH = path.join(CACHE_ROOT, "channels.json");
export const PROGRAMMES_DIR = path.join(CACHE_ROOT, "programmes-by-channel");
export const SEARCH_INDEX_PATH = path.join(CACHE_ROOT, "search-index.json");

export function sanitizeChannelId(channelId: string): string {
  return encodeURIComponent(channelId);
}

export async function ensureCacheDirs(): Promise<void> {
  await mkdir(CACHE_ROOT, { recursive: true });
  await mkdir(PROGRAMMES_DIR, { recursive: true });
}
