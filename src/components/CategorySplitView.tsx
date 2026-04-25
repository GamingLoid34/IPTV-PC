import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type SplitCategory = {
  id: string;
  name: string;
  count?: number;
};

type CategorySplitViewProps = {
  categories: SplitCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  searchPlaceholder: string;
  emptyStateMessage: string;
  children: ReactNode;
};

const STORAGE_KEY = "iptv-pc:split-view-width";
const DEFAULT_WIDTH_PERCENT = 30;
const MIN_WIDTH_PERCENT = 20;
const MAX_WIDTH_PERCENT = 50;

export function CategorySplitView({
  categories,
  selectedCategoryId,
  onSelectCategory,
  searchPlaceholder,
  emptyStateMessage,
  children,
}: CategorySplitViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelWidthPercent, setPanelWidthPercent] = useState(DEFAULT_WIDTH_PERCENT);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    if (parsed < MIN_WIDTH_PERCENT || parsed > MAX_WIDTH_PERCENT) return;
    setPanelWidthPercent(parsed);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;

      const xInside = event.clientX - rect.left;
      const rawPercent = (xInside / rect.width) * 100;
      const clamped = Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, rawPercent));
      setPanelWidthPercent(clamped);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, String(panelWidthPercent));
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, panelWidthPercent]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    if (!normalizedQuery) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(normalizedQuery));
  }, [categories, normalizedQuery]);

  return (
    <div
      ref={containerRef}
      className="flex h-[calc(100vh-72px)] w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/40"
    >
      <aside
        className="shrink-0 overflow-y-auto border-r border-zinc-700 p-3"
        style={{ width: `${panelWidthPercent}%` }}
      >
        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500"
          />
          {normalizedQuery && (
            <p className="text-xs text-zinc-400">
              {filteredCategories.length} av {categories.length} kategorier
            </p>
          )}
        </div>

        <ul className="mt-3 space-y-1">
          {filteredCategories.map((category) => {
            const isSelected = selectedCategoryId === category.id;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm transition ${
                    isSelected
                      ? "bg-blue-600/20 text-blue-100"
                      : "text-zinc-200 hover:bg-zinc-700/70 hover:text-white"
                  }`}
                >
                  <span className="truncate">{category.name}</span>
                  {typeof category.count === "number" && (
                    <span className="text-xs text-zinc-400">{category.count}</span>
                  )}
                </button>
              </li>
            );
          })}
          {filteredCategories.length === 0 && (
            <li className="rounded border border-zinc-700 bg-zinc-900/40 px-2 py-2 text-sm text-zinc-400">
              Inga kategorier matchade.
            </li>
          )}
        </ul>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={() => setIsDragging(true)}
        className="group relative w-1 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-zinc-700"
      >
        <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-600 group-hover:bg-zinc-400" />
      </div>

      <section className="flex-1 overflow-y-auto p-4">
        {selectedCategoryId ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-400">{emptyStateMessage}</p>
          </div>
        )}
      </section>
    </div>
  );
}
