import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { SmartListRule } from "@/lib/smartListRules";
import type { NowAndNextResult } from "@/types/epg";
import type {
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
  XtreamSeries,
  XtreamSeriesCategory,
  XtreamVodStream,
} from "@/types/xtream";

type SmartListType = "live" | "movies" | "series";

type CachePayload<T> = {
  data: T;
  cachedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(ruleId: SmartListRule["id"], type: SmartListType): string {
  return `iptv-pc:smart-list:${ruleId}:${type}`;
}

function loadCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload<T>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt > ttlMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachePayload<T> = { data, cachedAt: Date.now() };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // best effort
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json();
    if (!response.ok) return null;
    return data as T;
  } catch {
    return null;
  }
}

type SmartListViewProps = {
  rule: SmartListRule;
  type: SmartListType;
};

export function SmartListView({ rule, type }: SmartListViewProps) {
  const router = useRouter();
  const [liveItems, setLiveItems] = useState<XtreamLiveStream[]>([]);
  const [movieItems, setMovieItems] = useState<XtreamVodStream[]>([]);
  const [seriesItems, setSeriesItems] = useState<XtreamSeries[]>([]);
  const [nowAndNext, setNowAndNext] = useState<Record<number, NowAndNextResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const credentials = useMemo(() => {
    const stored = loadPlaylist();
    if (!stored) return null;
    return {
      serverUrl: stored.serverUrl.trim(),
      username: stored.username.trim(),
      password: stored.password,
    } as XtreamCredentials;
  }, []);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    const key = cacheKey(rule.id, type);

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setProgress({ done: 0, total: 0 });
      setLiveItems([]);
      setMovieItems([]);
      setSeriesItems([]);

      const cached = loadCache<XtreamLiveStream[] | XtreamVodStream[] | XtreamSeries[]>(
        key,
        CACHE_TTL_MS
      );
      if (cached) {
        if (type === "live") setLiveItems(cached as XtreamLiveStream[]);
        if (type === "movies") setMovieItems(cached as XtreamVodStream[]);
        if (type === "series") setSeriesItems(cached as XtreamSeries[]);
        if (!cancelled) setIsLoading(false);
        return;
      }

      const categoryEndpoint =
        type === "live"
          ? "/api/xtream/categories"
          : type === "movies"
            ? "/api/xtream/vod-categories"
            : "/api/xtream/series-categories";
      const streamEndpoint =
        type === "live"
          ? "/api/xtream/streams"
          : type === "movies"
            ? "/api/xtream/vod-streams"
            : "/api/xtream/series";

      const categories = await postJson<(XtreamCategory | XtreamSeriesCategory)[]>(
        categoryEndpoint,
        credentials
      );
      if (!categories) {
        if (!cancelled) {
          setError("Kunde inte hämta kategorier för smart lista.");
          setIsLoading(false);
        }
        return;
      }

      const matchingCategories = categories.filter((c) => rule.matchCategory(c.category_name));
      setProgress({ done: 0, total: matchingCategories.length });

      const requests = matchingCategories.map((category) =>
        postJson<XtreamLiveStream[] | XtreamVodStream[] | XtreamSeries[]>(streamEndpoint, {
          ...credentials,
          categoryId: category.category_id,
        })
          .then((result) => result)
          .finally(() => {
            if (!cancelled) {
              setProgress((prev) => ({ ...prev, done: Math.min(prev.done + 1, matchingCategories.length) }));
            }
          })
      );

      const responses = await Promise.all(requests);
      if (cancelled) return;
      const successful = responses.filter((item): item is (XtreamLiveStream[] | XtreamVodStream[] | XtreamSeries[]) =>
        Array.isArray(item)
      );

      if (successful.length === 0 && matchingCategories.length > 0) {
        setError("Kunde inte hämta innehåll för någon matchad kategori.");
        setIsLoading(false);
        return;
      }

      if (type === "live") {
        const merged = successful.flat() as XtreamLiveStream[];
        const filtered = merged.filter((stream) => rule.matchLive(stream.name));
        setLiveItems(filtered);
        saveCache(key, filtered);
      } else if (type === "movies") {
        const merged = successful.flat() as XtreamVodStream[];
        setMovieItems(merged);
        saveCache(key, merged);
      } else {
        const merged = successful.flat() as XtreamSeries[];
        setSeriesItems(merged);
        saveCache(key, merged);
      }

      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [credentials, rule, type]);

  useEffect(() => {
    if (type !== "live" || liveItems.length === 0) {
      setNowAndNext({});
      return;
    }
    let cancelled = false;
    void postJson<{ results?: NowAndNextResult[] }>("/api/epg/now-and-next", {
      xtreamChannels: liveItems.map((channel) => ({
        stream_id: channel.stream_id,
        name: channel.name,
      })),
    }).then((data) => {
      if (cancelled || !data || !Array.isArray(data.results)) return;
      const next: Record<number, NowAndNextResult> = {};
      for (const row of data.results) next[row.stream_id] = row;
      setNowAndNext(next);
    });
    return () => {
      cancelled = true;
    };
  }, [liveItems, type]);

  const progressLabel = progress.total > 0 ? `Laddar... (${progress.done} av ${progress.total} kategorier hämtade)` : null;
  const itemLabel = type === "live" ? "kanaler" : type === "movies" ? "filmer" : "serier";

  return (
    <div className="space-y-3">
      {isLoading && progressLabel && <p className="text-center text-xs text-zinc-400">{progressLabel}</p>}
      {error && <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-200">{error}</p>}
      {isLoading && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/20 p-3">
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-zinc-700/60" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-700/60" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-700/60" />
          </div>
        </div>
      )}

      {type === "live" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/20">
          {liveItems.map((item) => (
            <button
              key={item.stream_id}
              type="button"
              onClick={() =>
                void router.push(
                  `/live/watch/${item.stream_id}?streamName=${encodeURIComponent(item.name)}&from=favorites`
                )
              }
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/40"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-700">
                {item.stream_icon ? (
                  <img src={item.stream_icon} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-200">TV</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{item.name}</p>
                <p className="truncate text-xs text-zinc-400">
                  {nowAndNext[item.stream_id]?.now?.title
                    ? `Nu: ${nowAndNext[item.stream_id]?.now?.title}`
                    : isLoading
                      ? "Laddar..."
                      : "Ingen EPG-info"}
                </p>
              </div>
              <FavoriteToggle type="live" id={item.stream_id} name={item.name} />
            </button>
          ))}
          {!isLoading && liveItems.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-400">Inga {itemLabel} matchade {rule.name}</p>
          )}
        </div>
      )}

      {type === "movies" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/20">
          {movieItems.map((item) => (
            <button
              key={item.stream_id}
              type="button"
              onClick={() => void router.push(`/movies/${item.stream_id}?from=favorites`)}
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/40"
            >
              <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-zinc-700">
                {item.stream_icon ? (
                  <img src={item.stream_icon} alt={item.name} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-zinc-100">{item.name}</p>
              <FavoriteToggle type="movies" id={item.stream_id} name={item.name} />
            </button>
          ))}
          {!isLoading && movieItems.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-400">Inga {itemLabel} matchade {rule.name}</p>
          )}
        </div>
      )}

      {type === "series" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/20">
          {seriesItems.map((item) => (
            <button
              key={item.series_id}
              type="button"
              onClick={() => void router.push(`/series/${item.series_id}?from=favorites`)}
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/40"
            >
              <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-zinc-700">
                {item.cover ? <img src={item.cover} alt={item.name} className="h-full w-full object-cover" /> : null}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-zinc-100">{item.name}</p>
              <FavoriteToggle type="series" id={item.series_id} name={item.name} />
            </button>
          ))}
          {!isLoading && seriesItems.length === 0 && (
            <p className="p-4 text-center text-sm text-zinc-400">Inga {itemLabel} matchade {rule.name}</p>
          )}
        </div>
      )}
    </div>
  );
}
