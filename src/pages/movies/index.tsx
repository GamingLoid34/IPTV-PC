import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CategorySplitView } from "@/components/CategorySplitView";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
  XtreamVodStream,
} from "@/types/xtream";

type CategoriesState = {
  isLoading: boolean;
  error: string | null;
  categories: XtreamCategory[];
};

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

export default function MoviesIndexPage() {
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
  const [moviesState, setMoviesState] = useState<MoviesState>({
    isLoading: false,
    error: null,
    movies: [],
  });

  const selectCategory = (id: string) => {
    void router.push(`/movies?categoryId=${encodeURIComponent(id)}`, undefined, {
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
        const response = await fetch("/api/xtream/vod-categories", {
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
      setMoviesState({ isLoading: false, error: null, movies: [] });
      return;
    }

    const credentials = loadPlaylist();
    if (!credentials) return;

    let cancelled = false;
    setMoviesState({ isLoading: true, error: null, movies: [] });

    const fetchMovies = async () => {
      try {
        const response = await fetch("/api/xtream/vod-streams", {
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
            setMoviesState({
              isLoading: false,
              error: typeof err?.error === "string" ? err.error : "Ett fel uppstod.",
              movies: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setMoviesState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              movies: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setMoviesState({
            isLoading: false,
            error: null,
            movies: data as XtreamVodStream[],
          });
        }
      } catch {
        if (!cancelled) {
          setMoviesState({
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
  }, [selectedCategoryId]);

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
          {moviesState.isLoading && <p className="text-sm text-zinc-300">Laddar filmer...</p>}
          {!moviesState.isLoading && moviesState.error && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              {moviesState.error}
            </p>
          )}
          {!moviesState.isLoading && !moviesState.error && (
            <>
              <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {moviesState.movies.map((movie) => (
                  <li key={movie.stream_id}>
                    <button
                      type="button"
                      className="group w-full text-left"
                      onClick={() => {
                        void router.push(
                          `/movies/${movie.stream_id}?categoryId=${encodeURIComponent(
                            selectedCategoryId ?? ""
                          )}`
                        );
                      }}
                    >
                      <div className="relative transition duration-200 group-hover:scale-105">
                        <MoviePoster movieName={movie.name} streamIcon={movie.stream_icon} />
                        <div className="absolute right-2 top-2 rounded bg-black/55">
                          <FavoriteToggle type="movies" id={movie.stream_id} name={movie.name} />
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-200">{movie.name}</p>
                    </button>
                  </li>
                ))}
              </ul>

              {moviesState.movies.length === 0 && (
                <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  Inga filmer hittades i den här kategorin.
                </p>
              )}
            </>
          )}
        </CategorySplitView>
      )}
    </main>
  );
}
