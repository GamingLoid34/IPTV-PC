import { classifyChannelSportType } from "@/lib/epg/channelSportClassifier";
import { extractLeague } from "@/lib/epg/sportClassifier";
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
  // TODO: Cache sport channel classification list in memory if needed.
  const sportChannels = channels
    .map((channel) => ({
      channel,
      sportType: classifyChannelSportType(channel.displayName),
    }))
    .filter((entry): entry is { channel: EpgChannel; sportType: SportType } => !!entry.sportType);
  console.log("[SPORT] Found", sportChannels.length, "sport channels");

  const grouped = new Map<string, SportEvent>();
  let channelsRead = 0;
  let totalProgrammes = 0;
  let programmesInWindow = 0;
  let sampleLogged = 0;

  for (const sportChannel of sportChannels) {
    const channelType = sportChannel.sportType;
    if (typeFilters.length > 0 && !typeFilters.includes(channelType)) continue;

    const programmes = await getProgrammesForChannel(sportChannel.channel.id);
    channelsRead += 1;
    totalProgrammes += programmes.length;
    if (sampleLogged < 5) {
      console.log(
        "[SPORT] Sample channel:",
        sportChannel.channel.displayName,
        "id:",
        sportChannel.channel.id,
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
      const startMs = Date.parse(programme.start);
      const stopMs = Date.parse(programme.stop);
      const overlaps = startMs < opts.toMs && stopMs > opts.fromMs;
      if (!overlaps) continue;
      programmesInWindow += 1;

      const league = extractLeague({
        title: programme.title,
        description: programme.description,
        categories: programme.categories,
      });
      if (!leagueAllowed(league, leagueFilters)) continue;

      const eventId = buildEventId(programme.title, startMs);
      const channelInfo = {
        epgChannelId: sportChannel.channel.id,
        displayName: sportChannel.channel.displayName,
        iconUrl: sportChannel.channel.icon,
      };

      const existing = grouped.get(eventId);
      if (!existing) {
        grouped.set(eventId, {
          id: eventId,
          title: programme.title,
          description: programme.description,
          sportType: channelType,
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
  { channelId: string; channelName: string; sportType: SportType }[]
> {
  const channels = await getChannels();
  return channels
    .map((channel) => {
      const sportType = classifyChannelSportType(channel.displayName);
      if (!sportType) return null;
      return {
        channelId: channel.id,
        channelName: channel.displayName,
        sportType,
      };
    })
    .filter((value): value is { channelId: string; channelName: string; sportType: SportType } =>
      Boolean(value)
    )
    .sort((a, b) => a.channelName.localeCompare(b.channelName));
}
