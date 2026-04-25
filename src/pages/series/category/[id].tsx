import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { ApiErrorResponse, XtreamSeries } from "@/types/xtream";

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

export default function SeriesCategoryPage() {
  const router = useRouter();
  const { id } = router.query;

  const categoryId = useMemo(() => {
    if (typeof id === "string") return id;
    return null;
  }, [id]);

  const [state, setState] = useState<SeriesState>({
    isLoading: true,
    error: null,
    series: [],
  });

  useEffect(() => {
    if (!router.isReady) return;

    if (Array.isArray(id)) {
      setState({
        isLoading: false,
        error: "Ogiltig kategori i URL.",
        series: [],
      });
      return;
    }

    if (!categoryId || categoryId.trim() === "") {
      setState({
        isLoading: false,
        error: "Kategori saknas i URL.",
        series: [],
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

    const fetchSeries = async () => {
      try {
        const response = await fetch("/api/xtream/series", {
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
              series: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              series: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            series: data as XtreamSeries[],
          });
        }
      } catch {
        if (!cancelled) {
          setState({
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
  }, [router, id, categoryId]);

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-7xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/series"
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
                void router.replace("/series");
              }}
              className="rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Tillbaka
            </button>
          </div>
        )}

        {!state.isLoading && !state.error && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {state.series.map((series) => (
              <li key={series.series_id}>
                <button
                  type="button"
                  className="group w-full text-left"
                  onClick={() => {
                    // Xtream uses series_id for series entities (not stream_id).
                    console.log("series_id:", series.series_id);
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
        )}

        {!state.isLoading && !state.error && state.series.length === 0 && (
          <p className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
            Inga serier hittades i den här kategorin.
          </p>
        )}
      </div>
    </main>
  );
}
