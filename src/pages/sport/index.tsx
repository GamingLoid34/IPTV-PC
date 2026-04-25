import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { EpgManifest, SportEvent, SportType } from "@/types/epg";
import type { ApiErrorResponse } from "@/types/xtream";

type SportFilter = SportType | "all";

const DAY_OFFSETS: Array<0 | 1 | 2 | 3 | 4> = [0, 1, 2, 3, 4];
const SPORT_FILTERS: SportFilter[] = [
  "all",
  "football",
  "motorsport",
  "cycling",
  "winter",
  "tennis",
  "other",
];

function startOfLocalDay(offsetDays: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 0, 0, 0, 0);
}

function endOfLocalDay(offsetDays: number): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetDays,
    23,
    59,
    59,
    999
  );
}

function startOfDayDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function dateTabLabel(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "short" })
    .format(date)
    .replace(".", "");
  const day = date.getDate();
  return `${weekday} ${day}`;
}

function sportLabel(type: SportFilter): string {
  if (type === "all") return "Alla";
  const labels: Record<SportType, string> = {
    football: "Fotboll",
    motorsport: "Motorsport",
    cycling: "Cykel",
    winter: "Vinter",
    tennis: "Tennis",
    other: "Övrigt",
    unknown: "Okänd",
  };
  return labels[type];
}

function eventTimeLabel(event: SportEvent, selectedDayOffset: number): string {
  const formattedTime = formatEventTime(event.startIso, event.stopIso);

  if (selectedDayOffset === 0) {
    return formattedTime;
  }
  const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "short" }).format(
    new Date(event.startIso)
  );
  return `${weekday} ${formattedTime}`;
}

function getMatchStatus(
  nowMs: number,
  startIso: string,
  stopIso: string,
  dayOffset: number
): "live" | "soon" | "ended" | null {
  const startMs = Date.parse(startIso);
  const stopMs = Date.parse(stopIso);

  if (startMs < nowMs && nowMs < stopMs) {
    return "live";
  }
  if (startMs > nowMs && startMs - nowMs < 30 * 60 * 1000) {
    return "soon";
  }
  if (dayOffset === 0 && stopMs < nowMs) {
    return "ended";
  }
  return null;
}

function formatEventTime(startIso: string, stopIso: string): string {
  const startDate = new Date(startIso);
  const stopDate = new Date(stopIso);
  const durationMs = stopDate.getTime() - startDate.getTime();
  const startTime = startDate.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const stopTime = stopDate.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (durationMs > 3 * 60 * 60 * 1000) {
    const totalMinutes = Math.floor(durationMs / (60 * 1000));
    const durationHours = Math.floor(totalMinutes / 60);
    const durationMinutes = totalMinutes % 60;
    return `${startTime} (${durationHours}t${
      durationMinutes > 0 ? ` ${durationMinutes}m` : ""
    })`;
  }

  return `${startTime}–${stopTime}`;
}

export default function SportPage() {
  const router = useRouter();
  const [selectedSportType, setSelectedSportType] = useState<SportFilter>("all");
  const [selectedDayOffset, setSelectedDayOffset] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [epgManifest, setEpgManifest] = useState<EpgManifest | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedLeagueKeys, setExpandedLeagueKeys] = useState<Set<string>>(new Set());
  const [playingChannelKey, setPlayingChannelKey] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadManifest = async () => {
      try {
        const response = await fetch("/api/epg/status");
        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== "object") return;
        if ("cached" in (data as { cached?: boolean })) {
          if (!cancelled) setEpgManifest(null);
          return;
        }
        if (!cancelled) {
          setEpgManifest(data as EpgManifest);
        }
      } catch {
        // non-fatal fallback: keep 5 default days
      }
    };
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableDayOffsets = useMemo(() => {
    const fallback: Array<0 | 1 | 2 | 3 | 4> = [0, 1, 2, 3, 4];
    if (!epgManifest) return fallback;

    const epgStart = startOfDayDate(new Date(epgManifest.earliestStart));
    const epgEnd = startOfDayDate(new Date(epgManifest.latestStop));
    const offsets = fallback.filter((offset) => {
      const d = startOfLocalDay(offset);
      return d >= epgStart && d <= epgEnd;
    });
    return offsets.length > 0 ? offsets : fallback;
  }, [epgManifest]);

  useEffect(() => {
    if (!availableDayOffsets.includes(selectedDayOffset)) {
      setSelectedDayOffset(availableDayOffsets[0] ?? 0);
    }
  }, [availableDayOffsets, selectedDayOffset]);

  useEffect(() => {
    let cancelled = false;
    const loadEvents = async () => {
      setIsLoading(true);
      setError(null);
      setExpandedEventId(null);
      try {
        const fromIso = startOfLocalDay(selectedDayOffset).toISOString();
        const toIso = endOfLocalDay(selectedDayOffset).toISOString();
        console.log(
          "[SPORT-FRONTEND] dayOffset:",
          selectedDayOffset,
          "fromIso:",
          fromIso,
          "toIso:",
          toIso
        );
        console.log(
          "[SPORT-FRONTEND] Local 'today' interpretation:",
          new Date().toString()
        );
        const params = new URLSearchParams({
          fromIso,
          toIso,
          limit: "500",
        });
        if (selectedSportType !== "all") {
          params.set("sportTypes", selectedSportType);
        }

        const response = await fetch(`/api/epg/sport-events?${params.toString()}`);
        const data: unknown = await response.json();
        if (!response.ok || !Array.isArray(data)) {
          const err = data as ApiErrorResponse;
          if (!cancelled) {
            setError(err?.error ?? "Kunde inte hämta sport-schema.");
          }
          return;
        }

        if (!cancelled) {
          setEvents(data as SportEvent[]);
        }
      } catch {
        if (!cancelled) {
          setError("Nätverksfel: kunde inte hämta sport-schema.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [selectedSportType, selectedDayOffset]);

  const isFootballGrouped = selectedSportType === "football";
  const liveNow = useMemo(
    () =>
      events.filter((event) => {
        const start = Date.parse(event.startIso);
        const stop = Date.parse(event.stopIso);
        return start <= now && now < stop;
      }),
    [events, now]
  );
  const nonLiveEvents = useMemo(
    () =>
      events.filter((event) => {
        const start = Date.parse(event.startIso);
        const stop = Date.parse(event.stopIso);
        return !(start <= now && now < stop);
      }),
    [events, now]
  );
  const footballLeagueGroups = useMemo(() => {
    if (!isFootballGrouped) return [];

    const buckets = new Map<string, { key: string; label: string; events: SportEvent[] }>();
    for (const event of events) {
      const hasLeague = typeof event.league === "string" && event.league.trim() !== "";
      const key = hasLeague ? event.league!.trim() : "__other__";
      const label = hasLeague ? event.league!.trim() : "Övriga matcher";
      if (!buckets.has(key)) {
        buckets.set(key, { key, label, events: [] });
      }
      buckets.get(key)!.events.push(event);
    }

    const groups = Array.from(buckets.values()).map((group) => ({
      ...group,
      events: group.events.sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso)),
    }));

    return groups.sort((a, b) => {
      if (a.key === "__other__") return 1;
      if (b.key === "__other__") return -1;
      const aFirst = Date.parse(a.events[0]?.startIso ?? "");
      const bFirst = Date.parse(b.events[0]?.startIso ?? "");
      return aFirst - bFirst;
    });
  }, [events, isFootballGrouped]);

  useEffect(() => {
    if (!isFootballGrouped) return;
    const allKeys = new Set(footballLeagueGroups.map((group) => group.key));
    setExpandedLeagueKeys(allKeys);
  }, [isFootballGrouped, footballLeagueGroups]);

  const handlePlayChannel = async (eventId: string, epgDisplayName: string) => {
    const credentials = loadPlaylist();
    if (!credentials) {
      setPlayError("Saknar credentials. Logga in igen.");
      return;
    }

    const key = `${eventId}:${epgDisplayName}`;
    setPlayingChannelKey(key);
    setPlayError(null);

    try {
      const response = await fetch("/api/find-xtream-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          epgDisplayName,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object") {
        const err = data as ApiErrorResponse;
        setPlayError(err?.error ?? "Kunde inte slå upp kanal.");
        return;
      }

      const match = (data as { match?: { stream_id: number } | null }).match;
      if (!match) {
        setPlayError("Kunde inte hitta kanalen i din spellista.");
        return;
      }

      await router.push(`/live/watch/${match.stream_id}?categoryId=&from=sport`);
    } catch {
      setPlayError("Nätverksfel vid kanalsökning.");
    } finally {
      setPlayingChannelKey(null);
    }
  };

  const renderStatusBadge = (event: SportEvent) => {
    const status = getMatchStatus(now, event.startIso, event.stopIso, selectedDayOffset);
    if (status === "live") {
      return (
        <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
          LIVE
        </span>
      );
    }
    if (status === "soon") {
      return (
        <span className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-950">
          SNART
        </span>
      );
    }
    if (status === "ended") {
      return (
        <span className="rounded bg-zinc-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-100">
          Avslutad
        </span>
      );
    }
    return null;
  };

  const renderEventRow = (event: SportEvent, opts?: { hideLeague?: boolean }) => {
    const isExpanded = expandedEventId === event.id;
    const hideLeague = opts?.hideLeague ?? false;
    const badge = renderStatusBadge(event);
    return (
      <li key={event.id}>
        <button
          type="button"
          onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/40 p-3 text-left transition hover:border-zinc-500 hover:bg-zinc-800/60"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span>{eventTimeLabel(event, selectedDayOffset)}</span>
                {badge}
              </p>
              <p className="mt-1 truncate text-base font-medium text-white">{event.title}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {sportLabel(event.sportType)}
                {!hideLeague && event.league ? ` · ${event.league}` : ""}
              </p>
            </div>
            <span className="rounded-full border border-zinc-600 px-2 py-1 text-xs text-zinc-300">
              {event.channels.length} {event.channels.length === 1 ? "kanal" : "kanaler"}
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3">
            {event.channels.map((channel, idx) => {
              const playKey = `${event.id}:${channel.epgChannelId}`;
              return (
                <div
                  key={`${channel.epgChannelId}-${idx}`}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {channel.iconUrl ? (
                      <img
                        src={channel.iconUrl}
                        alt={channel.displayName}
                        className="h-8 w-8 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-zinc-700" />
                    )}
                    <span className="truncate text-sm text-zinc-200">{channel.displayName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handlePlayChannel(event.id, channel.displayName);
                    }}
                    disabled={playingChannelKey === playKey}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {playingChannelKey === playKey ? "Söker kanal..." : "Spela"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">Sport</h1>
        <p className="text-xs text-zinc-400">
          Visar svenska sportkanaler som standard, plus amerikanska kanaler för IndyCar/motorsport.
        </p>

        <div className="flex flex-wrap gap-2">
          {SPORT_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setSelectedSportType(filter)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                selectedSportType === filter
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
              }`}
            >
              {sportLabel(filter)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {availableDayOffsets.map((offset) => (
            <button
              key={offset}
              type="button"
              onClick={() => setSelectedDayOffset(offset)}
              className={`min-w-[78px] rounded-xl px-3 py-2 text-center ${
                selectedDayOffset === offset
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
              }`}
            >
              <span className="block text-sm font-medium">{dateTabLabel(offset)}</span>
              {offset === 0 && <span className="block text-[10px] opacity-80">(idag)</span>}
            </button>
          ))}
        </div>

        {playError && (
          <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {playError}
          </p>
        )}
        {error && (
          <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        {isLoading && <p className="text-sm text-zinc-300">Laddar sport-schema...</p>}

        {!isLoading && !error && events.length === 0 && (
          <p className="rounded border border-zinc-700 bg-zinc-900/30 p-3 text-sm text-zinc-300">
            Inga events hittades för valt filter/datum.
          </p>
        )}

        {!isLoading &&
          !error &&
          !isFootballGrouped &&
          selectedDayOffset === 0 &&
          liveNow.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-200">
              <span className="rounded bg-rose-600 px-2 py-0.5 text-xs text-white">LIVE</span>
              Pågår nu
            </h2>
            <ul className="space-y-2">{liveNow.map((event) => renderEventRow(event))}</ul>
          </section>
        )}

        {!isLoading && !error && isFootballGrouped && footballLeagueGroups.length > 0 && (
          <section className="space-y-3">
            {footballLeagueGroups.map((group) => {
              if (group.key === "__other__" && group.events.length === 0) {
                return null;
              }
              const isExpanded = expandedLeagueKeys.has(group.key);
              return (
                <div key={group.key} className="rounded-lg border border-zinc-700 bg-zinc-900/20">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedLeagueKeys((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) {
                          next.delete(group.key);
                        } else {
                          next.add(group.key);
                        }
                        return next;
                      })
                    }
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                  >
                    <span className="text-sm font-semibold text-zinc-100">
                      {group.label} ({group.events.length}{" "}
                      {group.events.length === 1 ? "match" : "matcher"})
                    </span>
                    <span className="text-zinc-300">{isExpanded ? "▾" : "▸"}</span>
                  </button>
                  {isExpanded && (
                    <ul className="space-y-2 border-t border-zinc-700 p-3">
                      {group.events.map((event) => renderEventRow(event, { hideLeague: true }))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {!isLoading && !error && !isFootballGrouped && nonLiveEvents.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">
              Kommande events
            </h2>
            <ul className="space-y-2">{nonLiveEvents.map((event) => renderEventRow(event))}</ul>
          </section>
        )}
      </div>
    </main>
  );
}
