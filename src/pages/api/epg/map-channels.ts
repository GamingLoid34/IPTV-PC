import type { NextApiRequest, NextApiResponse } from "next";
import { buildEpgIndex, findEpgChannel } from "@/lib/epg/channelMatcher";
import { getCacheStatus, getChannels } from "@/lib/epg/reader";
import type { EpgChannel } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type XtreamChannelInput = {
  stream_id: number;
  name: string;
};

type MappingResult = {
  stream_id: number;
  xtreamName: string;
  epgChannel: EpgChannel | null;
};

type ResponseBody =
  | {
      mappings: MappingResult[];
      statistics: {
        totalChannels: number;
        mappedCount: number;
        unmappedCount: number;
        mappedPercentage: number;
      };
    }
  | ApiErrorResponse;

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

  try {
    const manifest = await getCacheStatus();
    if (!manifest) {
      return res.status(503).json({ error: "EPG cache not built" });
    }

    if (!cachedIndex || cachedIndex.fetchedAt !== manifest.fetchedAt) {
      const channels = await getChannels();
      cachedIndex = {
        fetchedAt: manifest.fetchedAt,
        index: buildEpgIndex(channels),
      };
    }

    const mappings: MappingResult[] = req.body.xtreamChannels.map((channel) => ({
      stream_id: channel.stream_id,
      xtreamName: channel.name,
      epgChannel: findEpgChannel(channel.name, cachedIndex!.index),
    }));

    const mappedCount = mappings.filter((m) => m.epgChannel !== null).length;
    const totalChannels = mappings.length;
    const unmappedCount = totalChannels - mappedCount;
    const mappedPercentage =
      totalChannels === 0 ? 0 : Number(((mappedCount / totalChannels) * 100).toFixed(2));

    return res.status(200).json({
      mappings,
      statistics: {
        totalChannels,
        mappedCount,
        unmappedCount,
        mappedPercentage,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte mappa kanaler.";
    return res.status(500).json({ error: message });
  }
}
