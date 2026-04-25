import type { NextApiRequest, NextApiResponse } from "next";
import { callXtreamApi } from "@/lib/xtreamClient";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamSeriesCategory,
} from "@/types/xtream";

type ResponseBody = XtreamSeriesCategory[] | ApiErrorResponse;

function hasAllCredentials(body: unknown): body is XtreamCredentials {
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

  const result = await callXtreamApi<XtreamSeriesCategory[]>(
    credentials,
    "get_series_categories"
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json(result.data);
}
