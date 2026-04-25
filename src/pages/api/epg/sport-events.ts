import type { NextApiRequest, NextApiResponse } from "next";
import { getSportEvents } from "@/lib/epg/sportAggregator";
import type { SportEvent, SportType } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type ResponseBody = SportEvent[] | ApiErrorResponse;

const SPORT_TYPES: SportType[] = [
  "football",
  "motorsport",
  "cycling",
  "winter",
  "tennis",
  "other",
  "unknown",
];

function getSingle(queryValue: string | string[] | undefined): string | undefined {
  if (!queryValue) return undefined;
  return Array.isArray(queryValue) ? queryValue[0] : queryValue;
}

function parseIsoToMs(value: string | undefined, label: string): number {
  if (!value) {
    throw new Error(`${label} krävs.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Ogiltigt ISO-datum för ${label}.`);
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

  try {
    const fromIso = getSingle(req.query.fromIso);
    const toIso = getSingle(req.query.toIso);
    const sportTypesRaw = getSingle(req.query.sportTypes);
    const leaguesRaw = getSingle(req.query.leagues);
    const limitRaw = getSingle(req.query.limit);

    const fromMs = parseIsoToMs(fromIso, "fromIso");
    const toMs = parseIsoToMs(toIso, "toIso");
    if (toMs <= fromMs) {
      throw new Error("toIso måste vara efter fromIso.");
    }

    const sportTypes = sportTypesRaw
      ? sportTypesRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is SportType => SPORT_TYPES.includes(s as SportType))
      : undefined;
    const leagues = leaguesRaw
      ? leaguesRaw
          .split(",")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
      : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const events = await getSportEvents({
      fromMs,
      toMs,
      sportTypes,
      leagues,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return res.status(200).json(events);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte hämta sport-events.";
    return res.status(400).json({ error: message });
  }
}
