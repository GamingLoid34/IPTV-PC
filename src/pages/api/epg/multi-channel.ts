import type { NextApiRequest, NextApiResponse } from "next";
import { buildEpgIndex, findEpgChannel } from "@/lib/epg/channelMatcher";
import {
  getCacheStatus,
  getChannels,
  getProgrammesForChannel,
} from "@/lib/epg/reader";
import type { EpgChannel, EpgProgramme } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type XtreamChannelInput = {
  stream_id: number;
  name: string;
};

type MultiChannelResult = {
  stream_id: number;
  epgChannelId: string | null;
  programmes: EpgProgramme[];
};

type ResponseBody = { results: MultiChannelResult[] } | ApiErrorResponse;

let cachedIndex: { fetchedAt: string; index: Map<string, EpgChannel[]> } | null = null;

function hasValidBody(
  body: unknown
): body is { xtreamChannels: XtreamChannelInput[]; fromIso: string; toIso: string } {
  if (!body || typeof body !== "object") return false;
  const value = body as { xtreamChannels?: unknown; fromIso?: unknown; toIso?: unknown };
  if (!Array.isArray(value.xtreamChannels)) return false;
  if (typeof value.fromIso !== "string" || typeof value.toIso !== "string") return false;
  return value.xtreamChannels.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as XtreamChannelInput).stream_id === "number" &&
      Number.isFinite((item as XtreamChannelInput).stream_id) &&
      typeof (item as XtreamChannelInput).name === "string"
  );
}

function emptyResults(channels: XtreamChannelInput[]): MultiChannelResult[] {
  return channels.map((channel) => ({
    stream_id: channel.stream_id,
    epgChannelId: null,
    programmes: [],
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
      error: "Body måste innehålla xtreamChannels, fromIso och toIso.",
    });
  }

  const inputChannels = req.body.xtreamChannels;
  const fromMs = Date.parse(req.body.fromIso);
  const toMs = Date.parse(req.body.toIso);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return res.status(400).json({ error: "Ogiltigt tidsfönster: fromIso/toIso." });
  }

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
    const epgIndex = cachedIndex.index;

    console.log(
      "[MULTI-EPG] Mapping",
      inputChannels.length,
      "channels, time window:",
      new Date(fromMs).toISOString(),
      "..",
      new Date(toMs).toISOString()
    );

    const mapped = inputChannels.map((channel) => ({
      stream_id: channel.stream_id,
      epg: findEpgChannel(channel.name, epgIndex),
    }));

    const results = await Promise.all(
      mapped.map(async ({ stream_id, epg }): Promise<MultiChannelResult> => {
        if (!epg) {
          return { stream_id, epgChannelId: null, programmes: [] };
        }

        const programmes = await getProgrammesForChannel(epg.id);
        const filtered = programmes
          .filter((programme) => {
            const startMs = Date.parse(programme.start);
            const stopMs = Date.parse(programme.stop);
            return startMs < toMs && stopMs > fromMs;
          })
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

        return {
          stream_id,
          epgChannelId: epg.id,
          programmes: filtered,
        };
      })
    );

    const totalProgrammes = results.reduce((sum, item) => sum + item.programmes.length, 0);
    console.log(
      "[MULTI-EPG] Returning",
      totalProgrammes,
      "total programmes across mapped channels"
    );

    return res.status(200).json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte hämta multi-channel EPG.";
    return res.status(500).json({ error: message });
  }
}
