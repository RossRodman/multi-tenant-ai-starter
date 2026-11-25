import "server-only";

export const WINDOW_MS = 15 * 60 * 1000;
export const IP_LIMIT = 30;
export const IP_EMAIL_LIMIT = 5;
export const ORG_CREATE_LIMIT = 10;
const ORG_CREATE_WINDOW_MS = 60 * 60 * 1000;
export const INVITE_LIMIT = 50;
const INVITE_WINDOW_MS = 60 * 60 * 1000;

const SWEEP_ABOVE = 10_000;

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  hit(key: string): { ok: boolean };
  take(key: string, n: number): { ok: boolean };
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const windows = new Map<string, Window>();

  function sweep(time: number) {
    if (windows.size <= SWEEP_ABOVE) return;
    for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
  }

  function liveWindow(key: string, time: number) {
    sweep(time);
    const current = windows.get(key);
    return current && current.resetAt > time ? current : undefined;
  }

  return {
    hit(key) {
      const time = now();
      const current = liveWindow(key, time);
      if (!current) {
        windows.set(key, { count: 1, resetAt: time + windowMs });
        return { ok: true };
      }
      current.count += 1;
      return { ok: current.count <= limit };
    },

    take(key, n) {
      const time = now();
      const current = liveWindow(key, time);
      const count = current?.count ?? 0;
      if (count + n > limit) return { ok: false };
      windows.set(key, { count: count + n, resetAt: current?.resetAt ?? time + windowMs });
      return { ok: true };
    },
  };
}

export function createAuthLimiter(now?: () => number) {
  const perIp = createRateLimiter({ limit: IP_LIMIT, windowMs: WINDOW_MS, now });
  const perIpAndEmail = createRateLimiter({ limit: IP_EMAIL_LIMIT, windowMs: WINDOW_MS, now });

  return {
    allow(ip: string, email?: string) {
      if (!perIp.hit(ip).ok) return false;
      return email === undefined || perIpAndEmail.hit(`${ip}|${email}`).ok;
    },
  };
}

export const authLimiter = createAuthLimiter();

export const orgCreateLimiter = createRateLimiter({
  limit: ORG_CREATE_LIMIT,
  windowMs: ORG_CREATE_WINDOW_MS,
});

export const inviteLimiter = createRateLimiter({
  limit: INVITE_LIMIT,
  windowMs: INVITE_WINDOW_MS,
});

export function clientIp(headers: Headers, trustedProxyHops: number) {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return hops[Math.max(0, hops.length - trustedProxyHops)] ?? "unknown";
}
