import type { NextApiRequest, NextApiResponse } from "next";
import { testNormalization } from "@/lib/epg/channelMatcher";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody = { input: string; output: string }[] | ApiErrorResponse;

export default function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json(testNormalization());
}
