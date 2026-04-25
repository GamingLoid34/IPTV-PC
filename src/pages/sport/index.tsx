import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { SportEvent, SportType } from "@/types/epg";
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

function dayLabel(offset: number): string {
  if (offset === 0) return "Idag";
  if (offset === 1) return "Imorgon";

  const date = new Date();
  date.setDate(date.getDate() + offset);
  const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "short" }).format(date);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${weekday} ${day}/${month}`;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [playingChannelKey, setPlayingChannelKey] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

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

  const now = Date.now();
  const liveNow = useMemo(
    () =>
      events.filter((event) => {
        const start = Date.parse(event.startIso);
        const stop = Date.parse(event.stopIso);
        return start <= now && now < stop;
      }),
    [events, now]
  );
  const upcoming = useMemo(
    () =>
      events.filter((event) => {
        const start = Date.parse(event.startIso);
        const stop = Date.parse(event.stopIso);
        return !(start <= now && now < stop);
      }),
    [events, now]
  );

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

  const renderEventRow = (event: SportEvent) => {
    const isExpanded = expandedEventId === event.id;
    return (
      <li key={event.id}>
        <button
          type="button"
          onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/40 p-3 text-left transition hover:border-zinc-500 hover:bg-zinc-800/60"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">
                {eventTimeLabel(event, selectedDayOffset)}
              </p>
              <p className="mt-1 truncate text-base font-medium text-white">{event.title}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {sportLabel(event.sportType)}
                {event.league ? ` · ${event.league}` : ""}
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
          {DAY_OFFSETS.map((offset) => (
            <button
              key={offset}
              type="button"
              onClick={() => setSelectedDayOffset(offset)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                selectedDayOffset === offset
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
              }`}
            >
              {dayLabel(offset)}
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

        {!isLoading && !error && selectedDayOffset === 0 && liveNow.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-200">
              <span className="rounded bg-rose-600 px-2 py-0.5 text-xs text-white">LIVE</span>
              Pågår nu
            </h2>
            <ul className="space-y-2">{liveNow.map((event) => renderEventRow(event))}</ul>
          </section>
        )}

        {!isLoading && !error && upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">
              Kommande events
            </h2>
            <ul className="space-y-2">{upcoming.map((event) => renderEventRow(event))}</ul>
          </section>
        )}
      </div>
    </main>
  );
}
