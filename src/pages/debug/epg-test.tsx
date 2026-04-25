import { useEffect, useState } from "react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { XtreamCredentials } from "@/types/xtream";

type EpgTestResponse = {
  status: number;
  contentType: string | null;
  contentLength: string | null;
  bodyPreview: string;
  bodyTotalSize: number;
  looksLikeXmlTv: boolean;
};

const INITIAL_CREDENTIALS: XtreamCredentials = {
  serverUrl: "",
  username: "",
  password: "",
};

export default function EpgTestPage() {
  const [credentials, setCredentials] = useState<XtreamCredentials>(INITIAL_CREDENTIALS);
  const [isLoading, setIsLoading] = useState(false);
  const [resultText, setResultText] = useState<string>("Ingen körning ännu.");

  useEffect(() => {
    const stored = loadPlaylist();
    if (!stored) return;
    setCredentials(stored);
  }, []);

  const testEpgFeed = async () => {
    setIsLoading(true);
    setResultText("Kör test...");
    try {
      const response = await fetch("/api/xtream/test-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data: unknown = await response.json();
      if (!response.ok) {
        setResultText(
          JSON.stringify(
            {
              error: "API-fel",
              status: response.status,
              body: data,
            },
            null,
            2
          )
        );
        return;
      }

      setResultText(JSON.stringify(data as EpgTestResponse, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setResultText(JSON.stringify({ error: "Nätverksfel", message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Debug: EPG-test</h1>

      <div className="space-y-3">
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Server URL"
          value={credentials.serverUrl}
          onChange={(e) =>
            setCredentials((prev) => ({ ...prev, serverUrl: e.target.value }))
          }
        />
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Username"
          value={credentials.username}
          onChange={(e) =>
            setCredentials((prev) => ({ ...prev, username: e.target.value }))
          }
        />
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Password"
          type="password"
          value={credentials.password}
          onChange={(e) =>
            setCredentials((prev) => ({ ...prev, password: e.target.value }))
          }
        />
      </div>

      <button
        className="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        type="button"
        onClick={testEpgFeed}
        disabled={isLoading}
      >
        {isLoading ? "Testar..." : "Testa EPG-feed"}
      </button>

      <pre className="mt-4 overflow-x-auto rounded bg-zinc-900 p-4 text-sm text-zinc-100">
        {resultText}
      </pre>
    </main>
  );
}
