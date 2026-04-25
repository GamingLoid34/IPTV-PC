import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type HlsType from "hls.js";
import { formatStartTime, formatTimeRange } from "@/lib/epg/formatTime";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { EpgProgramme, NowAndNextResult } from "@/types/epg";

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
  const { streamId, categoryId, streamName, from } = router.query;
  const hlsRef = useRef<HlsType | null>(null);
  const triedTsFallbackRef = useRef(false);

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [nonFatalEventsCount, setNonFatalEventsCount] = useState(0);
  const [nowAndNext, setNowAndNext] = useState<NowAndNextResult | null>(null);
  const [channelGuide, setChannelGuide] = useState<EpgProgramme[]>([]);
  const [isLoadingGuide, setIsLoadingGuide] = useState(false);

  const streamIdValue = useMemo(
    () => (typeof streamId === "string" ? streamId : null),
    [streamId]
  );
  const categoryIdValue = useMemo(
    () => (typeof categoryId === "string" ? categoryId : null),
    [categoryId]
  );
  const streamNameValue = useMemo(
    () => (typeof streamName === "string" ? streamName : null),
    [streamName]
  );
  const fromValue = useMemo(() => (typeof from === "string" ? from : null), [from]);
  const backHref =
    fromValue === "sport"
      ? "/sport"
      : fromValue === "favorites"
        ? "/favorites"
      : categoryIdValue
        ? `/live?categoryId=${encodeURIComponent(categoryIdValue)}`
        : "/live";
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
    triedTsFallbackRef.current = false;
    setPlayerStatus("loading");
    setPlayerError(null);
    setNonFatalEventsCount(0);
  }, [router, streamId, streamIdValue]);

  useEffect(() => {
    if (!streamIdValue || !streamNameValue) {
      setNowAndNext(null);
      return;
    }

    let cancelled = false;
    const loadNowAndNext = async () => {
      try {
        const numericStreamId = Number(streamIdValue);
        if (!Number.isFinite(numericStreamId)) return;

        const response = await fetch("/api/epg/now-and-next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xtreamChannels: [{ stream_id: numericStreamId, name: streamNameValue }],
          }),
        });
        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== "object") return;
        const results = (data as { results?: unknown }).results;
        if (!Array.isArray(results) || results.length === 0) return;

        if (!cancelled) {
          setNowAndNext((results[0] as NowAndNextResult) ?? null);
        }
      } catch {
        // silent no-EPG fallback
      }
    };

    void loadNowAndNext();
    return () => {
      cancelled = true;
    };
  }, [streamIdValue, streamNameValue]);

  useEffect(() => {
    if (!streamIdValue || !streamNameValue) {
      setChannelGuide([]);
      return;
    }

    let cancelled = false;
    const loadGuide = async () => {
      setIsLoadingGuide(true);
      try {
        const numericStreamId = Number(streamIdValue);
        if (!Number.isFinite(numericStreamId)) return;
        const nowMs = Date.now();
        const fromIso = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
        const toIso = new Date(nowMs + 10 * 60 * 60 * 1000).toISOString();

        const response = await fetch("/api/epg/multi-channel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xtreamChannels: [{ stream_id: numericStreamId, name: streamNameValue }],
            fromIso,
            toIso,
          }),
        });
        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== "object") return;
        const results = (data as { results?: unknown }).results;
        if (!Array.isArray(results) || results.length === 0) return;
        const programmes = (results[0] as { programmes?: EpgProgramme[] }).programmes;
        if (!cancelled) {
          setChannelGuide(Array.isArray(programmes) ? programmes : []);
        }
      } catch {
        if (!cancelled) setChannelGuide([]);
      } finally {
        if (!cancelled) setIsLoadingGuide(false);
      }
    };

    void loadGuide();
    return () => {
      cancelled = true;
    };
  }, [streamIdValue, streamNameValue]);

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

      const attemptTsFallback = () => {
        if (!isMounted || !videoElement) return;
        if (triedTsFallbackRef.current) return;
        triedTsFallbackRef.current = true;

        const tsUrl = streamUrl.replace(/\.m3u8(\?.*)?$/i, ".ts$1");
        console.warn("[HLS] Trying .ts fallback:", maskStreamUrl(tsUrl));
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        videoElement.src = tsUrl;
        setPlayerStatus("loading");

        const onPlaying = () => {
          if (isMounted) {
            setPlayerStatus("playing");
            setPlayerError(null);
          }
        };
        const onCanPlay = () => {
          if (isMounted) {
            setPlayerStatus("ready");
          }
        };
        const onError = () => {
          if (isMounted) {
            setPlayerStatus("error");
            setPlayerError({
              message:
                "Kunde inte spela upp streamen i webbläsaren (även fallback misslyckades). Testa annan kanal eller extern spelare/VPN.",
            });
          }
          videoElement.removeEventListener("playing", onPlaying);
          videoElement.removeEventListener("canplay", onCanPlay);
          videoElement.removeEventListener("error", onError);
        };

        videoElement.addEventListener("playing", onPlaying, { once: true });
        videoElement.addEventListener("canplay", onCanPlay, { once: true });
        videoElement.addEventListener("error", onError, { once: true });
        void videoElement.play().catch(() => {
          // Autoplay may be blocked; controls remain available.
        });
      };

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
            if (!data.fatal) {
              console.warn("[HLS] Non-fatal event", data);
              if (isMounted) {
                setNonFatalEventsCount((prev) => prev + 1);
              }
              return;
            }

            console.error("[HLS] Fatal error", data);

            let message = "HLS-fel vid uppspelning.";
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              (data.response?.code === 403 ||
                data.response?.code === 458 ||
                /cors/i.test(String(data.details ?? "")))
            ) {
              message = "Streamen blockerades i webbläsaren. Försöker fallback…";
              attemptTsFallback();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              message = "Mediafel i HLS-strömmen.";
            } else if (data.type === Hls.ErrorTypes.OTHER_ERROR) {
              message = "Övrigt HLS-fel.";
            }

            if (isMounted) {
              if (!triedTsFallbackRef.current) {
                setPlayerStatus("error");
                setPlayerError({ message, details: data });
              }
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
    <div className="px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-4 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
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
            className="aspect-video w-full max-h-[62vh]"
          />
        </div>

        {(nowAndNext?.now || nowAndNext?.next) && (
          <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3 text-sm">
            <h2 className="text-sm font-semibold text-zinc-200">Program</h2>
            {nowAndNext.now && (
              <div className="space-y-1">
                <p className="text-zinc-200">
                  <span className="font-medium">Just nu:</span> {nowAndNext.now.title} kl{" "}
                  {formatTimeRange(nowAndNext.now.start, nowAndNext.now.stop)}
                </p>
                {nowAndNext.now.description && (
                  <p
                    className="text-zinc-400"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {nowAndNext.now.description}
                  </p>
                )}
              </div>
            )}
            {nowAndNext.next && (
              <p className="text-zinc-300">
                <span className="font-medium">Nästa:</span> {nowAndNext.next.title} kl{" "}
                {formatStartTime(nowAndNext.next.start)}
              </p>
            )}
          </section>
        )}

        <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/30 p-3 text-sm">
          <h2 className="text-sm font-semibold text-zinc-200">Kanalens TV-guide</h2>
          {isLoadingGuide && <p className="text-zinc-400">Laddar TV-guide...</p>}
          {!isLoadingGuide && channelGuide.length === 0 && (
            <p className="text-zinc-400">Ingen TV-guide tillgänglig för kanalen.</p>
          )}
          {!isLoadingGuide && channelGuide.length > 0 && (
            <ul className="space-y-2">
              {channelGuide.slice(0, 12).map((programme) => {
                const isCurrent =
                  Date.parse(programme.start) <= Date.now() &&
                  Date.now() < Date.parse(programme.stop);
                return (
                  <li
                    key={`${programme.channelId}-${programme.start}`}
                    className={`rounded border px-3 py-2 ${
                      isCurrent
                        ? "border-blue-400/70 bg-blue-500/10"
                        : "border-zinc-700 bg-zinc-900/40"
                    }`}
                  >
                    <p className="text-xs text-zinc-400">
                      {formatTimeRange(programme.start, programme.stop)}
                    </p>
                    <p className="font-medium text-zinc-100">{programme.title}</p>
                    {programme.description && (
                      <p className="line-clamp-2 text-xs text-zinc-400">{programme.description}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

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
          <p className="text-zinc-300">
            <span className="font-medium text-zinc-100">
              Non-fatal events:
            </span>{" "}
            {nonFatalEventsCount}
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
