import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CategorySplitView } from "@/components/CategorySplitView";
import { formatStartTime, formatTimeRange } from "@/lib/epg/formatTime";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { NowAndNextResult } from "@/types/epg";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
} from "@/types/xtream";

type CategoriesState = {
  isLoading: boolean;
  error: string | null;
  categories: XtreamCategory[];
};

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

export default function LiveIndexPage() {
  const router = useRouter();
  const selectedCategoryId = useMemo(
    () => (typeof router.query.categoryId === "string" ? router.query.categoryId : null),
    [router.query.categoryId]
  );
  const [state, setState] = useState<CategoriesState>({
    isLoading: true,
    error: null,
    categories: [],
  });
  const [streamsState, setStreamsState] = useState<StreamsState>({
    isLoading: false,
    error: null,
    streams: [],
  });
  const [epgByStreamId, setEpgByStreamId] = useState<Map<number, NowAndNextResult>>(
    new Map()
  );

  const selectCategory = (id: string) => {
    void router.push(`/live?categoryId=${encodeURIComponent(id)}`, undefined, {
      shallow: true,
    });
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const credentials = loadPlaylist();
      if (!credentials) {
        void router.replace("/");
        return;
      }

      const normalizedCredentials: XtreamCredentials = {
        serverUrl: credentials.serverUrl.trim(),
        username: credentials.username.trim(),
        password: credentials.password,
      };

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const response = await fetch("/api/xtream/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizedCredentials),
        });
        const data: unknown = await response.json();

        if (!response.ok) {
          const err = data as ApiErrorResponse;
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error:
                typeof err?.error === "string" ? err.error : "Ett fel uppstod.",
            }));
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: "Oväntat svar från servern.",
            }));
          }
          return;
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            categories: data as XtreamCategory[],
          });
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Nätverksfel: kunde inte kontakta servern.",
          }));
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedCategoryId) {
      setStreamsState({ isLoading: false, error: null, streams: [] });
      setEpgByStreamId(new Map());
      return;
    }

    const credentials = loadPlaylist();
    if (!credentials) return;

    let cancelled = false;
    setStreamsState({ isLoading: true, error: null, streams: [] });

    const fetchStreams = async () => {
      try {
        const response = await fetch("/api/xtream/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...credentials,
            categoryId: selectedCategoryId,
          }),
        });

        const data: unknown = await response.json();
        if (!response.ok) {
          const err = data as ApiErrorResponse;
          if (!cancelled) {
            setStreamsState({
              isLoading: false,
              error: typeof err?.error === "string" ? err.error : "Ett fel uppstod.",
              streams: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setStreamsState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              streams: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setStreamsState({
            isLoading: false,
            error: null,
            streams: data as XtreamLiveStream[],
          });
          setEpgByStreamId(new Map());
        }
      } catch {
        if (!cancelled) {
          setStreamsState({
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
  }, [selectedCategoryId]);

  useEffect(() => {
    if (streamsState.streams.length === 0) return;

    let cancelled = false;
    const loadNowAndNext = async () => {
      try {
        const response = await fetch("/api/epg/now-and-next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xtreamChannels: streamsState.streams.map((stream) => ({
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
  }, [streamsState.streams]);

  const categoriesForPanel = state.categories.map((category) => ({
    id: String(category.category_id),
    name: category.category_name,
  }));

  return (
    <main className="px-4 py-4">
      {state.isLoading && <p className="text-sm text-zinc-300">Laddar kategorier...</p>}

      {!state.isLoading && state.error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {state.error}
        </div>
      )}

      {!state.isLoading && !state.error && (
        <CategorySplitView
          categories={categoriesForPanel}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={selectCategory}
          searchPlaceholder="Sök kategori..."
          emptyStateMessage="Välj en kategori för att se innehållet."
        >
          {streamsState.isLoading && <p className="text-sm text-zinc-300">Laddar kanaler...</p>}
          {!streamsState.isLoading && streamsState.error && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              {streamsState.error}
            </p>
          )}
          {!streamsState.isLoading && !streamsState.error && (
            <ul className="space-y-2">
              {streamsState.streams.map((stream) => {
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
                            selectedCategoryId ?? ""
                          )}&streamName=${encodeURIComponent(stream.name)}`
                        );
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-left transition hover:border-zinc-500 hover:bg-zinc-700/60"
                    >
                      <StreamIcon name={stream.name} streamIcon={stream.stream_icon} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{stream.name}</p>
                        {nowText && <p className="truncate text-xs text-zinc-400">{nowText}</p>}
                        {nextText && <p className="truncate text-xs text-zinc-400">{nextText}</p>}
                        <p className="text-xs text-zinc-400">#{stream.num}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
              {streamsState.streams.length === 0 && (
                <li className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  Inga kanaler hittades i den här kategorin.
                </li>
              )}
            </ul>
          )}
        </CategorySplitView>
      )}
    </main>
  );
}
