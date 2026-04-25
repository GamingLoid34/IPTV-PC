import type { EpgChannel } from "@/types/epg";

export function extractCountryCode(name: string): string | null {
  const match = name.trim().match(/^([A-Z]{2,3})\s*[:|]\s*/);
  if (!match) return null;
  return match[1].slice(0, 2).toLowerCase();
}

export function extractCountryCodeFromEpgId(epgId: string): string | null {
  const match = epgId.toLowerCase().match(/\.([a-z]{2})$/);
  return match ? match[1] : null;
}

export function normalizeChannelName(name: string): string {
  const lowered = name.toLowerCase();
  const withoutPrefix = lowered.replace(/^[a-z]{2,3}\s*[:|]\s*/, "");
  const withoutQualityPrefix = withoutPrefix.replace(/^(4k|hd|sd|fhd|uhd)\s*[:\-|]?\s*/, "");
  const withoutSeparators = withoutQualityPrefix.replace(/[|:-]+/g, " ");
  const asciiOnly = withoutSeparators.replace(/[^a-z0-9\s]/g, " ");
  let normalized = asciiOnly.replace(
    /\b(uhd|hd|sd|fhd|4k|8k|2160p|1080p|720p|3840p|raw|ultra)\b/g,
    " "
  );

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
    const normalized = normalizeChannelName(channel.displayName);
    if (!normalized) continue;
    const country = extractCountryCodeFromEpgId(channel.id);
    const key = country ? `${country}:${normalized}` : `_:${normalized}`;

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
  const normalized = normalizeChannelName(xtreamName);
  if (!normalized) return null;
  const country = extractCountryCode(xtreamName);

  if (country) {
    const strictKey = `${country}:${normalized}`;
    const strictMatches = epgIndex.get(strictKey);
    if (strictMatches && strictMatches.length > 0) {
      if (strictMatches.length > 1) {
        console.warn(
          `[EPG] Ambiguous strict country match for "${xtreamName}" (${strictKey}) -> ${strictMatches.length} candidates`
        );
      }
      return strictMatches[0] ?? null;
    }
  }

  const fallbackKey = `_:${normalized}`;
  const fallbackMatches = epgIndex.get(fallbackKey);
  if (fallbackMatches && fallbackMatches.length > 0) {
    if (fallbackMatches.length > 1) {
      console.warn(
        `[EPG] Ambiguous country-less match for "${xtreamName}" (${fallbackKey}) -> ${fallbackMatches.length} candidates`
      );
    }
    return fallbackMatches[0] ?? null;
  }

  for (const [key, matches] of epgIndex.entries()) {
    if (!key.endsWith(`:${normalized}`)) continue;
    if (matches.length > 1) {
      console.warn(
        `[EPG] Ambiguous loose fallback for "${xtreamName}" (normalized "${normalized}") -> ${matches.length} candidates`
      );
    }
    return matches[0] ?? null;
  }

  return null;
}

export function testNormalization(): { input: string; output: string; country: string | null }[] {
  const cases = [
    "4K: ELEVEN ᴾᴸ ᵁᴴᴰ ³⁸⁴⁰ᴾ",
    "4K: SKY SPORTS F1 ᵁᴴᴰ ³⁸⁴⁰ᴾ",
    "SE: TV3 ᴴᴰ ⱽᴵᴾ",
    "HU: TV4 FOTBOLL ᴴᴰ ⱽᴵᴾ",
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
    country: extractCountryCode(input),
  }));
}
