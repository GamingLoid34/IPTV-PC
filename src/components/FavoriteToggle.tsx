import { Star } from "lucide-react";
import { useFavorites } from "@/lib/useFavorites";
import type { FavoriteType } from "@/lib/favoritesStorage";

type FavoriteToggleProps = {
  type: FavoriteType;
  id: number;
  name: string;
  size?: "sm" | "md";
};

export function FavoriteToggle({ type, id, name, size = "sm" }: FavoriteToggleProps) {
  const { isFavorite, toggleFavorite } = useFavorites(type);
  const active = isFavorite(id);
  const iconSize = size === "md" ? 18 : 14;

  return (
    <button
      type="button"
      aria-label={active ? "Ta bort favorit" : "Lägg till favorit"}
      title={active ? "Ta bort favorit" : "Lägg till favorit"}
      onClick={(event) => {
        event.stopPropagation();
        toggleFavorite(id, name);
      }}
      className={`rounded p-1 transition ${
        active ? "text-amber-400 hover:text-amber-300" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <Star size={iconSize} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
