import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { TopNav } from "@/components/TopNav";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showTopNav = router.pathname !== "/";

  return (
    <div className="min-h-screen bg-gray-900 text-zinc-100">
      {showTopNav && <TopNav />}
      <Component {...pageProps} />
    </div>
  );
}
