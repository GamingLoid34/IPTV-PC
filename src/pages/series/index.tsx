import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CategorySplitView } from "@/components/CategorySplitView";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamSeries,
  XtreamSeriesCategory,
} from "@/types/xtream";

type CategoriesState = {
  isLoading: boolean;
  error: string | null;
  categories: XtreamSeriesCategory[];
};

type SeriesState = {
  isLoading: boolean;
  error: string | null;
  series: XtreamSeries[];
};

function SeriesPoster({
  seriesName,
  cover,
}: {
  seriesName: string;
  cover: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = cover.trim() !== "" && !hasImageError;

  return (
    <div className="aspect-[2/3] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
      {showImage ? (
        <img
          src={cover}
          alt={`${seriesName} poster`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => {
            setHasImageError(true);
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-700/60 p-3 text-center text-xs font-medium text-zinc-100">
          {seriesName}
        </div>
      )}
    </div>
  );
}

export default function SeriesIndexPage() {
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
  const [seriesState, setSeriesState] = useState<SeriesState>({
    isLoading: false,
    error: null,
    series: [],
  });

  const selectCategory = (id: string) => {
    void router.push(`/series?categoryId=${encodeURIComponent(id)}`, undefined, {
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
        const response = await fetch("/api/xtream/series-categories", {
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
            categories: data as XtreamSeriesCategory[],
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
      setSeriesState({ isLoading: false, error: null, series: [] });
      return;
    }

    const credentials = loadPlaylist();
    if (!credentials) return;

    let cancelled = false;
    setSeriesState({ isLoading: true, error: null, series: [] });

    const fetchSeries = async () => {
      try {
        const response = await fetch("/api/xtream/series", {
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
            setSeriesState({
              isLoading: false,
              error: typeof err?.error === "string" ? err.error : "Ett fel uppstod.",
              series: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setSeriesState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              series: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setSeriesState({
            isLoading: false,
            error: null,
            series: data as XtreamSeries[],
          });
        }
      } catch {
        if (!cancelled) {
          setSeriesState({
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta serier.",
            series: [],
          });
        }
      }
    };

    void fetchSeries();
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
          {seriesState.isLoading && <p className="text-sm text-zinc-300">Laddar serier...</p>}
          {!seriesState.isLoading && seriesState.error && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              {seriesState.error}
            </p>
          )}
          {!seriesState.isLoading && !seriesState.error && (
            <>
              <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {seriesState.series.map((series) => (
                  <li key={series.series_id}>
                    <button
                      type="button"
                      className="group w-full text-left"
                      onClick={() => {
                        void router.push(
                          `/series/${series.series_id}?categoryId=${encodeURIComponent(
                            selectedCategoryId ?? ""
                          )}`
                        );
                      }}
                    >
                      <div className="transition duration-200 group-hover:scale-105">
                        <SeriesPoster seriesName={series.name} cover={series.cover} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-200">{series.name}</p>
                    </button>
                  </li>
                ))}
              </ul>
              {seriesState.series.length === 0 && (
                <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  Inga serier hittades i den här kategorin.
                </p>
              )}
            </>
          )}
        </CategorySplitView>
      )}
    </main>
  );
}
