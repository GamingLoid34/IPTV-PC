import { isSportChannel } from "@/lib/epg/channelSportClassifier";

export type SmartListRule = {
  id: "swedish" | "nordic" | "uhd" | "sport";
  name: string;
  emoji: string;
  matchLive: (channelName: string) => boolean;
  matchCategory: (categoryName: string) => boolean;
};

const swedishPrefixRegex = /^se\s*[:|]/i;
const nordicPrefixRegex = /^(se|no|dk|fi|is)\s*[:|]/i;
const uhdRegex = /\b(4k|uhd|2160|3840)\b/i;
const sportLiveRegex =
  /\b(sport|sports|espn|eurosport|skysports|tnt sports|bein sports|fox sports|nbc sports|v fotboll|fotboll|v motor|v vinter|v sport|match football|premier sports)\b/i;
const sportCategoryRegex = /\b(sport|sports|espn|eurosport)\b/i;

export const SMART_LIST_RULES: Record<SmartListRule["id"], SmartListRule> = {
  swedish: {
    id: "swedish",
    name: "Svenskt",
    emoji: "🇸🇪",
    matchLive: (channelName: string) =>
      swedishPrefixRegex.test(channelName) || /svensk|nordic/i.test(channelName),
    matchCategory: (categoryName: string) =>
      swedishPrefixRegex.test(categoryName) || /sweden|svenska|nordic/i.test(categoryName),
  },
  nordic: {
    id: "nordic",
    name: "Nordiskt",
    emoji: "🌍",
    matchLive: (channelName: string) =>
      nordicPrefixRegex.test(channelName) || /nordic/i.test(channelName),
    matchCategory: (categoryName: string) =>
      nordicPrefixRegex.test(categoryName) || /nordic/i.test(categoryName),
  },
  uhd: {
    id: "uhd",
    name: "4K",
    emoji: "📺",
    matchLive: (channelName: string) => uhdRegex.test(channelName),
    matchCategory: (categoryName: string) => uhdRegex.test(categoryName),
  },
  sport: {
    id: "sport",
    name: "Sport",
    emoji: "⚽",
    matchLive: (channelName: string) =>
      isSportChannel(channelName) || sportLiveRegex.test(channelName),
    matchCategory: (categoryName: string) => sportCategoryRegex.test(categoryName),
  },
};
