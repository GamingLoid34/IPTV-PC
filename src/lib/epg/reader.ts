import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  CHANNELS_PATH,
  MANIFEST_PATH,
  PROGRAMMES_DIR,
  SEARCH_INDEX_PATH,
  sanitizeChannelId,
} from "@/lib/epg/cachePaths";
import type {
  EpgChannel,
  EpgManifest,
  EpgProgramme,
  SearchIndexEntry,
} from "@/types/epg";

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function getCacheStatus(): Promise<EpgManifest | null> {
  try {
    return await readJsonFile<EpgManifest>(MANIFEST_PATH);
  } catch {
    return null;
  }
}

export async function getChannels(): Promise<EpgChannel[]> {
  const manifest = await getCacheStatus();
  if (!manifest) {
    throw new Error("EPG-cache saknas eller är inkomplett.");
  }
  return await readJsonFile<EpgChannel[]>(CHANNELS_PATH);
}

export async function getProgrammesForChannel(
  channelId: string
): Promise<EpgProgramme[]> {
  const manifest = await getCacheStatus();
  if (!manifest) {
    throw new Error("EPG-cache saknas eller är inkomplett.");
  }

  const safeName = sanitizeChannelId(channelId);
  const filePath = path.join(PROGRAMMES_DIR, `${safeName}.json`);

  try {
    return await readJsonFile<EpgProgramme[]>(filePath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
}

export async function searchProgrammes(
  query: string,
  opts?: { fromMs?: number; toMs?: number; categories?: string[] }
): Promise<SearchIndexEntry[]> {
  const manifest = await getCacheStatus();
  if (!manifest) {
    throw new Error("EPG-cache saknas eller är inkomplett.");
  }

  const normalizedQuery = query.trim().toLowerCase();
  const categories = (opts?.categories ?? []).map((c) => c.toLowerCase());
  const fromMs = opts?.fromMs;
  const toMs = opts?.toMs;

  const entries = await readJsonFile<SearchIndexEntry[]>(SEARCH_INDEX_PATH);
  const filtered = entries.filter((entry) => {
    if (normalizedQuery && !entry.searchText.includes(normalizedQuery)) {
      return false;
    }

    if (typeof fromMs === "number" && entry.stopMs < fromMs) {
      return false;
    }
    if (typeof toMs === "number" && entry.startMs > toMs) {
      return false;
    }

    if (categories.length > 0) {
      const programmeCats = entry.categories.map((c) => c.toLowerCase());
      const hasMatch = categories.some((needle) => programmeCats.includes(needle));
      if (!hasMatch) return false;
    }

    return true;
  });

  return filtered.slice(0, 500);
}
