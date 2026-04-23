import { type FormEvent, type ChangeEvent } from "react";
import type { XtreamCredentials } from "@/types/xtream";

type FormState = XtreamCredentials;

type LoginFormProps = {
  form: FormState;
  isLoading: boolean;
  error: string | null;
  onFieldChange: (field: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

export function LoginForm({
  form,
  isLoading,
  error,
  onFieldChange,
  onSubmit,
}: LoginFormProps) {
  return (
    <>
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <label
            htmlFor="serverUrl"
            className="block text-sm font-medium text-zinc-200"
          >
            Server URL
          </label>
          <input
            id="serverUrl"
            name="serverUrl"
            type="url"
            autoComplete="url"
            placeholder="http://server.example.com"
            value={form.serverUrl}
            onChange={onFieldChange("serverUrl")}
            disabled={isLoading}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="username"
            className="block text-sm font-medium text-zinc-200"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={onFieldChange("username")}
            disabled={isLoading}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-200"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={onFieldChange("password")}
            disabled={isLoading}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Ansluter..." : "Anslut"}
        </button>
      </form>

      {isLoading && (
        <p className="text-center text-sm text-zinc-300">Ansluter...</p>
      )}

      {error && (
        <p className="text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
