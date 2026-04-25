import type { SportType } from "@/types/epg";

export function classifyChannelSportType(channelName: string): SportType | null {
  const name = channelName.toLowerCase();

  if (/\bf1\b|formula\s*1/i.test(name)) return "motorsport";
  if (/\bnhl\b|hockey|ishockey/i.test(name)) return "winter";
  if (/\bski|längd|biathlon|skidskytte|alpint|vinter|winter sport/i.test(name)) {
    return "winter";
  }
  if (/\bgolf\b/i.test(name)) return "other";
  if (/\btennis\b/i.test(name)) return "tennis";
  if (/\bfotboll|football|soccer|fußball|premier|fotbal\b/i.test(name)) return "football";
  if (/\bcykel|cycling|tour de france|giro/i.test(name)) return "cycling";
  if (/\bmotor|nascar|motogp|indycar|racing/i.test(name)) return "motorsport";
  if (
    /\b(sport|espn|sky sports|v sport|tnt sports|bein sports|fox sports|nbc sports|sportkanalen|eurosport)\b/i.test(
      name
    )
  ) {
    return "other";
  }

  return null;
}
