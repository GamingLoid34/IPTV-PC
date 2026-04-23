import { useState, type FormEvent, type ChangeEvent } from "react";
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

  const handleFieldChange = (field: keyof FormState) => {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);

    const credentials: XtreamCredentials = {
      serverUrl: form.serverUrl,
      username: form.username,
      password: form.password,
    };

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
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 text-zinc-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            IPTV-PC
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Lägg till din Xtream-spellista
          </p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <label
              htmlFor="serverUrl"
              className="block text-sm font-medium text-zinc-200"
            >
              Server URL
            </label>
            <input
              id="serverUrl"
              name="serverUrl"
              type="url"
              autoComplete="url"
              placeholder="http://server.example.com"
              value={form.serverUrl}
              onChange={handleFieldChange("serverUrl")}
              disabled={isLoading}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-zinc-200"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={handleFieldChange("username")}
              disabled={isLoading}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-200"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleFieldChange("password")}
              disabled={isLoading}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Ansluter..." : "Anslut"}
          </button>
        </form>

        {isLoading && (
          <p className="text-center text-sm text-zinc-300">Ansluter...</p>
        )}

        {result?.error && (
          <p className="text-center text-sm text-red-400" role="alert">
            {result.error}
          </p>
        )}

        {result?.categories && (
          <div className="space-y-2 text-sm text-zinc-200">
            <p className="text-zinc-400">
              {result.categories.length} kategorier
            </p>
            <ul className="max-h-48 list-inside list-disc space-y-1 overflow-y-auto rounded border border-zinc-700 p-2">
              {result.categories.map((c) => (
                <li key={String(c.category_id)}>{c.category_name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
