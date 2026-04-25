import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamEpisode,
  XtreamSeriesInfo,
} from "@/types/xtream";

type VideoErrorState = {
  code: number;
  message: string;
} | null;

type WatchState = {
  isLoading: boolean;
  error: string | null;
  seriesName: string;
  episode: XtreamEpisode | null;
  streamUrl: string;
};

function maskStreamUrl(streamUrl: string): string {
  try {
    const u = new URL(streamUrl);
    const segments = u.pathname.split("/");
    const seriesIdx = segments.findIndex((segment) => segment === "series");
    if (seriesIdx >= 0 && segments[seriesIdx + 2]) {
      segments[seriesIdx + 2] = "***";
      u.pathname = segments.join("/");
      return u.toString();
    }
  } catch {
    // Fall through to original URL.
  }
  return streamUrl;
}

function mediaErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "Uppspelningen avbröts av användaren.";
    case 2:
      return "Nätverksfel vid videohämtning.";
    case 3:
      return "Videon kunde inte avkodas i browsern.";
    case 4:
      return "Videoformatet stöds inte av browsern.";
    default:
      return "Okänt videofel.";
  }
}

function mimeFromExtension(ext: string): string {
  if (ext === "mkv") return "video/x-matroska";
  return `video/${ext}`;
}

function episodeTitle(episode: XtreamEpisode): string {
  if (episode.title && episode.title.trim() !== "") return episode.title;
  return `Avsnitt ${episode.episode_num}`;
}

function episodeLabel(episode: XtreamEpisode): string {
  const seasonPadded = episode.season.toString().padStart(2, "0");
  const episodePadded = episode.episode_num.toString().padStart(2, "0");
  return `S${seasonPadded}E${episodePadded}`;
}

function findEpisodeById(
  seriesInfo: XtreamSeriesInfo,
  targetEpisodeId: string
): XtreamEpisode | null {
  for (const seasonEpisodes of Object.values(seriesInfo.episodes)) {
    const found = seasonEpisodes.find((episode) => episode.id === targetEpisodeId);
    if (found) return found;
  }
  return null;
}

export default function SeriesEpisodeWatchPage() {
  const router = useRouter();
  const { seriesId, episodeId } = router.query;
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState<VideoErrorState>(null);
  const [canPlayTypeResult, setCanPlayTypeResult] = useState<string>("");
  const [state, setState] = useState<WatchState>({
    isLoading: true,
    error: null,
    seriesName: "",
    episode: null,
    streamUrl: "",
  });

  const parsedSeriesId = useMemo(() => {
    if (typeof seriesId !== "string") return null;
    const parsed = Number(seriesId);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }, [seriesId]);
  const episodeIdValue = useMemo(
    () => (typeof episodeId === "string" && episodeId.trim() !== "" ? episodeId : null),
    [episodeId]
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (Array.isArray(seriesId) || parsedSeriesId == null || Array.isArray(episodeId) || !episodeIdValue) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Ogiltigt serie- eller avsnitts-id i URL.",
      }));
      return;
    }

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

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    setVideoError(null);
    setCanPlayTypeResult("");

    const fetchSeriesInfo = async () => {
      try {
        const response = await fetch("/api/xtream/series-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...normalizedCredentials,
            seriesId: parsedSeriesId,
          }),
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

        if (!data || typeof data !== "object" || Array.isArray(data)) {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: "Oväntat svar från servern.",
            }));
          }
          return;
        }

        const parsedData = data as XtreamSeriesInfo;
        const episode = findEpisodeById(parsedData, episodeIdValue);
        if (!episode) {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: "Avsnittet kunde inte hittas.",
            }));
          }
          return;
        }

        const ext = episode.container_extension.trim().toLowerCase();
        const base = normalizedCredentials.serverUrl.replace(/\/+$/, "");
        const streamUrl = `${base}/series/${encodeURIComponent(
          normalizedCredentials.username
        )}/${encodeURIComponent(normalizedCredentials.password)}/${encodeURIComponent(
          episode.id
        )}.${ext}`;

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            seriesName: parsedData.info?.name ?? `Serie ${parsedSeriesId}`,
            episode,
            streamUrl,
          });
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta serieinformation.",
          }));
        }
      }
    };

    void fetchSeriesInfo();
    return () => {
      cancelled = true;
    };
  }, [router, seriesId, episodeId, parsedSeriesId, episodeIdValue]);

  useEffect(() => {
    if (!videoElement || !state.streamUrl || !state.episode) return;

    const onError = () => {
      const mediaError = videoElement.error;
      if (!mediaError) return;
      setVideoError({
        code: mediaError.code,
        message: mediaErrorMessage(mediaError.code),
      });
    };

    videoElement.addEventListener("error", onError);
    const canPlay = videoElement.canPlayType(
      mimeFromExtension(state.episode.container_extension.toLowerCase())
    );
    setCanPlayTypeResult(canPlay);

    return () => {
      videoElement.removeEventListener("error", onError);
      videoElement.pause();
      videoElement.src = "";
      videoElement.load();
    };
  }, [videoElement, state.streamUrl, state.episode]);

  const maskedUrl =
    state.streamUrl.trim() !== "" ? maskStreamUrl(state.streamUrl) : "Inte skapad ännu";
  const extension = state.episode?.container_extension?.toLowerCase() ?? "";
  const extensionLikelyUnsupported =
    extension !== "" && !["mp4", "mkv", "avi", "webm"].includes(extension);

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={parsedSeriesId != null ? `/series/${parsedSeriesId}` : "/series"}
            className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Tillbaka till serie
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-zinc-100">
          {state.episode
            ? `${state.seriesName} - ${episodeLabel(state.episode)} - ${episodeTitle(state.episode)}`
            : "Laddar avsnitt..."}
        </h1>

        {state.isLoading && <p className="text-sm text-zinc-300">Laddar...</p>}

        {!state.isLoading && state.error && (
          <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <p>{state.error}</p>
            {parsedSeriesId != null && (
              <Link
                href={`/series/${parsedSeriesId}`}
                className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
              >
                Tillbaka
              </Link>
            )}
          </div>
        )}

        {!state.isLoading && !state.error && state.streamUrl && state.episode && (
          <>
            <div className="overflow-hidden rounded-lg border border-zinc-700 bg-black/80">
              <video
                ref={setVideoElement}
                controls
                autoPlay
                playsInline
                src={state.streamUrl}
                className="mx-auto aspect-video w-full"
              />
            </div>

            {state.episode.info?.plot && state.episode.info.plot.trim() !== "" && (
              <p className="text-sm text-zinc-300">{state.episode.info.plot.trim()}</p>
            )}

            <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3 text-sm">
              <h2 className="text-sm font-semibold text-zinc-200">Debug info</h2>
              <p className="break-all text-zinc-300">
                <span className="font-medium text-zinc-100">Stream-URL:</span>{" "}
                {maskedUrl}
              </p>
              <p className="text-zinc-300">
                <span className="font-medium text-zinc-100">container_extension:</span>{" "}
                {state.episode.container_extension}
              </p>
              <p className="text-zinc-300">
                <span className="font-medium text-zinc-100">canPlayType:</span>{" "}
                {canPlayTypeResult === "" ? "(tomt svar / no)" : canPlayTypeResult}
              </p>
              {extensionLikelyUnsupported && (
                <p className="text-amber-300">
                  Varning: extension `{state.episode.container_extension}` ar troligen inte
                  stodd i browsern.
                </p>
              )}
              {videoError && (
                <div className="space-y-1">
                  <p className="font-medium text-rose-300">
                    Videofel (code {videoError.code})
                  </p>
                  <p className="text-rose-200">{videoError.message}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
