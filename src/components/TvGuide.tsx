import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { EpgProgramme } from "@/types/epg";
import type { XtreamLiveStream } from "@/types/xtream";

const PIXELS_PER_HOUR = 200;
const VIEW_DURATION_HOURS = 6;
const LEFT_COLUMN_WIDTH = 200;
const ROW_HEIGHT = 64;
const HALF_HOUR_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type TvGuideProps = {
  channels: Pick<XtreamLiveStream, "stream_id" | "name" | "stream_icon">[];
  categoryId: string;
};

type MultiChannelResponse = {
  results: {
    stream_id: number;
    epgChannelId: string | null;
    programmes: EpgProgramme[];
  }[];
};

type TooltipState = {
  key: string;
  x: number;
  y: number;
  title: string;
  description?: string;
  timeLabel: string;
} | null;

function roundToNearestHalfHour(ms: number): number {
  return Math.round(ms / HALF_HOUR_MS) * HALF_HOUR_MS;
}

function defaultViewStartMs(nowMs: number): number {
  return roundToNearestHalfHour(nowMs - HOUR_MS);
}

function formatHourTick(ms: number): string {
  return new Date(ms).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateHeader(ms: number): string {
  return new Date(ms).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatProgrammeTime(startIso: string, stopIso: string): string {
  const start = new Date(startIso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const stop = new Date(stopIso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${start}-${stop}`;
}

function StreamIcon({ name, streamIcon }: { name: string; streamIcon: string }) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = streamIcon.trim() !== "" && !hasImageError;
  const fallbackLabel = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs font-semibold text-zinc-100">
      {showImage ? (
        <img
          src={streamIcon}
          alt={`${name} logga`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            setHasImageError(true);
          }}
        />
      ) : (
        <span>{fallbackLabel}</span>
      )}
    </div>
  );
}

export function TvGuide({ channels, categoryId }: TvGuideProps) {
  const router = useRouter();
  const [viewStartMs, setViewStartMs] = useState(() => defaultViewStartMs(Date.now()));
  const [viewDurationHours] = useState(VIEW_DURATION_HOURS);
  const [epgData, setEpgData] = useState<Map<number, EpgProgramme[]>>(new Map());
  const [mappedChannelIds, setMappedChannelIds] = useState<Map<number, string | null>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const totalGridWidth = viewDurationHours * PIXELS_PER_HOUR;
  const viewEndMs = viewStartMs + viewDurationHours * HOUR_MS;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (channels.length === 0) {
      setEpgData(new Map());
      setMappedChannelIds(new Map());
      return;
    }

    let cancelled = false;
    const fetchEpg = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/epg/multi-channel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xtreamChannels: channels.map((channel) => ({
              stream_id: channel.stream_id,
              name: channel.name,
            })),
            fromIso: new Date(viewStartMs).toISOString(),
            toIso: new Date(viewEndMs).toISOString(),
          }),
        });
        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== "object") return;

        const results = (data as MultiChannelResponse).results;
        if (!Array.isArray(results)) return;

        if (!cancelled) {
          const nextMap = new Map<number, EpgProgramme[]>();
          const nextMapped = new Map<number, string | null>();
          for (const item of results) {
            nextMap.set(item.stream_id, item.programmes ?? []);
            nextMapped.set(item.stream_id, item.epgChannelId ?? null);
          }
          setEpgData(nextMap);
          setMappedChannelIds(nextMapped);
        }
      } catch {
        if (!cancelled) {
          setEpgData(new Map());
          setMappedChannelIds(new Map());
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchEpg();
    return () => {
      cancelled = true;
    };
  }, [channels, viewStartMs, viewEndMs]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nowOffset = ((now - viewStartMs) / HOUR_MS) * PIXELS_PER_HOUR;
    const desiredLeft = Math.max(0, LEFT_COLUMN_WIDTH + nowOffset - container.clientWidth * 0.3);
    container.scrollLeft = desiredLeft;
  }, [viewStartMs]); // intentional: auto-adjust when time window changes

  const anyMappedChannel = useMemo(() => {
    for (const value of mappedChannelIds.values()) {
      if (value) return true;
    }
    return false;
  }, [mappedChannelIds]);

  const nowLineLeft = ((now - viewStartMs) / HOUR_MS) * PIXELS_PER_HOUR;
  const showNowLine = nowLineLeft >= 0 && nowLineLeft <= totalGridWidth;

  const hourTicks = useMemo(() => {
    return Array.from({ length: viewDurationHours + 1 }, (_, index) => ({
      ms: viewStartMs + index * HOUR_MS,
      left: index * PIXELS_PER_HOUR,
    }));
  }, [viewDurationHours, viewStartMs]);

  const jumpNow = () => setViewStartMs(defaultViewStartMs(Date.now()));

  const navigateToWatch = (streamId: number, streamName: string) => {
    void router.push(
      `/live/watch/${streamId}?categoryId=${encodeURIComponent(
        categoryId
      )}&streamName=${encodeURIComponent(streamName)}`
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setViewStartMs((prev) => prev - 2 * HOUR_MS)}
          className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          ← 2h
        </button>
        <button
          type="button"
          onClick={() => setViewStartMs((prev) => prev - HOUR_MS)}
          className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          ← 1h
        </button>
        <button
          type="button"
          onClick={jumpNow}
          className="rounded border border-blue-500 bg-blue-600/20 px-2 py-1 text-xs text-blue-100 hover:bg-blue-600/30"
        >
          Nu
        </button>
        <button
          type="button"
          onClick={() => setViewStartMs((prev) => prev + HOUR_MS)}
          className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          1h →
        </button>
        <button
          type="button"
          onClick={() => setViewStartMs((prev) => prev + 2 * HOUR_MS)}
          className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          2h →
        </button>
      </div>

      {isLoading && <p className="text-sm text-zinc-300">Laddar TV-guide...</p>}

      {!isLoading && channels.length > 0 && !anyMappedChannel && (
        <div className="rounded border border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-300">
          Ingen EPG tillgänglig - bygg cache.
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative h-[calc(100vh-210px)] overflow-auto rounded-lg border border-zinc-700 bg-zinc-900/30"
      >
        <div
          className="relative"
          style={{ width: LEFT_COLUMN_WIDTH + totalGridWidth, minHeight: 56 + channels.length * ROW_HEIGHT }}
        >
          <div className="sticky top-0 z-30 flex border-b border-zinc-700 bg-zinc-900/95">
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-zinc-700 px-3 py-2"
              style={{ width: LEFT_COLUMN_WIDTH }}
            >
              <p className="text-xs text-zinc-400">{formatDateHeader(viewStartMs)}</p>
              <p className="text-sm font-medium text-zinc-100">Kanaler</p>
            </div>
            <div className="relative h-14" style={{ width: totalGridWidth }}>
              {hourTicks.map((tick) => (
                <div
                  key={tick.ms}
                  className="absolute top-0 h-full border-l border-zinc-700/70"
                  style={{ left: tick.left }}
                >
                  <span className="ml-1 mt-2 inline-block text-xs text-zinc-300">
                    {formatHourTick(tick.ms)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {channels.map((channel, rowIndex) => {
            const programmes = epgData.get(channel.stream_id) ?? [];
            return (
              <div
                key={channel.stream_id}
                className="flex border-b border-zinc-800/80"
                style={{ height: ROW_HEIGHT }}
              >
                <button
                  type="button"
                  onClick={() => navigateToWatch(channel.stream_id, channel.name)}
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-zinc-700 bg-zinc-900/95 px-2 text-left hover:bg-zinc-800"
                  style={{ width: LEFT_COLUMN_WIDTH }}
                >
                  <StreamIcon name={channel.name} streamIcon={channel.stream_icon} />
                  <span className="truncate text-xs text-zinc-100">{channel.name}</span>
                </button>

                <div className="relative overflow-hidden" style={{ width: totalGridWidth }}>
                  <div className="absolute inset-0">
                    {Array.from({ length: viewDurationHours + 1 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full border-l border-zinc-800/70"
                        style={{ left: i * PIXELS_PER_HOUR }}
                      />
                    ))}
                  </div>

                  {programmes.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => navigateToWatch(channel.stream_id, channel.name)}
                      className="absolute inset-0 flex items-center justify-center bg-zinc-800/40 text-xs text-zinc-400 hover:bg-zinc-800/60"
                    >
                      Ingen EPG-data
                    </button>
                  ) : (
                    programmes.map((programme, index) => {
                      const startMs = Date.parse(programme.start);
                      const stopMs = Date.parse(programme.stop);
                      const left = ((startMs - viewStartMs) / HOUR_MS) * PIXELS_PER_HOUR;
                      const width = Math.max(
                        6,
                        ((stopMs - startMs) / HOUR_MS) * PIXELS_PER_HOUR
                      );
                      const isNow = startMs < now && now < stopMs;
                      const key = `${channel.stream_id}-${programme.start}-${index}`;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => navigateToWatch(channel.stream_id, channel.name)}
                          onMouseMove={(event) =>
                            setTooltip({
                              key,
                              x: event.clientX,
                              y: event.clientY,
                              title: programme.title,
                              description: programme.description,
                              timeLabel: formatProgrammeTime(programme.start, programme.stop),
                            })
                          }
                          onMouseLeave={() => setTooltip((prev) => (prev?.key === key ? null : prev))}
                          className={`absolute top-1 h-[56px] overflow-hidden rounded px-2 py-1 text-left text-xs ${
                            isNow
                              ? "bg-blue-500/45 text-blue-50"
                              : "bg-zinc-700/70 text-zinc-100 hover:bg-zinc-600/80"
                          }`}
                          style={{ left, width }}
                        >
                          {width > 50 && (
                            <span className="line-clamp-2 text-[11px] leading-4">{programme.title}</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

          {showNowLine && (
            <div
              className="pointer-events-none absolute z-50 bg-rose-500"
              style={{
                left: LEFT_COLUMN_WIDTH + nowLineLeft,
                top: 56,
                bottom: 0,
                width: 2,
              }}
            />
          )}
        </div>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-[100] max-w-xs rounded border border-zinc-600 bg-zinc-950/95 p-2 text-xs text-zinc-100 shadow-2xl"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <p className="font-semibold">{tooltip.title}</p>
          <p className="text-zinc-300">{tooltip.timeLabel}</p>
          {tooltip.description && <p className="mt-1 line-clamp-4 text-zinc-400">{tooltip.description}</p>}
        </div>
      )}
    </div>
  );
}
