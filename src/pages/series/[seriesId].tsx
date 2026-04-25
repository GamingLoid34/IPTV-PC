import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamEpisode,
  XtreamSeriesInfo,
  XtreamSeason,
} from "@/types/xtream";

type SeriesDetailState = {
  isLoading: boolean;
  error: string | null;
  data: XtreamSeriesInfo | null;
};

function extractReleaseYear(releaseDate?: string): string | null {
  if (!releaseDate || releaseDate.trim() === "") return null;
  const match = releaseDate.match(/^(\d{4})/);
  return match ? match[1] : null;
}

function parseDurationLabel(duration?: string, durationSecs?: number): string | null {
  if (duration && duration.trim() !== "") return duration.trim();
  if (!durationSecs || durationSecs <= 0) return null;
  const hours = Math.floor(durationSecs / 3600);
  const minutes = Math.floor((durationSecs % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}t ${minutes}m`;
  if (hours > 0) return `${hours}t`;
  return `${minutes}m`;
}

function episodeTitle(episode: XtreamEpisode): string {
  if (episode.title && episode.title.trim() !== "") return episode.title;
  return `Avsnitt ${episode.episode_num}`;
}

function episodeLabel(episode: XtreamEpisode): string {
  const seasonPadded = String(episode.season).padStart(2, "0");
  const episodeNum = Number(episode.episode_num);
  const episodePadded = Number.isFinite(episodeNum)
    ? String(episodeNum).padStart(2, "0")
    : episode.episode_num;
  return `S${seasonPadded}E${episodePadded}`;
}

function seasonDisplayName(seasonNumber: number, seasons: XtreamSeason[]): string {
  const matching = seasons.find((s) => s.season_number === seasonNumber);
  if (matching?.name && matching.name.trim() !== "") return matching.name;
  return `Säsong ${seasonNumber}`;
}

function EpisodeThumbnail({
  imageUrl,
}: {
  imageUrl: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = imageUrl !== "" && !hasImageError;

  return (
    <div className="h-20 w-40 shrink-0 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800">
      {showImage ? (
        <img
          src={imageUrl}
          alt="Episode thumbnail"
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => {
            setHasImageError(true);
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-700/60 text-zinc-300">
          <Play size={18} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export default function SeriesDetailPage() {
  const router = useRouter();
  const { seriesId, categoryId } = router.query;

  const parsedSeriesId = useMemo(() => {
    if (typeof seriesId !== "string") return null;
    const parsed = Number(seriesId);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }, [seriesId]);
  const categoryIdValue = useMemo(
    () => (typeof categoryId === "string" && categoryId.trim() !== "" ? categoryId : null),
    [categoryId]
  );

  const [state, setState] = useState<SeriesDetailState>({
    isLoading: true,
    error: null,
    data: null,
  });
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const [hasBackdropError, setHasBackdropError] = useState(false);
  const [hasPosterError, setHasPosterError] = useState(false);

  const backHref = categoryIdValue
    ? `/series?categoryId=${encodeURIComponent(categoryIdValue)}`
    : "/series";

  useEffect(() => {
    if (!router.isReady) return;
    if (Array.isArray(seriesId) || parsedSeriesId == null) {
      setState({
        isLoading: false,
        error: "Ogiltigt serie-id i URL.",
        data: null,
      });
      return;
    }

    const stored = loadPlaylist();
    if (!stored) {
      void router.replace("/");
      return;
    }

    const normalizedCredentials: XtreamCredentials = {
      serverUrl: stored.serverUrl.trim(),
      username: stored.username.trim(),
      password: stored.password,
    };

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    setHasBackdropError(false);
    setHasPosterError(false);

    const fetchSeriesInfo = async () => {
      try {
        const response = await fetch("/api/xtream/series-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...normalizedCredentials,
            seriesId: parsedSeriesId,
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
              data: null,
            });
          }
          return;
        }

        if (!data || typeof data !== "object" || Array.isArray(data)) {
          if (!cancelled) {
            setState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              data: null,
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            data: data as XtreamSeriesInfo,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta serieinformation.",
            data: null,
          });
        }
      }
    };

    void fetchSeriesInfo();
    return () => {
      cancelled = true;
    };
  }, [router, seriesId, parsedSeriesId]);

  const info = state.data?.info;
  const seasons = state.data?.seasons ?? [];
  const episodesBySeason = state.data?.episodes ?? {};
  const availableSeasons = useMemo(
    () =>
      Object.keys(episodesBySeason)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b),
    [episodesBySeason]
  );

  useEffect(() => {
    if (availableSeasons.length === 0) {
      setActiveSeason(null);
      return;
    }
    setActiveSeason(availableSeasons[0]);
  }, [state.data, availableSeasons]);

  const currentSeasonEpisodes =
    activeSeason != null ? episodesBySeason[String(activeSeason)] ?? [] : [];

  const title = info?.name ?? "Okänd serie";
  const coverUrl = info?.cover?.trim() ? info.cover.trim() : null;
  const backdropUrl =
    info?.backdrop_path && info.backdrop_path.length > 0 && info.backdrop_path[0]?.trim()
      ? info.backdrop_path[0].trim()
      : coverUrl;
  const hasRating = info?.rating && info.rating !== "" && info.rating !== "0";
  const year = extractReleaseYear(info?.releaseDate);
  const metaParts = [
    year,
    info?.genre && info.genre.trim() !== "" ? info.genre : null,
    availableSeasons.length > 0 ? `${availableSeasons.length} säsonger` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="pb-10">
      <section className="relative h-[50vh] min-h-[280px] w-full overflow-hidden">
        {backdropUrl && !hasBackdropError ? (
          <img
            src={backdropUrl}
            alt={`${title} backdrop`}
            className={`h-full w-full object-cover ${coverUrl ? "" : "scale-110 blur-xl"}`}
            onError={() => {
              setHasBackdropError(true);
            }}
          />
        ) : (
          <div
            className={`h-full w-full ${coverUrl && !hasPosterError ? "scale-110 blur-xl" : ""}`}
            style={
              coverUrl && !hasPosterError
                ? {
                    backgroundImage: `url(${coverUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : { backgroundColor: "rgb(39 39 42)" }
            }
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent" />
        <div className="absolute left-4 top-4 z-10">
          <Link
            href={backHref}
            className="inline-flex items-center rounded-lg border border-zinc-500/60 bg-black/25 px-3 py-1.5 text-xs font-medium text-zinc-100 backdrop-blur transition hover:bg-black/45"
          >
            Tillbaka
          </Link>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-20 w-full max-w-6xl px-4 md:-mt-24">
        <div className="space-y-6 rounded-2xl border border-zinc-700 bg-zinc-900/85 p-6 shadow-2xl">
          {state.isLoading && <p className="text-sm text-zinc-300">Laddar...</p>}

          {!state.isLoading && state.error && (
            <div className="space-y-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              <p>{state.error}</p>
              <Link
                href={backHref}
                className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
              >
                Tillbaka
              </Link>
            </div>
          )}

          {!state.isLoading && !state.error && state.data && (
            <>
              <div className="flex flex-col items-start gap-8 md:flex-row">
                <div className="-mt-28 w-full max-w-[250px] md:-mt-36 md:w-[250px]">
                  <div className="aspect-[2/3] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl">
                    {coverUrl && !hasPosterError ? (
                      <img
                        src={coverUrl}
                        alt={`${title} poster`}
                        className="h-full w-full object-cover"
                        onError={() => {
                          setHasPosterError(true);
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-700/60 p-3 text-center text-sm font-medium text-zinc-100">
                        {title}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-4">
                  <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-300">
                    {metaParts.length > 0 ? (
                      <span>{metaParts.join(" · ")}</span>
                    ) : (
                      <span>Metadata saknas</span>
                    )}
                    {hasRating && (
                      <span className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                        {info?.rating} ⭐
                      </span>
                    )}
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">Handling</h2>
                    {info?.plot && info.plot.trim() !== "" ? (
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                        {info.plot}
                      </p>
                    ) : (
                      <p className="mt-1 max-w-3xl text-sm italic text-zinc-400/80">
                        Ingen beskrivning tillgänglig.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-1 text-sm text-zinc-300">
                    {info?.director && info.director.trim() !== "" && (
                      <p>
                        <span className="font-medium text-zinc-100">Regissör:</span>{" "}
                        {info.director}
                      </p>
                    )}
                    {info?.cast && info.cast.trim() !== "" && (
                      <p>
                        <span className="font-medium text-zinc-100">Skådespelare:</span>{" "}
                        {info.cast}
                      </p>
                    )}
                    {info?.releaseDate && info.releaseDate.trim() !== "" && (
                      <p>
                        <span className="font-medium text-zinc-100">Släppt:</span>{" "}
                        {info.releaseDate}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {availableSeasons.length > 0 ? (
                <>
                  <div className="mb-6 flex flex-wrap gap-2">
                    {availableSeasons.map((seasonNumber) => {
                      const isActive = activeSeason === seasonNumber;
                      const episodeCount =
                        episodesBySeason[String(seasonNumber)]?.length ?? 0;
                      return (
                        <button
                          key={seasonNumber}
                          type="button"
                          onClick={() => {
                            setActiveSeason(seasonNumber);
                          }}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                            isActive
                              ? "border-blue-400 bg-blue-500/20 text-blue-100"
                              : "border-zinc-600 bg-zinc-900/40 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                          }`}
                        >
                          {seasonDisplayName(seasonNumber, seasons)}
                          {isActive ? ` (${episodeCount} avsnitt)` : ""}
                        </button>
                      );
                    })}
                  </div>

                  <ul className="space-y-3">
                    {currentSeasonEpisodes.map((episode) => {
                      const thumb = episode.info?.movie_image?.trim()
                        ? episode.info.movie_image.trim()
                        : "";
                      const titleLabel = episodeTitle(episode);
                      const episodePlot = episode.info?.plot?.trim() ?? "";
                      const durationLabel = parseDurationLabel(
                        episode.info?.duration,
                        episode.info?.duration_secs
                      );
                      return (
                        <li key={`${episode.season}-${episode.id}`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (parsedSeriesId == null) return;
                              void router.push(
                                `/series/${parsedSeriesId}/watch/${encodeURIComponent(
                                  episode.id
                                )}`
                              );
                            }}
                            className="flex w-full items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/40 p-3 text-left transition hover:border-zinc-500 hover:bg-zinc-700/50"
                          >
                            <div className="flex h-10 w-[72px] shrink-0 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs font-medium text-zinc-200">
                              {episodeLabel(episode)}
                            </div>
                            <EpisodeThumbnail imageUrl={thumb} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-zinc-100">{titleLabel}</p>
                              {episodePlot !== "" && (
                                <p className="mt-1 line-clamp-2 text-xs text-zinc-300">
                                  {episodePlot}
                                </p>
                              )}
                            </div>
                            {durationLabel && (
                              <div className="shrink-0 text-xs text-zinc-300">
                                {durationLabel}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  Inga avsnitt tillgängliga.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
