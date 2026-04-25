import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { ApiErrorResponse, XtreamCredentials, XtreamVodInfo } from "@/types/xtream";

type MovieDetailState = {
  isLoading: boolean;
  error: string | null;
  data: XtreamVodInfo | null;
  containerExtension: string | null;
};

function parseDurationLabel(duration?: string, durationSecs?: number): string | null {
  if (duration && duration.trim() !== "") return duration.trim();
  if (!durationSecs || durationSecs <= 0) return null;
  const hours = Math.floor(durationSecs / 3600);
  const minutes = Math.floor((durationSecs % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}t ${minutes}m`;
  if (hours > 0) return `${hours}t`;
  return `${minutes}m`;
}

function extractReleaseYear(releasedate?: string): string | null {
  if (!releasedate || releasedate.trim() === "") return null;
  const match = releasedate.match(/^(\d{4})/);
  return match ? match[1] : null;
}

export default function MovieDetailPage() {
  const router = useRouter();
  const { vodId, categoryId } = router.query;

  const parsedVodId = useMemo(() => {
    if (typeof vodId !== "string") return null;
    const parsed = Number(vodId);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }, [vodId]);
  const categoryIdValue = useMemo(
    () => (typeof categoryId === "string" && categoryId.trim() !== "" ? categoryId : null),
    [categoryId]
  );

  const [state, setState] = useState<MovieDetailState>({
    isLoading: true,
    error: null,
    data: null,
    containerExtension: null,
  });
  const [hasBackdropError, setHasBackdropError] = useState(false);
  const [hasPosterError, setHasPosterError] = useState(false);

  const backHref = categoryIdValue
    ? `/movies?categoryId=${encodeURIComponent(categoryIdValue)}`
    : "/movies";

  useEffect(() => {
    if (!router.isReady) return;
    if (Array.isArray(vodId) || parsedVodId == null) {
      setState({
        isLoading: false,
        error: "Ogiltigt film-id i URL.",
        data: null,
        containerExtension: null,
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
    setHasBackdropError(false);
    setHasPosterError(false);

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const fetchMovieInfo = async () => {
      try {
        const response = await fetch("/api/xtream/vod-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...normalizedCredentials,
            vodId: parsedVodId,
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
              containerExtension: null,
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
              containerExtension: null,
            });
          }
          return;
        }

        const parsedData = data as XtreamVodInfo;
        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            data: parsedData,
            containerExtension: parsedData.movie_data?.container_extension ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta filminformation.",
            data: null,
            containerExtension: null,
          });
        }
      }
    };

    void fetchMovieInfo();
    return () => {
      cancelled = true;
    };
  }, [router, vodId, parsedVodId]);

  const info = state.data?.info;
  const movieData = state.data?.movie_data;
  const title = movieData?.name ?? "Okänd film";
  const posterUrl = info?.movie_image?.trim() ? info.movie_image.trim() : null;
  const backdropUrl =
    info?.backdrop_path && info.backdrop_path.length > 0 && info.backdrop_path[0]?.trim()
      ? info.backdrop_path[0].trim()
      : posterUrl;
  const hasRating = info?.rating && info.rating !== "" && info.rating !== "0";
  const year = extractReleaseYear(info?.releasedate);
  const durationLabel = parseDurationLabel(info?.duration, info?.duration_secs);

  const metaParts = [
    year,
    durationLabel,
    info?.genre && info.genre.trim() !== "" ? info.genre : null,
  ].filter(Boolean) as string[];

  return (
    <main className="pb-10">
      <section className="relative h-[50vh] min-h-[280px] w-full overflow-hidden">
        {backdropUrl && !hasBackdropError ? (
          <img
            src={backdropUrl}
            alt={`${title} backdrop`}
            className={`h-full w-full object-cover ${posterUrl ? "" : "scale-110 blur-xl"}`}
            onError={() => {
              setHasBackdropError(true);
            }}
          />
        ) : (
          <div
            className={`h-full w-full ${posterUrl && !hasPosterError ? "scale-110 blur-xl" : ""}`}
            style={
              posterUrl && !hasPosterError
                ? {
                    backgroundImage: `url(${posterUrl})`,
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
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/85 p-6 shadow-2xl">
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
            <div className="flex flex-col items-start gap-8 md:flex-row">
              <div className="-mt-28 w-full max-w-[250px] md:-mt-36 md:w-[250px]">
                <div className="aspect-[2/3] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl">
                  {posterUrl && !hasPosterError ? (
                    <img
                      src={posterUrl}
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
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
                  {parsedVodId != null && (
                    <div className="rounded bg-zinc-950/50">
                      <FavoriteToggle type="movies" id={parsedVodId} name={title} size="md" />
                    </div>
                  )}
                </div>

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

                <button
                  type="button"
                  onClick={() => {
                    if (parsedVodId == null) return;
                    void router.push(`/movies/${parsedVodId}/watch`);
                  }}
                  className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  ▶ Spela film
                </button>

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
                  {info?.country && info.country.trim() !== "" && (
                    <p>
                      <span className="font-medium text-zinc-100">Land:</span>{" "}
                      {info.country}
                    </p>
                  )}
                  {info?.releasedate && info.releasedate.trim() !== "" && (
                    <p>
                      <span className="font-medium text-zinc-100">Släppt:</span>{" "}
                      {info.releasedate}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
