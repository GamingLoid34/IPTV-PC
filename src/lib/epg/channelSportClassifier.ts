import type { SportType } from "@/types/epg";

export function isSportChannel(channelName: string): boolean {
  const name = channelName.toLowerCase();

  return /\b(sport|sports|espn|eurosport|skysports|sky sports|tnt sports|bein sports|fox sports|nbc sports|v sport|v fotboll|fotboll|v motor|v vinter|match football|match arena|match|premier sports)\b/i.test(
    name
  );
}

export function classifyChannelSportTypeStrict(channelName: string): SportType | null {
  const name = channelName.toLowerCase();

  if (/\bf1\b/i.test(name)) return "motorsport";
  if (/\bnhl\b|\bshl\b|hockey/i.test(name)) return "winter";
  if (/\b(ski|längd|biathlon|skidskytte|alpint)\b/i.test(name)) return "winter";
  if (/\bgolf\b/i.test(name)) return "other";
  if (/\btennis\b/i.test(name)) return "tennis";
  if (/\b(fotboll|football|soccer)\b/i.test(name)) return "football";
  if (/\b(cykel|cycling|tour de france|giro)\b/i.test(name)) return "cycling";
  if (/\b(motor|nascar|motogp|indycar|racing)\b/i.test(name)) return "motorsport";
  return null;
}

export function testChannelSportClassifierCases(): { input: string; isSport: boolean }[] {
  const cases = [
    "FILM 1 PREMIERE",
    "SKY CINEMA PREMIEREN",
    "KINOPREMIERA",
    "CineStar Premiere",
    "SKY SPORTS PREMIER LEAGUE",
    "CANAL+ PREMIER LEAGUE",
    "SKY SPORTS F1",
    "V SPORT PREMIUM",
    "V FOTBOLL",
    "V FILM PREMIERE",
    "MATCH FOOTBALL 1",
    "MATCH FILM",
    "ESPN 1",
    "EUROSPORT 1",
  ];

  return cases.map((input) => ({ input, isSport: isSportChannel(input) }));
}
