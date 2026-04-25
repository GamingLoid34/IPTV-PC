import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addFavorite as addFavoriteToStorage,
  getFavorites,
  type FavoriteEntry,
  type FavoriteType,
  removeFavorite as removeFavoriteFromStorage,
} from "@/lib/favoritesStorage";

const FAVORITES_CHANGED_EVENT = "favorites-changed";

export function useFavorites(type: FavoriteType) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);

  const reload = useCallback(() => {
    setFavorites(getFavorites(type));
  }, [type]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => reload();
    window.addEventListener(FAVORITES_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, handler);
    };
  }, [reload]);

  const hasId = useMemo(() => new Set(favorites.map((x) => x.id)), [favorites]);

  const isFavorite = useCallback((id: number) => hasId.has(id), [hasId]);

  const toggleFavorite = useCallback(
    (id: number, name: string) => {
      if (isFavorite(id)) {
        removeFavoriteFromStorage(type, id);
      } else {
        addFavoriteToStorage(type, {
          id,
          name,
          addedAt: Date.now(),
        });
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
      }
      reload();
    },
    [isFavorite, reload, type]
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    count: favorites.length,
  };
}
