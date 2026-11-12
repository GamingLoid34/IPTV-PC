import type { NextApiRequest, NextApiResponse } from "next";
import { callXtreamApi } from "@/lib/xtreamClient";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamVodInfo,
} from "@/types/xtream";

type VodInfoRequestBody = XtreamCredentials & {
  vodId?: number;
  vod_id?: number;
};

type ResponseBody = XtreamVodInfo | ApiErrorResponse;

function hasVodInfoRequestBody(body: unknown): body is VodInfoRequestBody {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    typeof o.serverUrl === "string" &&
    o.serverUrl.trim() !== "" &&
    typeof o.username === "string" &&
    o.username.trim() !== "" &&
    typeof o.password === "string" &&
    o.password !== "" &&
    ((typeof o.vodId === "number" && Number.isFinite(o.vodId)) ||
      (typeof o.vod_id === "number" && Number.isFinite(o.vod_id)))
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

  if (!hasVodInfoRequestBody(req.body)) {
    return res.status(400).json({
      error:
        "Alla fält krävs: serverUrl, username, password och vodId (giltigt nummer).",
    });
  }

  const body = req.body as VodInfoRequestBody;
  const vodId = body.vodId ?? body.vod_id;
  if (typeof vodId !== "number" || !Number.isFinite(vodId)) {
    return res.status(400).json({
      error:
        "Alla fält krävs: serverUrl, username, password och vodId/vod_id (giltigt nummer).",
    });
  }
  const credentials: XtreamCredentials = {
    serverUrl: body.serverUrl.trim(),
    username: body.username.trim(),
    password: body.password,
  };

  const result = await callXtreamApi<XtreamVodInfo>(
    credentials,
    "get_vod_info",
    { vod_id: String(vodId) },
    { expectedShape: "object" }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json(result.data);
}
