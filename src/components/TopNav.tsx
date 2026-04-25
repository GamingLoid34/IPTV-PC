import Link from "next/link";
import { useRouter } from "next/router";
import { clearPlaylist } from "@/lib/playlistStorage";

const navItems = [
  { href: "/live", label: "Live" },
  { href: "/movies", label: "Filmer" },
  { href: "/series", label: "Serier" },
];

export function TopNav() {
  const router = useRouter();

  const handleForget = () => {
    clearPlaylist();
    void router.replace("/");
  };

  const isActive = (href: string) =>
    router.pathname === href || router.pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-zinc-700 bg-zinc-900/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <nav className="flex items-center gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleForget}
          className="rounded-lg border border-zinc-600 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Glöm spellista
        </button>
      </div>
    </header>
  );
}
