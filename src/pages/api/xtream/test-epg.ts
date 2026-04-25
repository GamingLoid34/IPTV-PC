import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiErrorResponse, XtreamCredentials } from "@/types/xtream";

type TestEpgResponse = {
  status: number;
  contentType: string | null;
  contentLength: string | null;
  bodyPreview: string;
  bodyTotalSize: number;
  looksLikeXmlTv: boolean;
};

type ResponseBody = TestEpgResponse | ApiErrorResponse;

const XTREAM_USER_AGENT = "Lavf/60.3.100";
const FETCH_TIMEOUT_MS = 30_000;

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

  const { serverUrl, username, password } = req.body;
  const trimmedBaseUrl = serverUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({
    username: username.trim(),
    password,
  });
  const epgUrl = `${trimmedBaseUrl}/xmltv.php?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(epgUrl, {
      method: "GET",
      headers: { "User-Agent": XTREAM_USER_AGENT },
      signal: controller.signal,
    });
  } catch {
    return res.status(502).json({ error: "Kunde inte nå Xtream XMLTV-feed (timeout/nätverksfel)." });
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");

  let responseText = "";
  try {
    responseText = await upstream.text();
  } catch {
    return res.status(502).json({ error: "Kunde inte läsa svaret från Xtream XMLTV-feed." });
  }

  const bodyPreview = responseText.slice(0, 2000);
  const looksLikeXmlTv = bodyPreview.includes("<?xml") && bodyPreview.includes("<tv");

  return res.status(200).json({
    status: upstream.status,
    contentType,
    contentLength,
    bodyPreview,
    bodyTotalSize: responseText.length,
    looksLikeXmlTv,
  });
}
