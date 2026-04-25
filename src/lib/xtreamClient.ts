import type { XtreamCredentials } from "@/types/xtream";

const XTREAM_USER_AGENT = "Lavf/60.3.100";

export type XtreamApiSuccess<T> = {
  ok: true;
  data: T;
};

export type XtreamApiFailure = {
  ok: false;
  status: number;
  error: string;
};

export type XtreamApiResult<T> = XtreamApiSuccess<T> | XtreamApiFailure;

type XtreamApiOptions = {
  expectedShape?: "array" | "object";
};

export async function callXtreamApi<T = unknown[]>(
  credentials: XtreamCredentials,
  action: string,
  extraParams: Record<string, string> = {},
  options: XtreamApiOptions = {}
): Promise<XtreamApiResult<T>> {
  const expectedShape = options.expectedShape ?? "array";
  const base = credentials.serverUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({
    username: credentials.username.trim(),
    password: credentials.password,
    action,
    ...extraParams,
  });
  const xtreamUrl = `${base}/player_api.php?${params.toString()}`;

  let upstream: Response;
  try {
    upstream = await fetch(xtreamUrl, {
      method: "GET",
      headers: { "User-Agent": XTREAM_USER_AGENT },
    });
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Kunde inte nå Xtream-servern",
    };
  }

  if (!upstream.ok) {
    return {
      ok: false,
      status: 502,
      error: `Anslutning avvisades (HTTP ${upstream.status})`,
    };
  }

  let parsed: unknown;
  try {
    const text = await upstream.text();
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Servern returnerade ogiltig data",
    };
  }

  if (expectedShape === "array" && !Array.isArray(parsed)) {
    return {
      ok: false,
      status: 401,
      error: "Fel användarnamn eller lösenord",
    };
  }

  if (
    expectedShape === "object" &&
    (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    return {
      ok: false,
      status: 401,
      error: "Fel användarnamn eller lösenord",
    };
  }

  return {
    ok: true,
    data: parsed as T,
  };
}
