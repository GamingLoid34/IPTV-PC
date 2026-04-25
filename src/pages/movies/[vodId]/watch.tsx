import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { loadPlaylist } from "@/lib/playlistStorage";
import type {
  ApiErrorResponse,
  XtreamCredentials,
  XtreamVodInfo,
} from "@/types/xtream";

type VideoErrorState = {
  code: number;
  message: string;
} | null;

type WatchState = {
  isLoading: boolean;
  error: string | null;
  movieName: string;
  containerExtension: string;
  streamUrl: string;
};

function maskStreamUrl(streamUrl: string): string {
  try {
    const u = new URL(streamUrl);
    const segments = u.pathname.split("/");
    const movieIdx = segments.findIndex((segment) => segment === "movie");
    if (movieIdx >= 0 && segments[movieIdx + 2]) {
      segments[movieIdx + 2] = "***";
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

export default function MovieWatchPage() {
  const router = useRouter();
  const { vodId } = router.query;
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState<VideoErrorState>(null);
  const [canPlayTypeResult, setCanPlayTypeResult] = useState<string>("");
  const [state, setState] = useState<WatchState>({
    isLoading: true,
    error: null,
    movieName: "",
    containerExtension: "",
    streamUrl: "",
  });

  const parsedVodId = useMemo(() => {
    if (typeof vodId !== "string") return null;
    const parsed = Number(vodId);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }, [vodId]);

  useEffect(() => {
    if (!router.isReady) return;
    if (Array.isArray(vodId) || parsedVodId == null) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Ogiltigt film-id i URL.",
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

    const fetchVodInfo = async () => {
      try {
        const response = await fetch("/api/xtream/vod-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...normalizedCredentials,
            vodId: parsedVodId,
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

        const parsedData = data as XtreamVodInfo;
        const extension =
          parsedData.movie_data?.container_extension?.trim().toLowerCase() || "mp4";
        const base = normalizedCredentials.serverUrl.replace(/\/+$/, "");
        const streamUrl = `${base}/movie/${encodeURIComponent(
          normalizedCredentials.username
        )}/${encodeURIComponent(normalizedCredentials.password)}/${parsedVodId}.${extension}`;

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            movieName: parsedData.movie_data?.name ?? `Film ${parsedVodId}`,
            containerExtension: extension,
            streamUrl,
          });
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta filminformation.",
          }));
        }
      }
    };

    void fetchVodInfo();
    return () => {
      cancelled = true;
    };
  }, [router, vodId, parsedVodId]);

  useEffect(() => {
    if (!videoElement || !state.streamUrl) return;

    const onError = () => {
      const mediaError = videoElement.error;
      if (!mediaError) return;
      setVideoError({
        code: mediaError.code,
        message: mediaErrorMessage(mediaError.code),
      });
    };

    videoElement.addEventListener("error", onError);

    const canPlay = videoElement.canPlayType(mimeFromExtension(state.containerExtension));
    setCanPlayTypeResult(canPlay);

    return () => {
      videoElement.removeEventListener("error", onError);
      videoElement.pause();
      videoElement.src = "";
      videoElement.load();
    };
  }, [videoElement, state.streamUrl, state.containerExtension]);

  const maskedUrl =
    state.streamUrl.trim() !== "" ? maskStreamUrl(state.streamUrl) : "Inte skapad ännu";
  const extensionLikelyUnsupported =
    state.containerExtension !== "" &&
    !["mp4", "mkv", "avi", "webm"].includes(state.containerExtension);

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={parsedVodId != null ? `/movies/${parsedVodId}` : "/movies"}
            className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Tillbaka till {state.movieName || "filmen"}
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-zinc-100">
          {state.movieName || "Laddar film..."}
        </h1>

        {state.isLoading && <p className="text-sm text-zinc-300">Laddar...</p>}

        {!state.isLoading && state.error && (
          <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <p>{state.error}</p>
          </div>
        )}

        {!state.isLoading && !state.error && state.streamUrl && (
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

            <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3 text-sm">
              <h2 className="text-sm font-semibold text-zinc-200">Debug info</h2>
              <p className="break-all text-zinc-300">
                <span className="font-medium text-zinc-100">Stream-URL:</span>{" "}
                {maskedUrl}
              </p>
              <p className="text-zinc-300">
                <span className="font-medium text-zinc-100">container_extension:</span>{" "}
                {state.containerExtension}
              </p>
              <p className="text-zinc-300">
                <span className="font-medium text-zinc-100">canPlayType:</span>{" "}
                {canPlayTypeResult === "" ? "(tomt svar / no)" : canPlayTypeResult}
              </p>
              {extensionLikelyUnsupported && (
                <p className="text-amber-300">
                  Varning: extension `{state.containerExtension}` ar troligen inte stodd i
                  browsern.
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
