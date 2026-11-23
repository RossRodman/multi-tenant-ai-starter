import "server-only";

export const DEFAULT_NEXT = "/app";

const PROBE_ORIGIN = "http://next.invalid";

function hasUnsafeChar(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x5c || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeNext(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT;
  if (hasUnsafeChar(value)) return DEFAULT_NEXT;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_NEXT;
  }
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith("//")) return DEFAULT_NEXT;

  return url.pathname + url.search + url.hash;
}
