import type { XtreamCategory } from "@/types/xtream";

type CategoryListProps = {
  serverUrl: string;
  categories: XtreamCategory[];
  onForget: () => void;
};

export function CategoryList({
  serverUrl,
  categories,
  onForget,
}: CategoryListProps) {
  return (
    <div className="space-y-4 text-sm text-zinc-200">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-left text-sm font-medium text-zinc-100">
          Ansluten till <span className="break-all text-zinc-300">{serverUrl}</span>
        </h2>
        <button
          type="button"
          onClick={onForget}
          className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Glöm spellista
        </button>
      </div>
      <p className="text-zinc-400">{categories.length} kategorier</p>
      <ul className="max-h-48 list-inside list-disc space-y-1 overflow-y-auto rounded border border-zinc-700 p-2">
        {categories.map((c) => (
          <li key={String(c.category_id)}>{c.category_name}</li>
        ))}
      </ul>
    </div>
  );
}
