import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { LoginForm } from "@/components/LoginForm";
import { CategoryList } from "@/components/CategoryList";
import { loadPlaylist, savePlaylist, clearPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
} from "@/types/xtream";

type FormState = XtreamCredentials;

const initialValues: FormState = {
  serverUrl: "",
  username: "",
  password: "",
};

type SubmitResult = {
  categories?: XtreamCategory[];
  error?: string;
} | null;

export default function Home() {
  const [form, setForm] = useState<FormState>(initialValues);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SubmitResult>(null);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  const fetchCategories = useCallback(
    async (
      credentials: XtreamCredentials,
      options: { persistOnSuccess?: boolean } = {}
    ) => {
      setIsLoading(true);
      setResult(null);
      try {
        const response = await fetch("/api/xtream/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });

        const data: unknown = await response.json();

        if (response.ok) {
          if (Array.isArray(data)) {
            setResult({ categories: data as XtreamCategory[] });
            if (options.persistOnSuccess) {
              savePlaylist(credentials);
            }
          } else {
            setResult({ error: "Oväntat svar från servern." });
          }
          return;
        }

        const errBody = data as ApiErrorResponse;
        setResult({
          error:
            typeof errBody?.error === "string"
              ? errBody.error
              : "Ett fel uppstod.",
        });
      } catch {
        setResult({
          error: "Nätverksfel: kunde inte kontakta servern.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const stored = loadPlaylist();
      if (stored) {
        setForm(stored);
        await fetchCategories(stored, { persistOnSuccess: false });
      }
      if (!cancelled) {
        setHasLoadedFromStorage(true);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [fetchCategories]);

  const handleFieldChange = (field: keyof FormState) => {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const credentials: XtreamCredentials = {
      serverUrl: form.serverUrl,
      username: form.username,
      password: form.password,
    };
    await fetchCategories(credentials, { persistOnSuccess: true });
  };

  const handleForget = () => {
    clearPlaylist();
    setForm(initialValues);
    setResult(null);
  };

  const showCategoryView = hasLoadedFromStorage && Boolean(result?.categories);
  const formError = result?.error ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 text-zinc-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            IPTV-PC
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {showCategoryView ? "Spellista" : "Lägg till din Xtream-spellista"}
          </p>
        </div>

        {!hasLoadedFromStorage && (
          <p className="text-center text-sm text-zinc-300">Laddar...</p>
        )}

        {hasLoadedFromStorage && showCategoryView && result?.categories && (
          <CategoryList
            serverUrl={form.serverUrl}
            categories={result.categories}
            onForget={handleForget}
          />
        )}

        {hasLoadedFromStorage && !showCategoryView && (
          <LoginForm
            form={form}
            isLoading={isLoading}
            error={formError}
            onFieldChange={handleFieldChange}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </div>
  );
}
