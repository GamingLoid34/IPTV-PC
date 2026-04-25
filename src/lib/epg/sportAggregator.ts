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

  const grouped = new Map<string, SportEvent>();

  for (const sportChannel of sportChannels) {
    const channelType = sportChannel.sportType;
    if (typeFilters.length > 0 && !typeFilters.includes(channelType)) continue;

    const programmes = await getProgrammesForChannel(sportChannel.channel.id);
    for (const programme of programmes) {
      const startMs = Date.parse(programme.start);
      const stopMs = Date.parse(programme.stop);
      const overlaps = startMs < opts.toMs && stopMs > opts.fromMs;
      if (!overlaps) continue;

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

  return Array.from(grouped.values())
    .filter((event) => {
      if (typeFilters.length > 0 && !typeFilters.includes(event.sportType)) {
        return false;
      }
      if (!leagueAllowed(event.league, leagueFilters)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso))
    .slice(0, limit);
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
