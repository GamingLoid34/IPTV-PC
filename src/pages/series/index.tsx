import { useEffect } from "react";
import { useRouter } from "next/router";
import { loadPlaylist } from "@/lib/playlistStorage";

export default function SeriesIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const credentials = loadPlaylist();
    if (!credentials) {
      void router.replace("/");
    }
  }, [router]);

  return (
    <main className="px-4 py-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-800/80 p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-zinc-100">Serier</h1>
        <p className="mt-2 text-sm text-zinc-300">Kommer snart.</p>
      </div>
    </main>
  );
}
