import type { NextApiRequest, NextApiResponse } from "next";
import { classifyProgrammeSportType } from "@/lib/epg/sportClassifier";
import type { SportType } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody = { sportType: SportType | null } | ApiErrorResponse;

type RequestBody = {
  title: string;
  description?: string;
};

function hasValidBody(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.title === "string" &&
    (typeof obj.description === "string" || typeof obj.description === "undefined")
  );
}

export default function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasValidBody(req.body)) {
    return res.status(400).json({ error: "Body måste innehålla title och valfri description." });
  }

  const sportType = classifyProgrammeSportType({
    title: req.body.title,
    description: req.body.description,
    categories: [],
  });
  return res.status(200).json({ sportType });
}
