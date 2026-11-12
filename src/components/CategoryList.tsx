import Link from "next/link";
import type { XtreamCategory } from "@/types/xtream";

type CategoryListProps = {
  serverUrl: string;
  categories: XtreamCategory[];
  hrefBasePath: string;
  countLabel?: string;
};

export function CategoryList({
  serverUrl,
  categories,
  hrefBasePath,
  countLabel = "kategorier",
}: CategoryListProps) {
  return (
    <div className="space-y-4 text-sm text-zinc-200">
      <h2 className="text-left text-sm font-medium text-zinc-100">
        Ansluten till <span className="break-all text-zinc-300">{serverUrl}</span>
      </h2>
      <p className="text-zinc-400">
        {categories.length} {countLabel}
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-zinc-700 p-2">
        {categories.map((c) => (
          <li key={String(c.category_id)}>
            <Link
              href={`${hrefBasePath}/${c.category_id}`}
              className="block cursor-pointer rounded px-2 py-1 text-zinc-200 transition hover:bg-zinc-700/70 hover:text-white"
            >
              {c.category_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
