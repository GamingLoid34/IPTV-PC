import type { NextApiRequest, NextApiResponse } from "next";
import { normalizeChannelName } from "@/lib/epg/channelMatcher";
import { callXtreamApi } from "@/lib/xtreamClient";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
} from "@/types/xtream";

type RequestBody = XtreamCredentials & {
  epgDisplayName: string;
};

type ResponseBody =
  | {
      match: { stream_id: number; name: string } | null;
      searchedCategories: number;
      searchedStreams: number;
    }
  | ApiErrorResponse;

type CachedCatalogue = {
  key: string;
  expiresAt: number;
  categories: XtreamCategory[];
  streamsByCategory: Map<string, XtreamLiveStream[]>;
};

let cachedCatalogue: CachedCatalogue | null = null;

function hasValidBody(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    typeof o.serverUrl === "string" &&
    o.serverUrl.trim() !== "" &&
    typeof o.username === "string" &&
    o.username.trim() !== "" &&
    typeof o.password === "string" &&
    o.password !== "" &&
    typeof o.epgDisplayName === "string" &&
    o.epgDisplayName.trim() !== ""
  );
}

function makeCacheKey(credentials: XtreamCredentials): string {
  return `${credentials.serverUrl.trim()}|${credentials.username.trim()}|${credentials.password}`;
}

function extractPrefix(epgDisplayName: string): string | null {
  const match = epgDisplayName.trim().match(/^([A-Z]{2,3})[:|\s]/);
  return match?.[1]?.toLowerCase() ?? null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasValidBody(req.body)) {
    return res.status(400).json({
      error: "Alla fält krävs: serverUrl, username, password och epgDisplayName.",
    });
  }

  const credentials: XtreamCredentials = {
    serverUrl: req.body.serverUrl.trim(),
    username: req.body.username.trim(),
    password: req.body.password,
  };
  const epgDisplayName = req.body.epgDisplayName.trim();

  try {
    const cacheKey = makeCacheKey(credentials);
    const now = Date.now();

    let categories: XtreamCategory[] = [];
    let streamsByCategory = new Map<string, XtreamLiveStream[]>();

    if (
      cachedCatalogue &&
      cachedCatalogue.key === cacheKey &&
      cachedCatalogue.expiresAt > now
    ) {
      categories = cachedCatalogue.categories;
      streamsByCategory = cachedCatalogue.streamsByCategory;
    } else {
      const categoriesResult = await callXtreamApi<XtreamCategory[]>(
        credentials,
        "get_live_categories"
      );
      if (!categoriesResult.ok) {
        return res.status(categoriesResult.status).json({ error: categoriesResult.error });
      }

      categories = categoriesResult.data;
      streamsByCategory = new Map<string, XtreamLiveStream[]>();
      cachedCatalogue = {
        key: cacheKey,
        expiresAt: now + 60_000,
        categories,
        streamsByCategory,
      };
    }

    const prefix = extractPrefix(epgDisplayName);
    const narrowedCategories =
      prefix === null
        ? []
        : categories.filter((category) =>
            category.category_name.toLowerCase().includes(prefix)
          );
    const categoriesToSearch =
      narrowedCategories.length > 0 ? narrowedCategories : categories;

    let searchedCategories = 0;
    let searchedStreams = 0;

    const target = normalizeChannelName(epgDisplayName);

    for (const category of categoriesToSearch) {
      searchedCategories += 1;
      let streams = streamsByCategory.get(category.category_id);
      if (!streams) {
        const streamsResult = await callXtreamApi<XtreamLiveStream[]>(
          credentials,
          "get_live_streams",
          { category_id: category.category_id }
        );
        if (!streamsResult.ok) {
          continue;
        }
        streams = streamsResult.data;
        streamsByCategory.set(category.category_id, streams);
      }

      searchedStreams += streams.length;
      for (const stream of streams) {
        if (normalizeChannelName(stream.name) === target) {
          return res.status(200).json({
            match: { stream_id: stream.stream_id, name: stream.name },
            searchedCategories,
            searchedStreams,
          });
        }
      }
    }

    return res.status(200).json({
      match: null,
      searchedCategories,
      searchedStreams,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunde inte söka Xtream-kanal.";
    return res.status(500).json({ error: message });
  }
}
