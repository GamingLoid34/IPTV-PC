import path from "node:path";
import { Readable } from "node:stream";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetry(
  from: string,
  to: string,
  maxAttempts = 5
): Promise<void> {
  const delays = [50, 100, 250, 500, 1000];
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rename(from, to);
      if (attempt > 1) {
        console.info(`[EPG] Rename succeeded on attempt ${attempt}`);
      }
      return;
    } catch (error) {
      lastError = error;
      const code =
        error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : "unknown";

      if (code !== "EPERM" && code !== "EBUSY" && code !== "ENOTEMPTY") {
        throw error;
      }

      if (attempt < maxAttempts) {
        const delay = delays[attempt - 1] ?? delays[delays.length - 1];
        console.warn(
          `[EPG] Rename failed with ${code}, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export async function fetchAndCacheEpg(
  credentials: XtreamCredentials
): Promise<EpgManifest> {
  const cacheParent = path.dirname(CACHE_ROOT);
  await mkdir(cacheParent, { recursive: true });
  await ensureCacheDirs();

  const tmpRoot = path.join(cacheParent, "epg-cache-tmp");
  const tmpProgrammesDir = path.join(tmpRoot, "programmes-by-channel");
  try {
    await access(tmpRoot);
    await rm(tmpRoot, { recursive: true, force: true });
    console.info("[EPG] Removed stale temp dir");
  } catch {
    // no stale temp dir
  }

  const baseUrl = credentials.serverUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({
    username: credentials.username.trim(),
    password: credentials.password,
  });
  const sourceUrl = `${baseUrl}/xmltv.php?${params.toString()}`;

  const channels: EpgChannel[] = [];
  const programmesByChannel = new Map<string, EpgProgramme[]>();
  const searchIndex: SearchIndexEntry[] = [];
  let parsedChannels = 0;
  let programmeCount = 0;
  let earliestStartMs = Number.POSITIVE_INFINITY;
  let latestStopMs = Number.NEGATIVE_INFINITY;
  let nodeStream: Readable | null = null;
  let parseCompleted = false;

  try {
    console.info(`[EPG] Starting fetch at ${new Date().toISOString()}`);
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        "User-Agent": XTREAM_USER_AGENT,
      },
    });

    const contentTypeHeader = response.headers.get("content-type");
    const contentLengthHeader = response.headers.get("content-length");
    console.info(
      `[EPG] HTTP response received. Status: ${response.status} Content-Type: ${
        contentTypeHeader ?? "(missing)"
      } Content-Length: ${contentLengthHeader ?? "(missing)"}`
    );

    if (response.status !== 200) {
      throw new Error(`EPG fetch misslyckades (HTTP ${response.status}).`);
    }

    const contentType = contentTypeHeader?.toLowerCase() ?? "";
    if (
      !contentType.startsWith("application/xml") &&
      !contentType.startsWith("text/xml")
    ) {
      throw new Error(`Fel content-type för EPG: ${contentType || "(saknas)"}`);
    }

    if (!response.body) {
      throw new Error("Empty response body from XMLTV endpoint");
    }

    nodeStream = Readable.fromWeb(response.body as any);
    console.info("[EPG] Starting stream parse");
    await parseXmltvStream(
      nodeStream,
      (channel) => {
        channels.push(channel);
        parsedChannels += 1;
        if (parsedChannels % 500 === 0) {
          console.info(`[EPG] Parsed ${parsedChannels} channels so far`);
        }
      },
      (programme) => {
        programmeCount += 1;
        if (programmeCount % 25000 === 0) {
          console.info(`[EPG] Parsed ${programmeCount} programmes so far`);
        }

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
    parseCompleted = true;
    console.info(
      `[EPG] Parse complete. Channels: ${channels.length} Programmes: ${programmeCount}`
    );

    if (!Number.isFinite(earliestStartMs) || !Number.isFinite(latestStopMs)) {
      throw new Error("Ingen programme-data hittades i XMLTV.");
    }

    await mkdir(tmpProgrammesDir, { recursive: true });

    console.info("[EPG] Writing channels.json");
    await writeFile(path.join(tmpRoot, "channels.json"), toJson(channels), "utf8");

    console.info(`[EPG] Writing ${programmesByChannel.size} programme files`);
    for (const [channelId, programmes] of programmesByChannel.entries()) {
      const safeName = sanitizeChannelId(channelId);
      await writeFile(
        path.join(tmpProgrammesDir, `${safeName}.json`),
        toJson(programmes),
        "utf8"
      );
    }

    console.info("[EPG] Writing search-index.json");
    await writeFile(path.join(tmpRoot, "search-index.json"), toJson(searchIndex), "utf8");

    const manifest: EpgManifest = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: maskPasswordInUrl(sourceUrl),
      channelCount: channels.length,
      programmeCount,
      earliestStart: new Date(earliestStartMs).toISOString(),
      latestStop: new Date(latestStopMs).toISOString(),
      totalSizeBytes: Number(contentLengthHeader ?? 0),
    };

    console.info("[EPG] Writing manifest.json - atomic rename incoming");
    await writeFile(path.join(tmpRoot, "manifest.json"), toJson(manifest), "utf8");

    // Note: Windows requires destination dir to not exist before rename.
    // We sacrifice atomicity for cross-platform compatibility. The brief window
    // where no cache exists is acceptable for a personal-use app.
    try {
      await rm(CACHE_ROOT, { recursive: true, force: true });
      console.info("[EPG] Removed existing cache dir for replacement");
      // Windows: give the filesystem a moment to release old path locks.
      await sleep(100);
    } catch {
      console.info("[EPG] No existing cache dir to remove (or already gone)");
    }

    console.info("[EPG] Renaming temp dir to final cache dir");
    await renameWithRetry(tmpRoot, CACHE_ROOT);
    console.info(`[EPG] Cache build complete at ${new Date().toISOString()}`);

    return manifest;
  } catch (error) {
    await rm(tmpRoot, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "Okänt fel";
    throw new Error(`EPG refresh failed: ${message}`);
  } finally {
    if (!parseCompleted && nodeStream && typeof nodeStream.destroy === "function") {
      nodeStream.destroy();
    }
  }
}
