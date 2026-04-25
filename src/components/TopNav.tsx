import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { clearPlaylist, loadPlaylist } from "@/lib/playlistStorage";
import type { EpgManifest } from "@/types/epg";

const navItems = [
  { href: "/live", label: "Live" },
  { href: "/movies", label: "Filmer" },
  { href: "/series", label: "Serier" },
];

export function TopNav() {
  const router = useRouter();
  const [epgStatus, setEpgStatus] = useState<EpgManifest | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);

  const handleForget = () => {
    clearPlaylist();
    void router.replace("/");
  };

  const isActive = (href: string) =>
    router.pathname === href || router.pathname.startsWith(`${href}/`);

  const loadEpgStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch("/api/epg/status");
      const data: unknown = await response.json();
      if (!response.ok) {
        setStatusError("Kunde inte läsa EPG-status.");
        return;
      }

      if ("cached" in (data as { cached?: boolean })) {
        setEpgStatus(null);
      } else {
        setEpgStatus(data as EpgManifest);
      }
      setStatusError(null);
    } catch {
      setStatusError("Kunde inte läsa EPG-status.");
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadEpgStatus();
  }, []);

  useEffect(() => {
    if (!toastText) return;
    const timer = setTimeout(() => setToastText(null), 3000);
    return () => clearTimeout(timer);
  }, [toastText]);

  const badgeLabel = useMemo(() => {
    if (!epgStatus) return "EPG saknas";
    const now = Date.now();
    const ageMs = now - Date.parse(epgStatus.fetchedAt);
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    if (ageDays <= 0) return "EPG: idag";
    if (ageDays === 1) return "EPG: igår";
    return `EPG: ${ageDays}d gammal`;
  }, [epgStatus]);

  const refreshEpg = async () => {
    const credentials = loadPlaylist();
    if (!credentials) {
      setStatusError("Saknar credentials i localStorage.");
      return;
    }

    setIsRefreshing(true);
    setStatusError(null);
    try {
      const response = await fetch("/api/epg/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setStatusError(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "EPG-refresh misslyckades."
        );
        return;
      }

      setEpgStatus(data as EpgManifest);
      setIsPopoverOpen(false);
      setToastText("EPG uppdaterad ✓");
    } catch {
      setStatusError("EPG-refresh misslyckades.");
    } finally {
      setIsRefreshing(false);
      await loadEpgStatus();
    }
  };

  const formatFetchedAt = (iso: string) =>
    new Date(iso).toLocaleString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatProgrammeCount = (count: number) =>
    count >= 1000 ? `${Math.round(count / 1000)}k` : String(count);

  const dateRangeLabel = epgStatus
    ? `${epgStatus.earliestStart.slice(0, 10)} till ${epgStatus.latestStop.slice(0, 10)}`
    : "-";

  return (
    <header className="border-b border-zinc-700 bg-zinc-900/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(item.href)
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPopoverOpen((prev) => !prev)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                epgStatus
                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border border-rose-500/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {isLoadingStatus ? "EPG: laddar..." : badgeLabel}
            </button>

            {isPopoverOpen && (
              <div className="absolute left-0 z-20 mt-2 w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-200 shadow-2xl">
                {epgStatus ? (
                  <div className="space-y-2">
                    <p>
                      Hämtad {formatFetchedAt(epgStatus.fetchedAt)}, {epgStatus.channelCount}{" "}
                      kanaler, {formatProgrammeCount(epgStatus.programmeCount)} program
                    </p>
                    <p>Datumspann: {dateRangeLabel}</p>
                  </div>
                ) : (
                  <p className="text-rose-200">EPG cache saknas.</p>
                )}

                {statusError && <p className="mt-2 text-rose-300">{statusError}</p>}

                <button
                  type="button"
                  onClick={refreshEpg}
                  disabled={isRefreshing}
                  className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {isRefreshing ? "Uppdaterar EPG..." : "Uppdatera nu"}
                </button>
              </div>
            )}
          </div>

          {toastText && <span className="text-xs text-emerald-300">{toastText}</span>}
        </div>

        <button
          type="button"
          onClick={handleForget}
          className="rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Glöm spellista
        </button>
      </div>
    </header>
  );
}
