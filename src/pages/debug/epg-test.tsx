import { useEffect, useState } from "react";
import { formatTimeRange } from "@/lib/epg/formatTime";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
} from "@/types/xtream";
import type {
  EpgManifest,
  EpgProgramme,
  SearchIndexEntry,
  SportEvent,
  SportType,
} from "@/types/epg";

type EpgTestResponse = {
  status: number;
  contentType: string | null;
  contentLength: string | null;
  bodyPreview: string;
  bodyTotalSize: number;
  looksLikeXmlTv: boolean;
};

type NormalizationRow = {
  input: string;
  output: string;
  country: string | null;
};

type MappingItem = {
  stream_id: number;
  xtreamName: string;
  epgChannel: { id: string; displayName: string; icon?: string } | null;
};

type MappingResponse = {
  mappings: MappingItem[];
  statistics: {
    totalChannels: number;
    mappedCount: number;
    unmappedCount: number;
    mappedPercentage: number;
  };
};

type MappingMode = "4k" | "sweden" | "all";
type SportDayOption = "today" | "tomorrow" | "dayAfterTomorrow";
type SportChannelDiagnostic = {
  channelId: string;
  channelName: string;
  strictSportType: SportType | null;
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
  const [normalizationRows, setNormalizationRows] = useState<NormalizationRow[]>([]);
  const [isLoadingNormalization, setIsLoadingNormalization] = useState(false);
  const [isMappingChannels, setIsMappingChannels] = useState(false);
  const [mappingProgress, setMappingProgress] = useState("Ingen mapping-körning ännu.");
  const [mappingStats, setMappingStats] = useState<MappingResponse["statistics"] | null>(null);
  const [mappedPreview, setMappedPreview] = useState<MappingItem[]>([]);
  const [unmappedPreview, setUnmappedPreview] = useState<MappingItem[]>([]);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [sportDay, setSportDay] = useState<SportDayOption>("today");
  const [sportTypeFilters, setSportTypeFilters] = useState<SportType[]>([]);
  const [isLoadingSportEvents, setIsLoadingSportEvents] = useState(false);
  const [sportEvents, setSportEvents] = useState<SportEvent[]>([]);
  const [sportEventsError, setSportEventsError] = useState<string | null>(null);
  const [isLoadingSportChannels, setIsLoadingSportChannels] = useState(false);
  const [sportChannels, setSportChannels] = useState<SportChannelDiagnostic[]>([]);
  const [sportChannelsError, setSportChannelsError] = useState<string | null>(null);
  const [programmeTestTitle, setProgrammeTestTitle] = useState("");
  const [programmeTestDescription, setProgrammeTestDescription] = useState("");
  const [programmeTestResult, setProgrammeTestResult] = useState<SportType | null | undefined>(
    undefined
  );
  const [isTestingProgramme, setIsTestingProgramme] = useState(false);

  const sportTypeOptions: { id: SportType; label: string }[] = [
    { id: "football", label: "Football" },
    { id: "motorsport", label: "Motorsport" },
    { id: "cycling", label: "Cycling" },
    { id: "winter", label: "Winter" },
    { id: "tennis", label: "Tennis" },
    { id: "other", label: "Other" },
  ];

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

  const runNormalizationTest = async () => {
    setIsLoadingNormalization(true);
    try {
      const response = await fetch("/api/epg/normalization-test");
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        setNormalizationRows([]);
        return;
      }
      setNormalizationRows(data as NormalizationRow[]);
    } catch {
      setNormalizationRows([]);
    } finally {
      setIsLoadingNormalization(false);
    }
  };

  const mapChannelsByMode = async (mode: MappingMode) => {
    setIsMappingChannels(true);
    setMappingError(null);
    setMappingStats(null);
    setMappedPreview([]);
    setUnmappedPreview([]);
    setMappingProgress("Kontrollerar EPG-cache...");

    try {
      const statusResponse = await fetch("/api/epg/status");
      const statusBody: unknown = await statusResponse.json();
      if (!statusResponse.ok) {
        setMappingError("Kunde inte läsa EPG-status.");
        return;
      }
      if ("cached" in (statusBody as { cached?: boolean })) {
        setMappingError("EPG-cache saknas. Kör först 'Hämta + bygg cache'.");
        return;
      }

      setMappingProgress("Hämtar live-kategorier...");
      const categoriesResponse = await fetch("/api/xtream/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const categoriesBody: unknown = await categoriesResponse.json();
      if (!categoriesResponse.ok || !Array.isArray(categoriesBody)) {
        const err = categoriesBody as ApiErrorResponse;
        setMappingError(err?.error ?? "Kunde inte hämta kategorier.");
        return;
      }

      const allCategories = categoriesBody as XtreamCategory[];
      const selectedCategories =
        mode === "4k"
          ? allCategories.slice(0, 5)
          : mode === "sweden"
            ? allCategories
                .filter((c) => /(^|\b)(se|sweden|sverige)(\b|$)/i.test(c.category_name))
                .slice(0, 3)
            : allCategories;

      if (selectedCategories.length === 0) {
        setMappingError("Inga kategorier matchade testvalet.");
        return;
      }

      const maxChannels = mode === "all" ? 2000 : 200;
      const collected: XtreamLiveStream[] = [];

      for (let i = 0; i < selectedCategories.length; i += 1) {
        const category = selectedCategories[i];
        setMappingProgress(
          `Hämtar kategori ${i + 1}/${selectedCategories.length}: ${category.category_name}`
        );
        const streamsResponse = await fetch("/api/xtream/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...credentials,
            categoryId: category.category_id,
          }),
        });
        const streamsBody: unknown = await streamsResponse.json();
        if (!streamsResponse.ok || !Array.isArray(streamsBody)) {
          continue;
        }

        for (const stream of streamsBody as XtreamLiveStream[]) {
          collected.push(stream);
          if (collected.length >= maxChannels) {
            break;
          }
        }
        if (collected.length >= maxChannels) {
          break;
        }
      }

      const deduped = Array.from(
        new Map(collected.map((stream) => [stream.stream_id, stream])).values()
      ).slice(0, maxChannels);

      setMappingProgress(
        `Skickar subset till mapping endpoint (${deduped.length} kanaler)...`
      );
      const mappingResponse = await fetch("/api/epg/map-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xtreamChannels: deduped.map((stream) => ({
            stream_id: stream.stream_id,
            name: stream.name,
          })),
        }),
      });
      const mappingBody: unknown = await mappingResponse.json();
      if (!mappingResponse.ok) {
        const err = mappingBody as ApiErrorResponse;
        setMappingError(err?.error ?? "Mapping misslyckades.");
        return;
      }

      const parsed = mappingBody as MappingResponse;
      setMappingStats(parsed.statistics);
      setMappedPreview(parsed.mappings.filter((m) => m.epgChannel).slice(0, 30));
      setUnmappedPreview(parsed.mappings.filter((m) => !m.epgChannel).slice(0, 30));
      const modeLabel =
        mode === "4k"
          ? "Test: 4K-kategorier"
          : mode === "sweden"
            ? "Test: svenska kanaler"
            : "Test: alla kanaler";
      setMappingProgress(`${modeLabel} klar. Delmängd analyserad (${deduped.length} kanaler).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setMappingError(message);
    } finally {
      setIsMappingChannels(false);
    }
  };

  const runSportEventsQuery = async () => {
    setIsLoadingSportEvents(true);
    setSportEventsError(null);
    setSportEvents([]);

    try {
      const today = new Date();
      const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const offset =
        sportDay === "today" ? 0 : sportDay === "tomorrow" ? 1 : 2;
      const from = new Date(dayStart.getTime() + offset * 24 * 60 * 60 * 1000);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

      const params = new URLSearchParams({
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        limit: "500",
      });
      if (sportTypeFilters.length > 0) {
        params.set("sportTypes", sportTypeFilters.join(","));
      }

      const response = await fetch(`/api/epg/sport-events?${params.toString()}`);
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        const err = data as ApiErrorResponse;
        setSportEventsError(err?.error ?? "Kunde inte hämta sport-events.");
        return;
      }

      setSportEvents(data as SportEvent[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setSportEventsError(message);
    } finally {
      setIsLoadingSportEvents(false);
    }
  };

  const toggleSportTypeFilter = (type: SportType) => {
    setSportTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type]
    );
  };

  const loadSportChannels = async () => {
    setIsLoadingSportChannels(true);
    setSportChannelsError(null);
    setSportChannels([]);
    try {
      const response = await fetch("/api/epg/sport-channels");
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        const err = data as ApiErrorResponse;
        setSportChannelsError(err?.error ?? "Kunde inte hämta sport-kanaler.");
        return;
      }
      setSportChannels(data as SportChannelDiagnostic[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      setSportChannelsError(message);
    } finally {
      setIsLoadingSportChannels(false);
    }
  };

  const strictTypeCounts = sportChannels.reduce<Record<string, number>>((acc, entry) => {
    if (!entry.strictSportType) return acc;
    acc[entry.strictSportType] = (acc[entry.strictSportType] ?? 0) + 1;
    return acc;
  }, {});
  const genericChannelCount = sportChannels.filter((entry) => entry.strictSportType === null).length;

  const testProgrammeClassification = async () => {
    setIsTestingProgramme(true);
    setProgrammeTestResult(undefined);
    try {
      const response = await fetch("/api/epg/sport-programme-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: programmeTestTitle,
          description: programmeTestDescription,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object") {
        setProgrammeTestResult(undefined);
        return;
      }
      setProgrammeTestResult((data as { sportType?: SportType | null }).sportType ?? null);
    } catch {
      setProgrammeTestResult(undefined);
    } finally {
      setIsTestingProgramme(false);
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

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Channel mapping diagnostics</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Testmappning kan köras på olika urval. Resultatet visar total/mapped/unmapped och
          första 30 unmapped.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={runNormalizationTest}
            disabled={isLoadingNormalization}
          >
            {isLoadingNormalization ? "Kör..." : "Testa normalisering"}
          </button>
          <button
            className="rounded bg-orange-600 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={() => {
              void mapChannelsByMode("4k");
            }}
            disabled={isMappingChannels}
          >
            {isMappingChannels ? "Mappar..." : "Test: 4K-kategorier"}
          </button>
          <button
            className="rounded bg-cyan-700 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={() => {
              void mapChannelsByMode("sweden");
            }}
            disabled={isMappingChannels}
          >
            {isMappingChannels ? "Mappar..." : "Test: svenska kanaler"}
          </button>
          <button
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={() => {
              void mapChannelsByMode("all");
            }}
            disabled={isMappingChannels}
          >
            {isMappingChannels ? "Mappar..." : "Test: alla kanaler (kan ta tid)"}
          </button>
        </div>

        <p className="mt-3 text-sm text-zinc-300">{mappingProgress}</p>
        {mappingError && <p className="mt-2 text-sm text-rose-300">{mappingError}</p>}

        {normalizationRows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded border border-zinc-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-3 py-2">Input</th>
                  <th className="px-3 py-2">Output</th>
                  <th className="px-3 py-2">Country</th>
                </tr>
              </thead>
              <tbody>
                {normalizationRows.map((row) => (
                  <tr key={row.input} className="border-t border-zinc-700">
                    <td className="px-3 py-2">{row.input}</td>
                    <td className="px-3 py-2">{row.output}</td>
                    <td className="px-3 py-2">{row.country ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mappingStats && (
          <div className="mt-4 space-y-1 text-sm">
            <p>Total: {mappingStats.totalChannels}</p>
            <p>Mapped: {mappingStats.mappedCount}</p>
            <p>Unmapped: {mappingStats.unmappedCount}</p>
            <p>Mapped %: {mappingStats.mappedPercentage}</p>
          </div>
        )}

        {mappedPreview.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium">Första 30 mapped (med EPG-id)</h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {mappedPreview.map((item) => (
                <li key={`mapped-${item.stream_id}`}>
                  {item.stream_id}: {item.xtreamName}
                  {" -> "}
                  {item.epgChannel?.id ?? "-"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unmappedPreview.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium">Första 30 unmapped</h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {unmappedPreview.map((item) => (
                <li key={item.stream_id}>
                  {item.stream_id}: {item.xtreamName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Sport events</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Diagnostik: börja med "Visa sport-kanaler" för att verifiera kanal-klassificeringen.
        </p>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Dag</span>
            <select
              className="w-full rounded border px-3 py-2 text-black"
              value={sportDay}
              onChange={(e) => setSportDay(e.target.value as SportDayOption)}
            >
              <option value="today">Idag</option>
              <option value="tomorrow">Imorgon</option>
              <option value="dayAfterTomorrow">Övermorgon</option>
            </select>
          </label>

          <div>
            <p className="mb-1 text-sm text-zinc-300">Sport-typer</p>
            <div className="flex flex-wrap gap-3 text-sm">
              {sportTypeOptions.map((option) => (
                <label key={option.id} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sportTypeFilters.includes(option.id)}
                    onChange={() => toggleSportTypeFilter(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={runSportEventsQuery}
            disabled={isLoadingSportEvents}
          >
            {isLoadingSportEvents ? "Hämtar..." : "Hämta sport-events"}
          </button>
          <button
            className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
            type="button"
            onClick={loadSportChannels}
            disabled={isLoadingSportChannels}
          >
            {isLoadingSportChannels ? "Hämtar..." : "Visa sport-kanaler"}
          </button>
        </div>

        {sportEventsError && <p className="mt-3 text-sm text-rose-300">{sportEventsError}</p>}
        {sportChannelsError && (
          <p className="mt-3 text-sm text-rose-300">{sportChannelsError}</p>
        )}
        {sportChannels.length > 0 && (
          <div className="mt-3 space-y-2 text-sm">
            <p>Total sport-kanaler: {sportChannels.length}</p>
            <p className="text-zinc-300">
              {Object.entries(strictTypeCounts)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([type, count]) => `${type}: ${count}`)
                .join(", ") || "Inga strict-typer klassificerade"}
            </p>
            <p className="text-zinc-300">generic: {genericChannelCount}</p>
            <div className="overflow-x-auto rounded border border-zinc-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-800">
                  <tr>
                    <th className="px-3 py-2">Kanal</th>
                    <th className="px-3 py-2">Strict sport-typ</th>
                  </tr>
                </thead>
                <tbody>
                  {sportChannels.slice(0, 100).map((entry) => (
                    <tr key={entry.channelId} className="border-t border-zinc-700">
                      <td className="px-3 py-2">{entry.channelName}</td>
                      <td className="px-3 py-2">{entry.strictSportType ?? "generic"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 rounded border border-zinc-700 bg-zinc-900/30 p-3">
          <h3 className="text-sm font-medium">Test programme</h3>
          <div className="mt-2 space-y-2">
            <input
              className="w-full rounded border px-3 py-2 text-black"
              placeholder="Titel"
              value={programmeTestTitle}
              onChange={(e) => setProgrammeTestTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded border px-3 py-2 text-black"
              placeholder="Beskrivning (valfritt)"
              value={programmeTestDescription}
              onChange={(e) => setProgrammeTestDescription(e.target.value)}
              rows={3}
            />
            <button
              className="rounded bg-violet-700 px-4 py-2 text-white disabled:opacity-60"
              type="button"
              onClick={testProgrammeClassification}
              disabled={isTestingProgramme}
            >
              {isTestingProgramme ? "Testar..." : "Test programme"}
            </button>
            {programmeTestResult !== undefined && (
              <p className="text-sm text-zinc-300">
                Resultat: {programmeTestResult ?? "null (inte sport)"}
              </p>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm">Events: {sportEvents.length}</p>

        <ul className="mt-2 space-y-3 text-sm">
          {sportEvents.slice(0, 30).map((event) => (
            <li key={event.id} className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
              <p className="font-medium text-zinc-100">{event.title}</p>
              <p className="text-zinc-300">
                {event.sportType}
                {event.league ? ` • ${event.league}` : ""}
              </p>
              <p className="text-zinc-400">{formatTimeRange(event.startIso, event.stopIso)}</p>
              <p className="text-zinc-300">Kanaler: {event.channels.length}</p>
              <p className="text-zinc-400">
                {event.channels.map((c) => c.displayName).join(", ") || "-"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
