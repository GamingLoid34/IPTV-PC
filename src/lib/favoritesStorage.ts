export type FavoriteType = "live" | "movies" | "series";

export type FavoriteEntry = {
  id: number;
  name: string;
  addedAt: number;
};

export type Favorites = {
  live: FavoriteEntry[];
  movies: FavoriteEntry[];
  series: FavoriteEntry[];
};

const FAVORITES_KEY = "iptv-pc:favorites";

function emptyFavorites(): Favorites {
  return {
    live: [],
    movies: [],
    series: [],
  };
}

function sanitizeEntries(value: unknown): FavoriteEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return (
        typeof row.id === "number" &&
        Number.isFinite(row.id) &&
        typeof row.name === "string" &&
        row.name.trim() !== "" &&
        typeof row.addedAt === "number" &&
        Number.isFinite(row.addedAt)
      );
    })
    .map((item) => {
      const row = item as FavoriteEntry;
      return {
        id: Math.trunc(row.id),
        name: row.name.trim(),
        addedAt: row.addedAt,
      };
    });
}

export function loadFavorites(): Favorites {
  if (typeof window === "undefined") return emptyFavorites();
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return emptyFavorites();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyFavorites();
    const obj = parsed as Record<string, unknown>;
    return {
      live: sanitizeEntries(obj.live),
      movies: sanitizeEntries(obj.movies),
      series: sanitizeEntries(obj.series),
    };
  } catch {
    return emptyFavorites();
  }
}

export function saveFavorites(favs: Favorites): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {
    // best effort
  }
}

export function addFavorite(type: FavoriteType, entry: FavoriteEntry): void {
  const favs = loadFavorites();
  const deduped = favs[type].filter((x) => x.id !== entry.id);
  favs[type] = [entry, ...deduped];
  saveFavorites(favs);
}

export function removeFavorite(type: FavoriteType, id: number): void {
  const favs = loadFavorites();
  favs[type] = favs[type].filter((x) => x.id !== id);
  saveFavorites(favs);
}

export function isFavorite(type: FavoriteType, id: number): boolean {
  const favs = loadFavorites();
  return favs[type].some((x) => x.id === id);
}

export function getFavorites(type: FavoriteType): FavoriteEntry[] {
  return [...loadFavorites()[type]].sort((a, b) => b.addedAt - a.addedAt);
}
