import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/router";
import { LoginForm } from "@/components/LoginForm";
import { loadPlaylist, savePlaylist } from "@/lib/playlistStorage";
import type { ApiErrorResponse, XtreamCredentials } from "@/types/xtream";

type FormState = XtreamCredentials;

const initialValues: FormState = {
  serverUrl: "",
  username: "",
  password: "",
};

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialValues);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  useEffect(() => {
    const stored = loadPlaylist();
    if (stored) {
      setForm(stored);
      void router.replace("/live");
    }
    setHasLoadedFromStorage(true);
  }, [router]);

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

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/xtream/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const errBody = data as ApiErrorResponse;
        setError(
          typeof errBody?.error === "string" ? errBody.error : "Ett fel uppstod."
        );
        return;
      }

      if (!Array.isArray(data)) {
        setError("Oväntat svar från servern.");
        return;
      }

      savePlaylist(credentials);
      void router.push("/live");
    } catch {
      setError("Nätverksfel: kunde inte kontakta servern.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 text-zinc-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            IPTV-PC
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Lägg till din Xtream-spellista</p>
        </div>

        {!hasLoadedFromStorage && (
          <p className="text-center text-sm text-zinc-300">Laddar...</p>
        )}

        {hasLoadedFromStorage && (
          <LoginForm
            form={form}
            isLoading={isLoading}
            error={error}
            onFieldChange={handleFieldChange}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </div>
  );
}
