import { useState, type FormEvent, type ChangeEvent } from "react";

type XtreamFormValues = {
  serverUrl: string;
  username: string;
  password: string;
};

const initialValues: XtreamFormValues = {
  serverUrl: "",
  username: "",
  password: "",
};

export default function Home() {
  const [form, setForm] = useState<XtreamFormValues>(initialValues);

  const handleFieldChange = (field: keyof XtreamFormValues) => {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log({
      serverUrl: form.serverUrl,
      username: form.username,
      password: form.password,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 text-zinc-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            IPTV-PC
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Lägg till din Xtream-spellista
          </p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor="serverUrl" className="block text-sm font-medium text-zinc-200">
              Server URL
            </label>
            <input
              id="serverUrl"
              name="serverUrl"
              type="url"
              autoComplete="url"
              placeholder="http://server.example.com"
              value={form.serverUrl}
              onChange={handleFieldChange("serverUrl")}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-zinc-200">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={handleFieldChange("username")}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-zinc-200">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleFieldChange("password")}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
          >
            Anslut
          </button>
        </form>
      </div>
    </div>
  );
}
