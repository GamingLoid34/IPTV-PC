import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAndCacheEpg } from "@/lib/epg/fetcher";
import type { EpgManifest } from "@/types/epg";
import type { ApiErrorResponse, XtreamCredentials } from "@/types/xtream";

type ResponseBody = EpgManifest | ApiErrorResponse;

function hasXtreamCredentials(body: unknown): body is XtreamCredentials {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    typeof o.serverUrl === "string" &&
    o.serverUrl.trim() !== "" &&
    typeof o.username === "string" &&
    o.username.trim() !== "" &&
    typeof o.password === "string" &&
    o.password !== ""
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

  if (!hasXtreamCredentials(req.body)) {
    return res.status(400).json({
      error: "Alla fält krävs: serverUrl, username och password (får inte vara tomma).",
    });
  }

  try {
    const manifest = await fetchAndCacheEpg({
      serverUrl: req.body.serverUrl.trim(),
      username: req.body.username.trim(),
      password: req.body.password,
    });
    return res.status(200).json(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel vid EPG-refresh.";
    return res.status(500).json({ error: message });
  }
}
