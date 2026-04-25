import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import type { FavoriteEntry } from "@/lib/favoritesStorage";
import { loadPlaylist } from "@/lib/playlistStorage";
import { useFavorites } from "@/lib/useFavorites";
import type {
  NowAndNextResult,
} from "@/types/epg";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
  XtreamSeriesInfo,
  XtreamVodInfo,
} from "@/types/xtream";

type TabType = "live" | "movies" | "series";
type LiveMap = Record<number, XtreamLiveStream>;
type MovieInfoMap = Record<number, XtreamVodInfo>;
type SeriesInfoMap = Record<number, XtreamSeriesInfo>;

const LIVE_CACHE_KEY = "iptv-pc:favorites:live-catalog:v1";
const MOVIES_INFO_CACHE_KEY = "iptv-pc:movies-info-cache";
const SERIES_INFO_CACHE_KEY = "iptv-pc:series-info-cache";
const CATALOG_TTL_MS = 5 * 60 * 1000;
const INFO_TTL_MS = 30 * 60 * 1000;

function saveSessionCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    const payload = { savedAt: Date.now(), data };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // best effort
  }
}

function loadSessionCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { savedAt?: unknown; data?: unknown };
    if (typeof obj.savedAt !== "number" || Date.now() - obj.savedAt > ttlMs) return null;
    return (obj.data as T) ?? null;
  } catch {
    return null;
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

async function loadAllLiveStreams(credentials: XtreamCredentials): Promise<LiveMap> {
  const cached = loadSessionCache<LiveMap>(LIVE_CACHE_KEY, CATALOG_TTL_MS);
  if (cached) return cached;

  const categories = await postJson<XtreamCategory[]>("/api/xtream/categories", credentials);
  if (!categories) return {};

  const byId: LiveMap = {};
  for (const category of categories) {
    const streams = await postJson<XtreamLiveStream[]>("/api/xtream/streams", {
      ...credentials,
      categoryId: category.category_id,
    });
    if (!streams) continue;
    for (const stream of streams) {
      byId[stream.stream_id] = stream;
    }
  }
  saveSessionCache(LIVE_CACHE_KEY, byId);
  return byId;
}

type ItemInfoCacheEntry<T> = {
  savedAt: number;
  data: T;
};

type ItemInfoCachePayload<T> = Record<string, ItemInfoCacheEntry<T>>;

function loadItemInfoCache<T>(key: string, ttlMs: number): ItemInfoCachePayload<T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const output: ItemInfoCachePayload<T> = {};
    const now = Date.now();
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as { savedAt?: unknown; data?: unknown };
      if (typeof entry.savedAt !== "number" || now - entry.savedAt > ttlMs) continue;
      output[id] = { savedAt: entry.savedAt, data: entry.data as T };
    }
    return output;
  } catch {
    return {};
  }
}

function saveItemInfoCache<T>(key: string, cache: ItemInfoCachePayload<T>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // best effort
  }
}

async function loadMoviesInfo(
  credentials: XtreamCredentials,
  favorites: FavoriteEntry[]
): Promise<MovieInfoMap> {
  const cache = loadItemInfoCache<XtreamVodInfo>(MOVIES_INFO_CACHE_KEY, INFO_TTL_MS);
  const nextMap: MovieInfoMap = {};
  const missingIds: number[] = [];

  for (const favorite of favorites) {
    const cached = cache[String(favorite.id)];
    if (cached?.data) {
      nextMap[favorite.id] = cached.data;
    } else {
      missingIds.push(favorite.id);
    }
  }

  if (missingIds.length === 0) return nextMap;

  const responses = await Promise.all(
    missingIds.map((id) =>
      postJson<XtreamVodInfo>("/api/xtream/vod-info", {
        ...credentials,
        vod_id: id,
      }).then((data) => ({ id, data }))
    )
  );

  for (const response of responses) {
    if (!response.data) continue;
    nextMap[response.id] = response.data;
    cache[String(response.id)] = {
      savedAt: Date.now(),
      data: response.data,
    };
  }
  saveItemInfoCache(MOVIES_INFO_CACHE_KEY, cache);

  return nextMap;
}

async function loadSeriesInfo(
  credentials: XtreamCredentials,
  favorites: FavoriteEntry[]
): Promise<SeriesInfoMap> {
  const cache = loadItemInfoCache<XtreamSeriesInfo>(SERIES_INFO_CACHE_KEY, INFO_TTL_MS);
  const nextMap: SeriesInfoMap = {};
  const missingIds: number[] = [];

  for (const favorite of favorites) {
    const cached = cache[String(favorite.id)];
    if (cached?.data) {
      nextMap[favorite.id] = cached.data;
    } else {
      missingIds.push(favorite.id);
    }
  }

  if (missingIds.length === 0) return nextMap;

  const responses = await Promise.all(
    missingIds.map((id) =>
      postJson<XtreamSeriesInfo>("/api/xtream/series-info", {
        ...credentials,
        series_id: id,
      }).then((data) => ({ id, data }))
    )
  );

  for (const response of responses) {
    if (!response.data) continue;
    nextMap[response.id] = response.data;
    cache[String(response.id)] = {
      savedAt: Date.now(),
      data: response.data,
    };
  }
  saveItemInfoCache(SERIES_INFO_CACHE_KEY, cache);

  return nextMap;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/30 p-8 text-center text-sm text-zinc-400">
      Inga {label} markerade som favoriter än. Klicka på stjärnan för att lägga till.
    </div>
  );
}

export default function FavoritesPage() {
  const router = useRouter();
  const liveFavs = useFavorites("live");
  const movieFavs = useFavorites("movies");
  const seriesFavs = useFavorites("series");
  const [activeTab, setActiveTab] = useState<TabType>("live");
  const [liveMap, setLiveMap] = useState<LiveMap>({});
  const [movieMap, setMovieMap] = useState<MovieInfoMap>({});
  const [seriesMap, setSeriesMap] = useState<SeriesInfoMap>({});
  const [nowAndNext, setNowAndNext] = useState<Record<number, NowAndNextResult>>({});
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadPlaylist();
    if (!stored) {
      void router.replace("/");
    }
  }, [router]);

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
    if (activeTab !== "live" || !credentials) return;
    let cancelled = false;
    setIsLoadingLive(true);
    void loadAllLiveStreams(credentials)
      .then((map) => {
        if (!cancelled) setLiveMap(map);
      })
      .catch(() => {
        if (!cancelled) setError("Kunde inte hämta live-katalog.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, credentials]);

  useEffect(() => {
    if (activeTab !== "movies" || !credentials) return;
    let cancelled = false;
    setIsLoadingMovies(true);
    void loadMoviesInfo(credentials, movieFavs.favorites)
      .then((map) => {
        if (!cancelled) setMovieMap(map);
      })
      .catch(() => {
        if (!cancelled) setError("Kunde inte hämta filminformation.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMovies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, credentials, movieFavs.favorites]);

  useEffect(() => {
    if (activeTab !== "series" || !credentials) return;
    let cancelled = false;
    setIsLoadingSeries(true);
    void loadSeriesInfo(credentials, seriesFavs.favorites)
      .then((map) => {
        if (!cancelled) setSeriesMap(map);
      })
      .catch(() => {
        if (!cancelled) setError("Kunde inte hämta serieinformation.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSeries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, credentials, seriesFavs.favorites]);

  useEffect(() => {
    if (!credentials || liveFavs.favorites.length === 0 || activeTab !== "live") {
      setNowAndNext({});
      return;
    }

    let cancelled = false;
    const xtreamChannels = liveFavs.favorites.map((entry) => {
      const live = liveMap[entry.id];
      return {
        stream_id: entry.id,
        name: live?.name ?? entry.name,
      };
    });

    void postJson<{ results?: NowAndNextResult[] }>(
      "/api/epg/now-and-next",
      { xtreamChannels }
    ).then((data) => {
      if (cancelled || !data || !Array.isArray(data.results)) return;
      const next: Record<number, NowAndNextResult> = {};
      for (const item of data.results) {
        next[item.stream_id] = item;
      }
      setNowAndNext(next);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, credentials, liveFavs.favorites, liveMap]);

  const liveRows = useMemo(
    () =>
      liveFavs.favorites.map((fav) => ({
        fav,
        data: liveMap[fav.id],
      })),
    [liveFavs.favorites, liveMap]
  );
  const movieRows = useMemo(
    () =>
      movieFavs.favorites.map((fav) => ({
        fav,
        data: movieMap[fav.id],
      })),
    [movieFavs.favorites, movieMap]
  );
  const seriesRows = useMemo(
    () =>
      seriesFavs.favorites.map((fav) => ({
        fav,
        data: seriesMap[fav.id],
      })),
    [seriesFavs.favorites, seriesMap]
  );

  const renderLive = () => {
    if (liveFavs.count === 0) return <EmptyState label="kanaler" />;
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/20">
        {liveRows.map(({ fav, data }) => {
          const title = data?.name ?? fav.name;
          const nowRow = nowAndNext[fav.id];
          return (
            <button
              key={fav.id}
              type="button"
              onClick={() =>
                void router.push(
                  `/live/watch/${fav.id}?streamName=${encodeURIComponent(title)}&from=favorites`
                )
              }
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/40"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-700">
                {data?.stream_icon ? (
                  <img src={data.stream_icon} alt={title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-200">
                    TV
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{title}</p>
                <p className="truncate text-xs text-zinc-400">
                  {nowRow?.now?.title ? `Nu: ${nowRow.now.title}` : isLoadingLive ? "Laddar..." : "Ingen EPG-info"}
                </p>
              </div>
              <FavoriteToggle type="live" id={fav.id} name={title} />
            </button>
          );
        })}
      </div>
    );
  };

  const renderMovies = () => {
    if (movieFavs.count === 0) return <EmptyState label="filmer" />;
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/20">
        {movieRows.map(({ fav, data }) => {
          const info = data?.info;
          const movieData = data?.movie_data;
          const title = movieData?.name ?? fav.name;
          const year = info?.releasedate?.match(/^(\d{4})/)?.[1] ?? null;
          const meta = [info?.genre?.trim() ? info.genre : null, year].filter(Boolean).join(" · ");
          return (
            <button
              key={fav.id}
              type="button"
              onClick={() => void router.push(`/movies/${fav.id}?from=favorites`)}
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/40"
            >
              <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-zinc-700">
                {info?.movie_image ? (
                  <img src={info.movie_image} alt={title} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{title}</p>
                <p className="truncate text-xs text-zinc-400">
                  {meta || (isLoadingMovies ? "Laddar..." : "Metadata saknas")}
                </p>
              </div>
              <FavoriteToggle type="movies" id={fav.id} name={title} />
            </button>
          );
        })}
      </div>
    );
  };

  const renderSeries = () => {
    if (seriesFavs.count === 0) return <EmptyState label="serier" />;
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/20">
        {seriesRows.map(({ fav, data }) => {
          const info = data?.info;
          const title = info?.name ?? fav.name;
          const year = info?.releaseDate?.match(/^(\d{4})/)?.[1] ?? null;
          return (
            <button
              key={fav.id}
              type="button"
              onClick={() => void router.push(`/series/${fav.id}?from=favorites`)}
              className="flex w-full items-center gap-3 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/40"
            >
              <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-zinc-700">
                {info?.cover ? <img src={info.cover} alt={title} className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{title}</p>
                <p className="truncate text-xs text-zinc-400">
                  {year ?? (isLoadingSeries ? "Laddar..." : "Metadata saknas")}
                </p>
              </div>
              <FavoriteToggle type="series" id={fav.id} name={title} />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-4">
      <div className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-4 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">Favoriter</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "live"
                ? "bg-zinc-700 text-white"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Kanaler ({liveFavs.count})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("movies")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "movies"
                ? "bg-zinc-700 text-white"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Filmer ({movieFavs.count})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("series")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "series"
                ? "bg-zinc-700 text-white"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Serier ({seriesFavs.count})
          </button>
        </div>

        {error && (
          <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        {activeTab === "live" && renderLive()}
        {activeTab === "movies" && renderMovies()}
        {activeTab === "series" && renderSeries()}
      </div>
    </main>
  );
}
