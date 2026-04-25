import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CategorySplitView } from "@/components/CategorySplitView";
import { TvGuide } from "@/components/TvGuide";
import { loadPlaylist } from "@/lib/playlistStorage";
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

  const selectCategory = (id: string) => {
    void router.push(
      { pathname: router.pathname, query: { ...router.query, categoryId: id } },
      undefined,
      { shallow: true, scroll: false }
    );
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
            <>
              {streamsState.streams.length === 0 ? (
                <p className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  Inga kanaler hittades i den här kategorin.
                </p>
              ) : (
                <TvGuide
                  channels={streamsState.streams}
                  categoryId={selectedCategoryId ?? ""}
                />
              )}
            </>
          )}
        </CategorySplitView>
      )}
    </main>
  );
}
