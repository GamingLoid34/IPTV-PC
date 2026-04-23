import type { NextApiRequest, NextApiResponse } from "next";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
} from "@/types/xtream";

const XTREAM_USER_AGENT = "Lavf/60.3.100";

type ResponseBody = XtreamCategory[] | ApiErrorResponse;

function hasAllCredentials(
  body: unknown
): body is XtreamCredentials {
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

function buildXtreamCategoriesUrl(credentials: XtreamCredentials): string {
  const base = credentials.serverUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({
    username: credentials.username.trim(),
    password: credentials.password,
    action: "get_live_categories",
  });
  return `${base}/player_api.php?${params.toString()}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAllCredentials(req.body)) {
    return res.status(400).json({
      error:
        "Alla fält krävs: serverUrl, username och password (får inte vara tomma).",
    });
  }

  const credentials = {
    serverUrl: (req.body as XtreamCredentials).serverUrl.trim(),
    username: (req.body as XtreamCredentials).username.trim(),
    password: (req.body as XtreamCredentials).password,
  };

  const xtreamUrl = buildXtreamCategoriesUrl(credentials);

  let upstream: Response;
  try {
    upstream = await fetch(xtreamUrl, {
      method: "GET",
      headers: { "User-Agent": XTREAM_USER_AGENT },
    });
  } catch {
    return res.status(502).json({
      error: "Kunde inte nå Xtream-servern",
    });
  }

  if (!upstream.ok) {
    return res.status(502).json({
      error: `Anslutning avvisades (HTTP ${upstream.status})`,
    });
  }

  let parsed: unknown;
  try {
    const text = await upstream.text();
    parsed = JSON.parse(text) as unknown;
  } catch {
    return res.status(502).json({
      error: "Servern returnerade ogiltig data",
    });
  }

  if (!Array.isArray(parsed)) {
    return res.status(401).json({
      error: "Fel användarnamn eller lösenord",
    });
  }

  return res.status(200).json(parsed as XtreamCategory[]);
}
