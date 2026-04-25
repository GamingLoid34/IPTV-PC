import type { SportType } from "@/types/epg";

type ProgrammeLike = {
  title: string;
  description?: string;
  categories: string[];
};

function hasCategory(categories: string[], needles: string[]): boolean {
  const normalized = categories.map((c) => c.trim().toLowerCase());
  const targets = needles.map((n) => n.toLowerCase());
  return normalized.some((cat) => targets.includes(cat));
}

function hasTeamVsPattern(text: string): boolean {
  return /\b.+\s(-|v|vs)\s.+\b/i.test(text);
}

export function classifySportType(programme: ProgrammeLike): SportType {
  if (hasCategory(programme.categories, ["Football", "Soccer", "Fotboll"])) {
    return "football";
  }
  if (hasCategory(programme.categories, ["Motor sport", "Motorsport", "Auto racing"])) {
    return "motorsport";
  }
  if (hasCategory(programme.categories, ["Cycling", "Cykel", "Cykling"])) {
    return "cycling";
  }
  if (hasCategory(programme.categories, ["Skiing", "Hockey", "Ice hockey", "Winter"])) {
    return "winter";
  }
  if (hasCategory(programme.categories, ["Tennis"])) {
    return "tennis";
  }

  const text = `${programme.title} ${programme.description ?? ""}`.toLowerCase();

  if (
    /\b(premier league|la liga|champions league|europa league|conference league|allsvenskan|bundesliga|serie a|ligue 1|world cup|euros|euro 2024|euro 2028|fifa|uefa|cup final)\b/.test(
      text
    ) ||
    /\b(soccer|football match|fotboll|fußball)\b/.test(text)
  ) {
    return "football";
  }
  if (
    /\b(formula 1|formel 1|f1|indycar|nascar|motogp|moto gp|grand prix|gp\b|qualifying|practice session|race highlights)\b/.test(
      text
    )
  ) {
    return "motorsport";
  }
  if (/\b(tour de france|giro d'?italia|vuelta|paris-roubaix|milano-sanremo|cykel|cycling|stage \d+)\b/.test(text)) {
    return "cycling";
  }
  if (
    /\b(nhl|shl|premier hockey|hockey|ishockey|biathlon|skidskytte|längdåkning|cross-country|alpint|slalom|downhill|world cup ski)\b/.test(
      text
    )
  ) {
    return "winter";
  }
  if (
    /\b(atp|wta|grand slam|wimbledon|roland garros|us open tennis|australian open|french open|tennis match)\b/.test(
      text
    )
  ) {
    return "tennis";
  }

  return "unknown";
}

export function classifyProgrammeSportType(programme: ProgrammeLike): SportType | null {
  const specific = classifySportType(programme);
  if (specific !== "unknown") return specific;

  const text = `${programme.title} ${programme.description ?? ""}`.toLowerCase();
  if (hasTeamVsPattern(text)) {
    return "football";
  }

  return null;
}

export function extractLeague(programme: ProgrammeLike): string | undefined {
  const text = `${programme.title} ${programme.description ?? ""}`.toLowerCase();

  if (text.includes("premier league")) return "Premier League";
  if (text.includes("la liga")) return "La Liga";
  if (text.includes("champions league")) return "Champions League";
  if (text.includes("europa league")) return "Europa League";
  if (text.includes("allsvenskan")) return "Allsvenskan";
  if (text.includes("bundesliga")) return "Bundesliga";
  if (/\bserie a\b/.test(text)) return "Serie A";
  if (/\b(formula 1|f1)\b/.test(text)) return "Formula 1";
  if (/\b(indycar|indy car)\b/.test(text)) return "IndyCar";
  if (text.includes("tour de france")) return "Tour de France";
  if (text.includes("giro d'italia") || /\bgiro\b/.test(text)) return "Giro d'Italia";
  if (/\bnhl\b/.test(text)) return "NHL";
  if (/\bshl\b/.test(text)) return "SHL";
  if (text.includes("vasaloppet")) return "Vasaloppet";

  return undefined;
}
