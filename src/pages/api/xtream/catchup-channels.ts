import type { NextApiRequest, NextApiResponse } from "next";
import { callXtreamApi } from "@/lib/xtreamClient";
import type {
  ApiErrorResponse,
  CatchupChannel,
  XtreamCredentials,
  XtreamLiveStream,
} from "@/types/xtream";

type ResponseBody = CatchupChannel[] | ApiErrorResponse;

function hasCredentialsBody(body: unknown): body is XtreamCredentials {
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

function toArchiveDays(value: number | string | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) && parsed !== undefined ? Math.max(0, parsed) : 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasCredentialsBody(req.body)) {
    return res.status(400).json({
      error: "Alla fält krävs: serverUrl, username och password (får inte vara tomma).",
    });
  }

  const body = req.body as XtreamCredentials;
  const credentials: XtreamCredentials = {
    serverUrl: body.serverUrl.trim(),
    username: body.username.trim(),
    password: body.password,
  };

  // Utan category_id returnerar Xtream hela kanallistan; vi filtrerar
  // ner den till arkivkanaler på servern så payloaden till klienten blir liten.
  const result = await callXtreamApi<XtreamLiveStream[]>(
    credentials,
    "get_live_streams"
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  const catchupChannels: CatchupChannel[] = result.data
    .filter((stream) => Number(stream.tv_archive) === 1)
    .map((stream) => ({
      stream_id: stream.stream_id,
      name: stream.name,
      stream_icon: stream.stream_icon ?? "",
      category_id: String(stream.category_id ?? ""),
      archiveDays: toArchiveDays(stream.tv_archive_duration),
    }));

  return res.status(200).json(catchupChannels);
}
