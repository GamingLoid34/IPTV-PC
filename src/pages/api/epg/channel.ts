import type { NextApiRequest, NextApiResponse } from "next";
import { getProgrammesForChannel } from "@/lib/epg/reader";
import type { EpgProgramme } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody = EpgProgramme[] | ApiErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const channelIdParam = req.query.channelId;
  const channelId = Array.isArray(channelIdParam) ? channelIdParam[0] : channelIdParam;
  if (!channelId || channelId.trim() === "") {
    return res.status(400).json({ error: "Query-parametern channelId krävs." });
  }

  try {
    const programmes = await getProgrammesForChannel(channelId.trim());
    return res.status(200).json(programmes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte läsa kanalprogram.";
    return res.status(500).json({ error: message });
  }
}
