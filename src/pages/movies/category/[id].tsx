import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { ApiErrorResponse, XtreamVodStream } from "@/types/xtream";

type MoviesState = {
  isLoading: boolean;
  error: string | null;
  movies: XtreamVodStream[];
};

function MoviePoster({
  movieName,
  streamIcon,
}: {
  movieName: string;
  streamIcon: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = streamIcon.trim() !== "" && !hasImageError;

  return (
    <div className="aspect-[2/3] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
      {showImage ? (
        <img
          src={streamIcon}
          alt={`${movieName} poster`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => {
            setHasImageError(true);
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-700/60 p-3 text-center text-xs font-medium text-zinc-100">
          {movieName}
        </div>
      )}
    </div>
  );
}

export default function MoviesCategoryPage() {
  const router = useRouter();
  const { id } = router.query;

  const categoryId = useMemo(() => {
    if (typeof id === "string") return id;
    return null;
  }, [id]);

  const [state, setState] = useState<MoviesState>({
    isLoading: true,
    error: null,
    movies: [],
  });

  useEffect(() => {
    if (!router.isReady) return;

    if (Array.isArray(id)) {
      setState({
        isLoading: false,
        error: "Ogiltig kategori i URL.",
        movies: [],
      });
      return;
    }

    if (!categoryId || categoryId.trim() === "") {
      setState({
        isLoading: false,
        error: "Kategori saknas i URL.",
        movies: [],
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

    const fetchMovies = async () => {
      try {
        const response = await fetch("/api/xtream/vod-streams", {
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
              movies: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              movies: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            movies: data as XtreamVodStream[],
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta filmer.",
            movies: [],
          });
        }
      }
    };

    void fetchMovies();

    return () => {
      cancelled = true;
    };
  }, [router, id, categoryId]);

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-7xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/movies"
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
                void router.replace("/movies");
              }}
              className="rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Tillbaka
            </button>
          </div>
        )}

        {!state.isLoading && !state.error && (
          <>
            {/* TODO: If very large categories feel slow, add list virtualization. */}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {state.movies.map((movie) => (
                <li key={movie.stream_id}>
                  <button
                    type="button"
                    className="group w-full text-left"
                    onClick={() => {
                      console.log("vod_id:", movie.stream_id);
                    }}
                  >
                    <div className="transition duration-200 group-hover:scale-105">
                      <MoviePoster
                        movieName={movie.name}
                        streamIcon={movie.stream_icon}
                      />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-zinc-200">
                      {movie.name}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            {state.movies.length === 0 && (
              <p className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                Inga filmer hittades i den här kategorin.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
