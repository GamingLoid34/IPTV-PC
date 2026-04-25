import {
  classifyChannelSportTypeStrict,
  isSportChannel,
} from "@/lib/epg/channelSportClassifier";
import { classifyProgrammeSportType, extractLeague } from "@/lib/epg/sportClassifier";
import { getChannels, getProgrammesForChannel } from "@/lib/epg/reader";
import type { EpgChannel, SportEvent, SportType } from "@/types/epg";

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
  console.log("[SPORT] Starting aggregation. fromMs:", opts.fromMs, "toMs:", opts.toMs);
  console.log("[SPORT] Time window:", new Date(opts.fromMs).toISOString(), "to", new Date(opts.toMs).toISOString());
  console.log("[SPORT] sportTypes filter:", opts.sportTypes);

  const limit = opts.limit ?? 500;
  const typeFilters = opts.sportTypes ?? [];
  const leagueFilters = (opts.leagues ?? []).map((l) => l.toLowerCase());
  const channels = await getChannels();
  // TODO: Cache sport channel detection results in memory if needed.
  const sportChannels = channels.filter((channel) => isSportChannel(channel.displayName));
  console.log("[SPORT] Found", sportChannels.length, "sport channels");

  const grouped = new Map<string, SportEvent>();
  let channelsRead = 0;
  let totalProgrammes = 0;
  let programmesInWindow = 0;
  let sampleLogged = 0;

  for (const sportChannel of sportChannels) {
    const channelStrictType = classifyChannelSportTypeStrict(sportChannel.displayName);

    const programmes = await getProgrammesForChannel(sportChannel.id);
    channelsRead += 1;
    totalProgrammes += programmes.length;
    if (sampleLogged < 5) {
      console.log(
        "[SPORT] Sample channel:",
        sportChannel.displayName,
        "id:",
        sportChannel.id,
        "programme count:",
        programmes.length
      );
      if (programmes.length > 0) {
        const first = programmes[0];
        console.log(
          "[SPORT]   first programme:",
          first.title,
          "start:",
          first.start,
          "stop:",
          first.stop
        );
      }
      sampleLogged += 1;
    }

    for (const programme of programmes) {
      if (
        programme.title.toLowerCase().includes("brommapojkarna") ||
        programme.title.toLowerCase().includes("västerås")
      ) {
        console.log("[SPORT-RAW]", {
          title: programme.title,
          start: programme.start,
          stop: programme.stop,
          startMs: new Date(programme.start).getTime(),
          stopMs: new Date(programme.stop).getTime(),
        });
      }
      const startMs = Date.parse(programme.start);
      const stopMs = Date.parse(programme.stop);
      const overlaps = startMs < opts.toMs && stopMs > opts.fromMs;
      if (!overlaps) continue;
      programmesInWindow += 1;

      const programmeType = classifyProgrammeSportType({
        title: programme.title,
        description: programme.description,
        categories: programme.categories,
      });
      const resolvedType = programmeType ?? channelStrictType;
      if (!resolvedType) continue;
      if (typeFilters.length > 0 && !typeFilters.includes(resolvedType)) continue;

      const league = extractLeague({
        title: programme.title,
        description: programme.description,
        categories: programme.categories,
      });
      if (!leagueAllowed(league, leagueFilters)) continue;

      const eventId = buildEventId(programme.title, startMs);
      const channelInfo = {
        epgChannelId: sportChannel.id,
        displayName: sportChannel.displayName,
        iconUrl: sportChannel.icon,
      };

      const existing = grouped.get(eventId);
      if (!existing) {
        grouped.set(eventId, {
          id: eventId,
          title: programme.title,
          description: programme.description,
          sportType: resolvedType,
          league,
          startIso: programme.start,
          stopIso: programme.stop,
          channels: [channelInfo],
        });
        continue;
      }

      if (!existing.channels.some((c) => c.epgChannelId === channelInfo.epgChannelId)) {
        existing.channels.push(channelInfo);
      }
    }
  }

  console.log("[SPORT] Read programmes from", channelsRead, "channels");
  console.log("[SPORT] Total programmes before time filter:", totalProgrammes);
  console.log("[SPORT] Programmes within time window:", programmesInWindow);
  const deduplicatedEvents = grouped.size;
  console.log("[SPORT] After dedup:", deduplicatedEvents);

  const afterTypeAndLeagueFilter = Array.from(grouped.values())
    .filter((event) => {
      if (typeFilters.length > 0 && !typeFilters.includes(event.sportType)) {
        return false;
      }
      if (!leagueAllowed(event.league, leagueFilters)) {
        return false;
      }
      return true;
    });
  const filteredEvents = afterTypeAndLeagueFilter.length;
  console.log("[SPORT] After sportTypes filter:", filteredEvents);

  const finalEvents = afterTypeAndLeagueFilter
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso))
    .slice(0, limit);
  const finalCount = finalEvents.length;
  console.log("[SPORT] Final result count:", finalCount);

  return finalEvents;
}

export async function getSportChannels(): Promise<
  { channelId: string; channelName: string; strictSportType: SportType | null }[]
> {
  const channels = await getChannels();
  return channels
    .map((channel) => {
      if (!isSportChannel(channel.displayName)) return null;
      const strictSportType = classifyChannelSportTypeStrict(channel.displayName);
      return {
        channelId: channel.id,
        channelName: channel.displayName,
        strictSportType,
      };
    })
    .filter(
      (
        value
      ): value is { channelId: string; channelName: string; strictSportType: SportType | null } =>
        Boolean(value)
    )
    .sort((a, b) => a.channelName.localeCompare(b.channelName));
}
