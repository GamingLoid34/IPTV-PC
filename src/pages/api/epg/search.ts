import type { NextApiRequest, NextApiResponse } from "next";
import { searchProgrammes } from "@/lib/epg/reader";
import type { SearchIndexEntry } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody = SearchIndexEntry[] | ApiErrorResponse;

function parseIsoToMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Ogiltigt ISO-datum: ${value}`);
  }
  return parsed;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const qParam = req.query.q;
  const q = Array.isArray(qParam) ? qParam[0] : qParam;
  if (!q || q.trim() === "") {
    return res.status(400).json({ error: "Query-parametern q krävs." });
  }

  const fromParam = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
  const toParam = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
  const categoriesParam = Array.isArray(req.query.categories)
    ? req.query.categories[0]
    : req.query.categories;

  try {
    const fromMs = parseIsoToMs(fromParam);
    const toMs = parseIsoToMs(toParam);
    const categories =
      categoriesParam && categoriesParam.trim()
        ? categoriesParam
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c.length > 0)
        : [];

    const results = await searchProgrammes(q, { fromMs, toMs, categories });
    return res.status(200).json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte söka i EPG.";
    return res.status(500).json({ error: message });
  }
}
