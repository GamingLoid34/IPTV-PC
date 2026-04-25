import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type HlsType from "hls.js";
import { loadPlaylist } from "@/lib/playlistStorage";

type PlayerStatus = "idle" | "loading" | "ready" | "playing" | "error";

type PlayerError = {
  message: string;
  details?: unknown;
};

function maskStreamUrl(streamUrl: string): string {
  try {
    const u = new URL(streamUrl);
    const segments = u.pathname.split("/");
    const liveIdx = segments.findIndex((segment) => segment === "live");
    if (liveIdx >= 0 && segments[liveIdx + 2]) {
      segments[liveIdx + 2] = "***";
      u.pathname = segments.join("/");
      return u.toString();
    }
  } catch {
    // Fall through to original URL.
  }
  return streamUrl;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function WatchPage() {
  const router = useRouter();
  const { streamId, categoryId } = router.query;
  const hlsRef = useRef<HlsType | null>(null);

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);

  const streamIdValue = useMemo(
    () => (typeof streamId === "string" ? streamId : null),
    [streamId]
  );
  const categoryIdValue = useMemo(
    () => (typeof categoryId === "string" ? categoryId : null),
    [categoryId]
  );
  const backHref = categoryIdValue
    ? `/category/${encodeURIComponent(categoryIdValue)}`
    : "/";
  const maskedUrl = streamUrl ? maskStreamUrl(streamUrl) : "Inte skapad ännu";

  useEffect(() => {
    if (!router.isReady) return;

    if (Array.isArray(streamId) || !streamIdValue || streamIdValue.trim() === "") {
      setPlayerStatus("error");
      setPlayerError({ message: "Ogiltigt streamId i URL." });
      return;
    }

    const credentials = loadPlaylist();
    if (!credentials) {
      void router.replace("/");
      return;
    }

    const base = credentials.serverUrl.trim().replace(/\/+$/, "");
    const url = `${base}/live/${encodeURIComponent(
      credentials.username
    )}/${encodeURIComponent(credentials.password)}/${encodeURIComponent(
      streamIdValue
    )}.m3u8`;
    setStreamUrl(url);
    setPlayerStatus("loading");
    setPlayerError(null);
  }, [router, streamId, streamIdValue]);

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoElement(el);
  }, []);

  useEffect(() => {
    if (!streamUrl || !videoElement) return;

    let isMounted = true;
    let nativeErrorHandler: ((event: Event) => void) | null = null;
    let nativePlayingHandler: (() => void) | null = null;
    let nativeCanPlayHandler: (() => void) | null = null;

    const setup = async () => {
      setPlayerStatus("loading");
      setPlayerError(null);

      try {
        const HlsModule = await import("hls.js");
        const Hls = HlsModule.default;

        if (!isMounted) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsRef.current = hls;

          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            console.error("[HLS] MEDIA_ATTACHED");
          });
          hls.on(Hls.Events.MANIFEST_LOADING, (_event, data) => {
            console.error("[HLS] MANIFEST_LOADING", data);
          });
          hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
            console.error("[HLS] MANIFEST_PARSED", data);
            if (isMounted) setPlayerStatus("ready");
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            console.error("[HLS] ERROR", data);

            let message = "HLS-fel vid uppspelning.";
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              (data.response?.code === 403 ||
                data.response?.code === 458 ||
                /cors/i.test(String(data.details ?? "")))
            ) {
              message =
                "Browsern kan inte hämta streamen direkt - vi kommer behöva bygga en proxy. Se browser-console för detaljer.";
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              message = "Mediafel i HLS-strömmen.";
            } else if (data.type === Hls.ErrorTypes.OTHER_ERROR) {
              message = "Övrigt HLS-fel.";
            }

            if (isMounted) {
              setPlayerStatus("error");
              setPlayerError({ message, details: data });
            }
          });

          hls.attachMedia(videoElement);
          hls.loadSource(streamUrl);
          return;
        }

        if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
          videoElement.src = streamUrl;
          setPlayerStatus("ready");

          nativeCanPlayHandler = () => {
            setPlayerStatus("ready");
          };
          nativePlayingHandler = () => {
            setPlayerStatus("playing");
          };
          nativeErrorHandler = (event: Event) => {
            console.error("[VIDEO] Native playback error", event);
            setPlayerStatus("error");
            setPlayerError({
              message: "Native HLS-uppspelning misslyckades.",
              details: event,
            });
          };

          videoElement.addEventListener("canplay", nativeCanPlayHandler);
          videoElement.addEventListener("playing", nativePlayingHandler);
          videoElement.addEventListener("error", nativeErrorHandler);
          return;
        }

        setPlayerStatus("error");
        setPlayerError({ message: "Browsern stödjer inte HLS" });
      } catch (error) {
        console.error("[HLS] Failed to initialize player", error);
        if (isMounted) {
          setPlayerStatus("error");
          setPlayerError({
            message: "Kunde inte initiera HLS-spelaren.",
            details: error,
          });
        }
      }
    };

    void setup();

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (nativeCanPlayHandler) {
        videoElement.removeEventListener("canplay", nativeCanPlayHandler);
      }
      if (nativePlayingHandler) {
        videoElement.removeEventListener("playing", nativePlayingHandler);
      }
      if (nativeErrorHandler) {
        videoElement.removeEventListener("error", nativeErrorHandler);
      }
      videoElement.removeAttribute("src");
      videoElement.load();
    };
  }, [streamUrl, videoElement]);

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-8 text-zinc-100">
      <div className="mx-auto w-full max-w-4xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Tillbaka
          </Link>
          <span className="text-xs text-zinc-400">
            Stream: {streamIdValue ?? "okänd"}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-700 bg-black/70">
          <video
            ref={handleVideoRef}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full"
          />
        </div>

        <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3 text-sm">
          <h2 className="text-sm font-semibold text-zinc-200">Debug info</h2>
          <p className="break-all text-zinc-300">
            <span className="font-medium text-zinc-100">Stream-URL:</span>{" "}
            {maskedUrl}
          </p>
          <p className="text-zinc-300">
            <span className="font-medium text-zinc-100">hls.js-state:</span>{" "}
            {playerStatus}
          </p>
          {playerError && (
            <div className="space-y-1">
              <p className="font-medium text-rose-300">{playerError.message}</p>
              <pre className="overflow-x-auto rounded bg-zinc-950 p-2 text-xs text-rose-200">
                {safeStringify(playerError.details ?? playerError)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
