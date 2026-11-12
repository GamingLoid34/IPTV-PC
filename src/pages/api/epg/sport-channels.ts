import type { NextApiRequest, NextApiResponse } from "next";
import { getSportChannels } from "@/lib/epg/sportAggregator";
import type { SportType } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody =
  | { channelId: string; channelName: string; strictSportType: SportType | null }[]
  | ApiErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const channels = await getSportChannels();
    return res.status(200).json(channels);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte hämta sport-kanaler.";
    return res.status(500).json({ error: message });
  }
}
