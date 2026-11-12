import type { NextApiRequest, NextApiResponse } from "next";
import { buildEpgIndex, findEpgChannel } from "@/lib/epg/channelMatcher";
import {
  getCacheStatus,
  getChannels,
  getProgrammesForChannel,
} from "@/lib/epg/reader";
import type { EpgChannel, NowAndNextResult } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type XtreamChannelInput = {
  stream_id: number;
  name: string;
};

type ResponseBody = { results: NowAndNextResult[] } | ApiErrorResponse;

let cachedIndex: { fetchedAt: string; index: Map<string, EpgChannel[]> } | null = null;

function hasValidBody(body: unknown): body is { xtreamChannels: XtreamChannelInput[] } {
  if (!body || typeof body !== "object") return false;
  const value = (body as { xtreamChannels?: unknown }).xtreamChannels;
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as XtreamChannelInput).stream_id === "number" &&
      Number.isFinite((item as XtreamChannelInput).stream_id) &&
      typeof (item as XtreamChannelInput).name === "string"
  );
}

function emptyResults(channels: XtreamChannelInput[]): NowAndNextResult[] {
  return channels.map((channel) => ({
    stream_id: channel.stream_id,
    epgChannelId: null,
    now: null,
    next: null,
  }));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasValidBody(req.body)) {
    return res.status(400).json({
      error: "Body måste innehålla xtreamChannels: { stream_id, name }[].",
    });
  }

  const inputChannels = req.body.xtreamChannels;

  try {
    const manifest = await getCacheStatus();
    if (!manifest) {
      return res.status(200).json({ results: emptyResults(inputChannels) });
    }

    if (!cachedIndex || cachedIndex.fetchedAt !== manifest.fetchedAt) {
      const channels = await getChannels();
      cachedIndex = {
        fetchedAt: manifest.fetchedAt,
        index: buildEpgIndex(channels),
      };
    }

    const currentMs = Date.now();
    const results: NowAndNextResult[] = [];

    for (const channel of inputChannels) {
      const mapped = findEpgChannel(channel.name, cachedIndex.index);
      if (!mapped) {
        results.push({
          stream_id: channel.stream_id,
          epgChannelId: null,
          now: null,
          next: null,
        });
        continue;
      }

      // TODO: Optimize with in-memory programmes cache per channelId.
      const programmes = await getProgrammesForChannel(mapped.id);
      const sorted = [...programmes].sort(
        (a, b) => Date.parse(a.start) - Date.parse(b.start)
      );

      let now = null;
      let next = null;

      for (const programme of sorted) {
        const startMs = Date.parse(programme.start);
        const stopMs = Date.parse(programme.stop);

        if (startMs <= currentMs && currentMs < stopMs) {
          now = programme;
          continue;
        }

        if (startMs > currentMs) {
          next = programme;
          break;
        }
      }

      results.push({
        stream_id: channel.stream_id,
        epgChannelId: mapped.id,
        now,
        next,
      });
    }

    return res.status(200).json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte hämta now/next.";
    return res.status(500).json({ error: message });
  }
}
