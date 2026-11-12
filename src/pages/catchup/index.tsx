import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { CategorySplitView } from "@/components/CategorySplitView";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import {
  compareCountries,
  countryFromChannelName,
  type ChannelCountry,
} from "@/lib/countryFromChannelName";
import { loadPlaylist } from "@/lib/playlistStorage";
import type { ApiErrorResponse, CatchupChannel } from "@/types/xtream";

type ChannelsState = {
  isLoading: boolean;
  error: string | null;
  channels: CatchupChannel[];
};

type CountryGroup = {
  country: ChannelCountry;
  channels: CatchupChannel[];
};

function ChannelIcon({ name, streamIcon }: { name: string; streamIcon: string }) {
  const [hasImageError, setHasImageError] = useState(false);
  const showImage = streamIcon.trim() !== "" && !hasImageError;
  const fallbackLabel = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs font-semibold text-zinc-100">
      {showImage ? (
        <img
          src={streamIcon}
          alt={`${name} logga`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span>{fallbackLabel}</span>
      )}
    </div>
  );
}

export default function CatchupIndexPage() {
  const router = useRouter();
  const selectedCountryId = useMemo(
    () => (typeof router.query.country === "string" ? router.query.country : null),
    [router.query.country]
  );
  const [state, setState] = useState<ChannelsState>({
    isLoading: true,
    error: null,
    channels: [],
  });
  const [channelQuery, setChannelQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const credentials = loadPlaylist();
      if (!credentials) {
        void router.replace("/");
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch("/api/xtream/catchup-channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        const data: unknown = await response.json();

        if (!response.ok) {
          const err = data as ApiErrorResponse;
          if (!cancelled) {
            setState({
              isLoading: false,
              error: typeof err?.error === "string" ? err.error : "Ett fel uppstod.",
              channels: [],
            });
          }
          return;
        }

        if (!Array.isArray(data)) {
          if (!cancelled) {
            setState({
              isLoading: false,
              error: "Oväntat svar från servern.",
              channels: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: null,
            channels: data as CatchupChannel[],
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            isLoading: false,
            error: "Nätverksfel: kunde inte hämta catch-up-kanaler.",
            channels: [],
          });
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const countryGroups = useMemo<CountryGroup[]>(() => {
    const groups = new Map<string, CountryGroup>();
    for (const channel of state.channels) {
      const country = countryFromChannelName(channel.name);
      const existing = groups.get(country.id);
      if (existing) {
        existing.channels.push(channel);
      } else {
        groups.set(country.id, { country, channels: [channel] });
      }
    }
    const sorted = [...groups.values()].sort((a, b) =>
      compareCountries(a.country, b.country)
    );
    for (const group of sorted) {
      group.channels.sort((a, b) => a.name.localeCompare(b.name, "sv"));
    }
    return sorted;
  }, [state.channels]);

  const selectedGroup = useMemo(
    () => countryGroups.find((group) => group.country.id === selectedCountryId) ?? null,
    [countryGroups, selectedCountryId]
  );

  const normalizedChannelQuery = channelQuery.trim().toLowerCase();
  const visibleChannels = useMemo(() => {
    if (!selectedGroup) return [];
    if (!normalizedChannelQuery) return selectedGroup.channels;
    return selectedGroup.channels.filter((channel) =>
      channel.name.toLowerCase().includes(normalizedChannelQuery)
    );
  }, [selectedGroup, normalizedChannelQuery]);

  const selectCountry = (id: string) => {
    setChannelQuery("");
    void router.push(
      { pathname: router.pathname, query: { ...router.query, country: id } },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  const countriesForPanel = countryGroups.map((group) => ({
    id: group.country.id,
    name: `${group.country.flag} ${group.country.name}`,
    count: group.channels.length,
  }));

  const watchHref = (channel: CatchupChannel) =>
    `/live/watch/${channel.stream_id}?streamName=${encodeURIComponent(
      channel.name
    )}&from=catchup&archive=${channel.archiveDays || 1}`;

  return (
    <main className="px-4 py-4">
      {state.isLoading && (
        <p className="text-sm text-zinc-300">Laddar catch-up-kanaler...</p>
      )}

      {!state.isLoading && state.error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {state.error}
        </div>
      )}

      {!state.isLoading && !state.error && state.channels.length === 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/30 p-4 text-sm text-zinc-300">
          Din spellista verkar inte ha några kanaler med catch-up (arkiv).
        </div>
      )}

      {!state.isLoading && !state.error && state.channels.length > 0 && (
        <CategorySplitView
          categories={countriesForPanel}
          selectedCategoryId={selectedCountryId}
          onSelectCategory={selectCountry}
          searchPlaceholder="Sök land..."
          emptyStateMessage="Välj ett land för att se catch-up-kanaler."
        >
          {selectedGroup && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-200">
                  {selectedGroup.country.flag} {selectedGroup.country.name} –{" "}
                  {selectedGroup.channels.length} kanaler med arkiv
                </h2>
                <input
                  type="text"
                  value={channelQuery}
                  onChange={(event) => setChannelQuery(event.target.value)}
                  placeholder="Sök kanal..."
                  className="w-56 rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
                />
              </div>

              {visibleChannels.length === 0 ? (
                <p className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-300">
                  Inga kanaler matchade sökningen.
                </p>
              ) : (
                <ul className="space-y-1">
                  {visibleChannels.map((channel) => (
                    <li
                      key={channel.stream_id}
                      className="flex items-center gap-2 rounded-lg border border-zinc-700/70 bg-zinc-900/40 px-3 py-2"
                    >
                      <Link
                        href={watchHref(channel)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-white"
                      >
                        <ChannelIcon name={channel.name} streamIcon={channel.stream_icon} />
                        <span className="truncate text-sm text-zinc-100">
                          {channel.name}
                        </span>
                      </Link>
                      <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                        {channel.archiveDays > 0
                          ? `${channel.archiveDays} ${channel.archiveDays === 1 ? "dag" : "dagar"}`
                          : "Arkiv"}
                      </span>
                      <FavoriteToggle
                        type="live"
                        id={channel.stream_id}
                        name={channel.name}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CategorySplitView>
      )}
    </main>
  );
}
