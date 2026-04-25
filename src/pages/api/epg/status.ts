import type { NextApiRequest, NextApiResponse } from "next";
import { getCacheStatus } from "@/lib/epg/reader";
import type { EpgManifest } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody = EpgManifest | { cached: false } | ApiErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const manifest = await getCacheStatus();
    if (!manifest) {
      return res.status(200).json({ cached: false });
    }
    return res.status(200).json(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte läsa cache-status.";
    return res.status(500).json({ error: message });
  }
}
