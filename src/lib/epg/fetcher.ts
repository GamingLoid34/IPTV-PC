import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import type { XtreamCredentials } from "@/types/xtream";
import type {
  EpgChannel,
  EpgManifest,
  EpgProgramme,
  SearchIndexEntry,
} from "@/types/epg";
import { ensureCacheDirs, CACHE_ROOT, sanitizeChannelId } from "@/lib/epg/cachePaths";
import { parseXmltvStream } from "@/lib/epg/parser";

const XTREAM_USER_AGENT = "Lavf/60.3.100";

function maskPasswordInUrl(url: string): string {
  return url.replace(/([?&]password=)[^&]+/i, "$1***");
}

function toJson(data: unknown): string {
  return `${JSON.stringify(data)}\n`;
}

export async function fetchAndCacheEpg(
  credentials: XtreamCredentials
): Promise<EpgManifest> {
  await ensureCacheDirs();

  const baseUrl = credentials.serverUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({
    username: credentials.username.trim(),
    password: credentials.password,
  });
  const sourceUrl = `${baseUrl}/xmltv.php?${params.toString()}`;

  const response = await fetch(sourceUrl, {
    method: "GET",
    headers: {
      "User-Agent": XTREAM_USER_AGENT,
    },
  });

  if (response.status !== 200) {
    throw new Error(`EPG fetch misslyckades (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("application/xml") &&
    !contentType.startsWith("text/xml")
  ) {
    throw new Error(`Fel content-type för EPG: ${contentType || "(saknas)"}`);
  }

  if (!response.body) {
    throw new Error("EPG-svaret innehåller ingen body.");
  }

  const channels: EpgChannel[] = [];
  const programmesByChannel = new Map<string, EpgProgramme[]>();
  const searchIndex: SearchIndexEntry[] = [];
  let programmeCount = 0;
  let earliestStartMs = Number.POSITIVE_INFINITY;
  let latestStopMs = Number.NEGATIVE_INFINITY;

  await parseXmltvStream(
    Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
    (channel) => {
      channels.push(channel);
    },
    (programme) => {
      programmeCount += 1;
      const existing = programmesByChannel.get(programme.channelId);
      if (existing) {
        existing.push(programme);
      } else {
        programmesByChannel.set(programme.channelId, [programme]);
      }

      const title = programme.title.toLowerCase();
      const description = (programme.description ?? "").toLowerCase();
      const searchText = `${title} ${description}`.trim();
      const startMs = Date.parse(programme.start);
      const stopMs = Date.parse(programme.stop);
      earliestStartMs = Math.min(earliestStartMs, startMs);
      latestStopMs = Math.max(latestStopMs, stopMs);

      searchIndex.push({
        programmeRef: {
          channelId: programme.channelId,
          start: programme.start,
        },
        searchText,
        categories: programme.categories,
        startMs,
        stopMs,
      });
    }
  );

  if (!Number.isFinite(earliestStartMs) || !Number.isFinite(latestStopMs)) {
    throw new Error("Ingen programme-data hittades i XMLTV.");
  }

  const cacheParent = path.dirname(CACHE_ROOT);
  await mkdir(cacheParent, { recursive: true });
  const tmpRoot = path.join(cacheParent, `epg-cache-tmp-${Date.now()}`);
  const tmpProgrammesDir = path.join(tmpRoot, "programmes-by-channel");

  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(tmpProgrammesDir, { recursive: true });

  try {
    await writeFile(path.join(tmpRoot, "channels.json"), toJson(channels), "utf8");

    for (const [channelId, programmes] of programmesByChannel.entries()) {
      const safeName = sanitizeChannelId(channelId);
      await writeFile(
        path.join(tmpProgrammesDir, `${safeName}.json`),
        toJson(programmes),
        "utf8"
      );
    }

    await writeFile(path.join(tmpRoot, "search-index.json"), toJson(searchIndex), "utf8");

    const manifest: EpgManifest = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: maskPasswordInUrl(sourceUrl),
      channelCount: channels.length,
      programmeCount,
      earliestStart: new Date(earliestStartMs).toISOString(),
      latestStop: new Date(latestStopMs).toISOString(),
      totalSizeBytes: Number(response.headers.get("content-length") ?? 0),
    };

    await writeFile(path.join(tmpRoot, "manifest.json"), toJson(manifest), "utf8");

    await rm(CACHE_ROOT, { recursive: true, force: true });
    await rename(tmpRoot, CACHE_ROOT);

    return manifest;
  } catch (error) {
    await rm(tmpRoot, { recursive: true, force: true });
    throw error;
  }
}
