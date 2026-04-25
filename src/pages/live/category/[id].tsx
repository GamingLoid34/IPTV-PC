import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { formatStartTime, formatTimeRange } from "@/lib/epg/formatTime";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { NowAndNextResult } from "@/types/epg";
import type { ApiErrorResponse, XtreamLiveStream } from "@/types/xtream";

type StreamsState = {
  isLoading: boolean;
  error: string | null;
  streams: XtreamLiveStream[];
};

function StreamIcon({
  name,
  streamIcon,
}: {
  name: string;
  streamIcon: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = streamIcon.trim() !== "" && !hasImageError;
  const fallbackLabel = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-sm font-semibold text-zinc-100">
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

export default function LiveCategoryPage() {
  const router = useRouter();
  const { id } = router.query;

  const categoryId = useMemo(() => {
    if (typeof id === "string") return id;
    return null;
  }, [id]);

  const [state, setState] = useState<StreamsState>({
    isLoading: true,
    error: null,
    streams: [],
  });
  const [epgByStreamId, setEpgByStreamId] = useState<Map<number, NowAndNextResult>>(
    new Map()
  );

  useEffect(() => {
    if (!router.isReady) return;

    if (Array.isArray(id)) {
      setState({
        isLoading: false,
        error: "Ogiltig kategori i URL.",
        streams: [],
      });
      return;
    }

    if (!categoryId || categoryId.trim() === "") {
      setState({
        isLoading: false,
        error: "Kategori saknas i URL.",
        streams: [],
      });
      return;
    }

    const credentials = loadPlaylist();
    if (!credentials) {
      void router.replace("/");
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const fetchStreams = async () => {
      try {
        const response = await fetch("/api/xtream/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...credentials,
            categoryId,
          }),
        });

        const data: unknown = await response.json();
        if (!response.ok) {
          const err = data as ApiErrorResponse;
          if (!cancelled) {
            setState({
              isLoading: false,
              error:
                typeof err?.error === "string" ? err.error : "Ett fel uppstod.",
              streams: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              streams: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            streams: data as XtreamLiveStream[],
          });
          setEpgByStreamId(new Map());
        }
      } catch {
        if (!cancelled) {
          setState({
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta kanaler.",
            streams: [],
          });
        }
      }
    };

    void fetchStreams();

    return () => {
      cancelled = true;
    };
  }, [router, id, categoryId]);

  useEffect(() => {
    if (state.streams.length === 0) return;

    let cancelled = false;
    const loadNowAndNext = async () => {
      try {
        const response = await fetch("/api/epg/now-and-next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xtreamChannels: state.streams.map((stream) => ({
              stream_id: stream.stream_id,
              name: stream.name,
            })),
          }),
        });

        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== "object") return;
        const results = (data as { results?: unknown }).results;
        if (!Array.isArray(results)) return;

        if (!cancelled) {
          const map = new Map<number, NowAndNextResult>();
          for (const item of results as NowAndNextResult[]) {
            map.set(item.stream_id, item);
          }
          setEpgByStreamId(map);
        }
      } catch {
        // graceful no-EPG fallback
      }
    };

    void loadNowAndNext();
    return () => {
      cancelled = true;
    };
  }, [state.streams.length]);

  return (
    <div className="px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/live"
            className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Tillbaka till kategorier
          </Link>
          {categoryId && (
            <span className="text-xs text-zinc-400">Kategori: {categoryId}</span>
          )}
        </div>

        {state.isLoading && <p className="text-sm text-zinc-300">Laddar...</p>}

        {!state.isLoading && state.error && (
          <div className="space-y-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <p>{state.error}</p>
            <button
              type="button"
              onClick={() => {
                void router.replace("/live");
              }}
              className="rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Tillbaka
            </button>
          </div>
        )}

        {!state.isLoading && !state.error && (
          <ul className="space-y-2">
            {state.streams.map((stream) => {
              const epg = epgByStreamId.get(stream.stream_id);
              const nowText = epg?.now
                ? `Nu: ${epg.now.title} (${formatTimeRange(epg.now.start, epg.now.stop)})`
                : null;
              const nextText =
                !epg?.now && epg?.next
                  ? `Nästa: ${epg.next.title} (${formatStartTime(epg.next.start)})`
                  : null;
              return (
                <li key={stream.stream_id}>
                <button
                  type="button"
                  onClick={() => {
                    void router.push(
                      `/live/watch/${stream.stream_id}?categoryId=${encodeURIComponent(
                        categoryId ?? ""
                      )}&streamName=${encodeURIComponent(stream.name)}`
                    );
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-left transition hover:border-zinc-500 hover:bg-zinc-700/60"
                >
                  <StreamIcon name={stream.name} streamIcon={stream.stream_icon} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {stream.name}
                    </p>
                    {nowText && <p className="truncate text-xs text-zinc-400">{nowText}</p>}
                    {nextText && <p className="truncate text-xs text-zinc-400">{nextText}</p>}
                    <p className="text-xs text-zinc-400">#{stream.num}</p>
                  </div>
                </button>
                </li>
              );
            })}
            {state.streams.length === 0 && (
              <li className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                Inga kanaler hittades i den här kategorin.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
