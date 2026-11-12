import type { NextApiRequest, NextApiResponse } from "next";
import { callXtreamApi } from "@/lib/xtreamClient";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamSeries,
} from "@/types/xtream";

type SeriesRequestBody = XtreamCredentials & {
  categoryId: string;
};

type ResponseBody = XtreamSeries[] | ApiErrorResponse;

function hasSeriesRequestBody(body: unknown): body is SeriesRequestBody {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    typeof o.serverUrl === "string" &&
    o.serverUrl.trim() !== "" &&
    typeof o.username === "string" &&
    o.username.trim() !== "" &&
    typeof o.password === "string" &&
    o.password !== "" &&
    typeof o.categoryId === "string" &&
    o.categoryId.trim() !== ""
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

  if (!hasSeriesRequestBody(req.body)) {
    return res.status(400).json({
      error:
        "Alla fält krävs: serverUrl, username, password och categoryId (får inte vara tomma).",
    });
  }

  const body = req.body as SeriesRequestBody;
  const credentials: XtreamCredentials = {
    serverUrl: body.serverUrl.trim(),
    username: body.username.trim(),
    password: body.password,
  };

  const result = await callXtreamApi<XtreamSeries[]>(
    credentials,
    "get_series",
    { category_id: body.categoryId.trim() }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json(result.data);
}
