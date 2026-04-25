import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CategoryList } from "@/components/CategoryList";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
} from "@/types/xtream";

type CategoriesState = {
  isLoading: boolean;
  error: string | null;
  categories: XtreamCategory[];
  serverUrl: string;
};

export default function MoviesIndexPage() {
  const router = useRouter();
  const [state, setState] = useState<CategoriesState>({
    isLoading: true,
    error: null,
    categories: [],
    serverUrl: "",
  });

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
        serverUrl: normalizedCredentials.serverUrl,
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
          setState((prev) => ({
            ...prev,
            isLoading: false,
            categories: data as XtreamCategory[],
          }));
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

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Filmkategorier</h1>
          <p className="mt-1 text-sm text-zinc-400">Välj en kategori för att visa filmer.</p>
        </div>

        {state.isLoading && <p className="text-sm text-zinc-300">Laddar...</p>}

        {!state.isLoading && state.error && (
          <div className="space-y-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <p>{state.error}</p>
            <button
              type="button"
              onClick={() => {
                void router.replace("/");
              }}
              className="rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Tillbaka
            </button>
          </div>
        )}

        {!state.isLoading && !state.error && (
          <CategoryList
            serverUrl={state.serverUrl}
            categories={state.categories}
            hrefBasePath="/movies/category"
            countLabel="VOD-kategorier"
          />
        )}
      </div>
    </main>
  );
}
