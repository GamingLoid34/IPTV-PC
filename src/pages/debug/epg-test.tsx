import { useEffect, useState } from "react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { XtreamCredentials } from "@/types/xtream";
import type { EpgManifest, EpgProgramme, SearchIndexEntry } from "@/types/epg";

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
  const [isTestingFeed, setIsTestingFeed] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingChannel, setIsLoadingChannel] = useState(false);
  const [feedResultText, setFeedResultText] = useState<string>("Ingen körning ännu.");
  const [cacheResultText, setCacheResultText] = useState<string>("Ingen cache-operation ännu.");
  const [searchQuery, setSearchQuery] = useState("manchester united");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchResults, setSearchResults] = useState<SearchIndexEntry[]>([]);
  const [channelId, setChannelId] = useState("");
  const [channelProgrammes, setChannelProgrammes] = useState<EpgProgramme[]>([]);

  useEffect(() => {
    const stored = loadPlaylist();
    if (!stored) return;
    setCredentials(stored);
  }, []);

  const testEpgFeed = async () => {
    setIsTestingFeed(true);
    setFeedResultText("Kör test...");
    try {
      const response = await fetch("/api/xtream/test-epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data: unknown = await response.json();
      if (!response.ok) {
        setFeedResultText(
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

      setFeedResultText(JSON.stringify(data as EpgTestResponse, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setFeedResultText(JSON.stringify({ error: "Nätverksfel", message }, null, 2));
    } finally {
      setIsTestingFeed(false);
    }
  };

  const refreshCache = async () => {
    setIsRefreshingCache(true);
    setCacheResultText("Hämtar och parsar... det här tar 30-60 sekunder.");
    try {
      const response = await fetch("/api/epg/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setCacheResultText(
          JSON.stringify({ error: "Refresh misslyckades", status: response.status, data }, null, 2)
        );
        return;
      }
      setCacheResultText(JSON.stringify(data as EpgManifest, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setCacheResultText(JSON.stringify({ error: "Nätverksfel", message }, null, 2));
    } finally {
      setIsRefreshingCache(false);
    }
  };

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch("/api/epg/status");
      const data: unknown = await response.json();
      setCacheResultText(JSON.stringify(data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setCacheResultText(JSON.stringify({ error: "Nätverksfel", message }, null, 2));
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const runSearch = async () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (searchCategory.trim()) {
        params.set("categories", searchCategory.trim());
      }
      const response = await fetch(`/api/epg/search?${params.toString()}`);
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        setSearchResults([]);
        return;
      }
      setSearchResults(data as SearchIndexEntry[]);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const loadChannelProgrammes = async () => {
    setIsLoadingChannel(true);
    try {
      const params = new URLSearchParams({ channelId });
      const response = await fetch(`/api/epg/channel?${params.toString()}`);
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        setChannelProgrammes([]);
        return;
      }
      setChannelProgrammes(data as EpgProgramme[]);
    } catch {
      setChannelProgrammes([]);
    } finally {
      setIsLoadingChannel(false);
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

      <section className="mt-4">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          type="button"
          onClick={testEpgFeed}
          disabled={isTestingFeed}
        >
          {isTestingFeed ? "Testar..." : "Testa EPG-feed"}
        </button>

        <pre className="mt-3 overflow-x-auto rounded bg-zinc-900 p-4 text-sm text-zinc-100">
          {feedResultText}
        </pre>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Cache management</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={refreshCache}
            disabled={isRefreshingCache}
          >
            {isRefreshingCache ? "Hämtar och parsar..." : "Hämta + bygg cache"}
          </button>
          <button
            className="rounded bg-zinc-700 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={loadStatus}
            disabled={isLoadingStatus}
          >
            {isLoadingStatus ? "Laddar..." : "Visa cache-status"}
          </button>
        </div>

        <pre className="mt-3 overflow-x-auto rounded bg-zinc-900 p-4 text-sm text-zinc-100">
          {cacheResultText}
        </pre>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Sökning</h2>
        <div className="mt-3 space-y-3">
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="Sökfråga"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="Category (valfritt)"
            value={searchCategory}
            onChange={(e) => setSearchCategory(e.target.value)}
          />
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={runSearch}
            disabled={isSearching}
          >
            {isSearching ? "Söker..." : "Sök"}
          </button>
        </div>

        <p className="mt-3 text-sm">Träffar: {searchResults.length}</p>
        <ul className="mt-2 space-y-2 text-sm">
          {searchResults.slice(0, 20).map((entry) => (
            <li key={`${entry.programmeRef.channelId}-${entry.programmeRef.start}`}>
              <div className="font-medium">{entry.searchText || "(tom söktext)"}</div>
              <div className="text-zinc-300">
                {new Date(entry.startMs).toISOString()} - {new Date(entry.stopMs).toISOString()}
              </div>
              <div className="text-zinc-400">{entry.categories.join(", ") || "-"}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Kanal</h2>
        <div className="mt-3 space-y-3">
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="channelId"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
          <button
            className="rounded bg-purple-600 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={loadChannelProgrammes}
            disabled={isLoadingChannel}
          >
            {isLoadingChannel ? "Hämtar..." : "Hämta program"}
          </button>
        </div>

        <p className="mt-3 text-sm">Program: {channelProgrammes.length}</p>
        <ul className="mt-2 space-y-2 text-sm">
          {channelProgrammes.slice(0, 20).map((programme) => (
            <li key={`${programme.channelId}-${programme.start}`}>
              <div className="font-medium">{programme.title}</div>
              <div className="text-zinc-300">
                {programme.start} - {programme.stop}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
