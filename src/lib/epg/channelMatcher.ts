import type { EpgChannel } from "@/types/epg";

export function normalizeChannelName(name: string): string {
  const lowered = name.toLowerCase();
  const withoutPrefix = lowered.replace(/^[a-z]{2,3}\s*[:|]\s*/, "");
  const withoutSeparators = withoutPrefix.replace(/[|:-]+/g, " ");
  const asciiOnly = withoutSeparators.replace(/[^a-z0-9\s]/g, " ");
  let normalized = asciiOnly;

  let previous = "";
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/([a-z])\s+(\d)/g, "$1$2")
      .replace(/(\d)\s+([a-z])/g, "$1$2");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export function buildEpgIndex(epgChannels: EpgChannel[]): Map<string, EpgChannel[]> {
  const index = new Map<string, EpgChannel[]>();

  for (const channel of epgChannels) {
    const key = normalizeChannelName(channel.displayName);
    if (!key) continue;

    const existing = index.get(key);
    if (existing) {
      existing.push(channel);
    } else {
      index.set(key, [channel]);
    }
  }

  return index;
}

export function findEpgChannel(
  xtreamName: string,
  epgIndex: Map<string, EpgChannel[]>
): EpgChannel | null {
  const key = normalizeChannelName(xtreamName);
  if (!key) return null;

  const matches = epgIndex.get(key);
  if (!matches || matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    console.warn(
      `[EPG] Ambiguous channel match for "${xtreamName}" (normalized "${key}") -> ${matches.length} candidates`
    );
  }

  return matches[0] ?? null;
}

export function testNormalization(): { input: string; output: string }[] {
  const cases = [
    "SE: SVT 1 ᴴᴰ ⱽᴵᴾ",
    "SE: SVT1 ᵁᴸᵀᴿᴬ ᴿᴬᵂ",
    "SE: TV4 FOTBOLL ᴴᴰ ⱽᴵᴾ",
    "UK| SKY SPORTS PL",
    "DE: SAT.1 HD",
    "SE: KANAL 5 ᴴᴰ ⱽᴵᴾ",
    "SE: KANAL 11 ᴴᴰ ⱽᴵᴾ",
    "##### SWEDEN ⱽᴵᴾ #####",
  ];

  return cases.map((input) => ({
    input,
    output: normalizeChannelName(input),
  }));
}
