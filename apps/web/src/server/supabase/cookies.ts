import "server-only";

export interface SessionCookie {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

export function sessionCookieOptions(appUrl: string, options: Record<string, unknown> = {}) {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: new URL(appUrl).protocol === "https:",
  };
}

export function hardenCookies(appUrl: string, cookies: SessionCookie[]): SessionCookie[] {
  return cookies.map((cookie) => ({
    ...cookie,
    options: sessionCookieOptions(appUrl, cookie.options),
  }));
}
