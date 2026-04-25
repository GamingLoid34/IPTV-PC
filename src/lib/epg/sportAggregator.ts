import { getChannels, searchProgrammes } from "@/lib/epg/reader";
import { classifySportType, extractLeague } from "@/lib/epg/sportClassifier";
import type { EpgChannel, SearchIndexEntry, SportEvent, SportType } from "@/types/epg";

const SPORT_CATEGORIES = [
  "Sports",
  "Sport",
  "Football",
  "Soccer",
  "Fotboll",
  "Motor sport",
  "Motorsport",
  "Auto racing",
  "Cycling",
  "Cykel",
  "Cykling",
  "Skiing",
  "Hockey",
  "Ice hockey",
  "Winter",
  "Tennis",
];

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, " ");
}

function buildEventId(title: string, startMs: number): string {
  return `${normalizeTitle(title)}_${startMs}`;
}

function leagueAllowed(league: string | undefined, filters: string[]): boolean {
  if (filters.length === 0) return true;
  if (!league) return false;
  return filters.includes(league.toLowerCase());
}

export async function getSportEvents(opts: {
  fromMs: number;
  toMs: number;
  sportTypes?: SportType[];
  leagues?: string[];
  limit?: number;
}): Promise<SportEvent[]> {
  const limit = opts.limit ?? 500;
  const typeFilters = opts.sportTypes ?? [];
  const leagueFilters = (opts.leagues ?? []).map((l) => l.toLowerCase());

  const [entries, channels] = await Promise.all([
    searchProgrammes("", {
      fromMs: opts.fromMs,
      toMs: opts.toMs,
      categories: SPORT_CATEGORIES,
    }),
    getChannels(),
  ]);

  const channelMap = new Map<string, EpgChannel>(
    channels.map((channel) => [channel.id, channel])
  );

  const grouped = new Map<string, SportEvent>();

  for (const entry of entries as SearchIndexEntry[]) {
    const sportType = classifySportType({
      title: entry.title,
      description: entry.description,
      categories: entry.categories,
    });
    if (sportType === "unknown") continue;
    if (typeFilters.length > 0 && !typeFilters.includes(sportType)) continue;

    const league = extractLeague({
      title: entry.title,
      description: entry.description,
      categories: entry.categories,
    });
    if (!leagueAllowed(league, leagueFilters)) continue;

    const eventId = buildEventId(entry.title, entry.startMs);
    const mappedChannel = channelMap.get(entry.programmeRef.channelId);
    const channelInfo = {
      epgChannelId: entry.programmeRef.channelId,
      displayName: mappedChannel?.displayName ?? entry.programmeRef.channelId,
      iconUrl: mappedChannel?.icon,
    };

    const existing = grouped.get(eventId);
    if (!existing) {
      grouped.set(eventId, {
        id: eventId,
        title: entry.title,
        description: entry.description,
        sportType,
        league,
        startIso: new Date(entry.startMs).toISOString(),
        stopIso: new Date(entry.stopMs).toISOString(),
        channels: [channelInfo],
      });
      continue;
    }

    if (!existing.channels.some((c) => c.epgChannelId === channelInfo.epgChannelId)) {
      existing.channels.push(channelInfo);
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso))
    .slice(0, limit);
}
