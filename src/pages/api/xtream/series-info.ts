import type { NextApiRequest, NextApiResponse } from "next";
import { callXtreamApi } from "@/lib/xtreamClient";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamSeriesInfo,
} from "@/types/xtream";

type SeriesInfoRequestBody = XtreamCredentials & {
  seriesId?: number;
  series_id?: number;
};

type ResponseBody = XtreamSeriesInfo | ApiErrorResponse;

function hasSeriesInfoRequestBody(body: unknown): body is SeriesInfoRequestBody {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    typeof o.serverUrl === "string" &&
    o.serverUrl.trim() !== "" &&
    typeof o.username === "string" &&
    o.username.trim() !== "" &&
    typeof o.password === "string" &&
    o.password !== "" &&
    ((typeof o.seriesId === "number" && Number.isFinite(o.seriesId)) ||
      (typeof o.series_id === "number" && Number.isFinite(o.series_id)))
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

  if (!hasSeriesInfoRequestBody(req.body)) {
    return res.status(400).json({
      error:
        "Alla fält krävs: serverUrl, username, password och seriesId (giltigt nummer).",
    });
  }

  const body = req.body as SeriesInfoRequestBody;
  const seriesId = body.seriesId ?? body.series_id;
  if (typeof seriesId !== "number" || !Number.isFinite(seriesId)) {
    return res.status(400).json({
      error:
        "Alla fält krävs: serverUrl, username, password och seriesId/series_id (giltigt nummer).",
    });
  }
  const credentials: XtreamCredentials = {
    serverUrl: body.serverUrl.trim(),
    username: body.username.trim(),
    password: body.password,
  };

  const result = await callXtreamApi<XtreamSeriesInfo>(
    credentials,
    "get_series_info",
    { series_id: String(seriesId) },
    { expectedShape: "object" }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json(result.data);
}
