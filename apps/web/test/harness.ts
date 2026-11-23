import { createServerClient, createSessionlessClient } from "@repo/db";

import { hardenCookies } from "../src/server/supabase/cookies";
import type { SessionCookie } from "../src/server/supabase/cookies";
import { env } from "./env";

export const PASSWORD = "correct-horse-battery";

export function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Expected at least one item");
  return item;
}

export function uniqueEmail(label: string) {
  return `${label}-${crypto.randomUUID()}@example.com`;
}

export function createJar(initial: { name: string; value: string }[] = []) {
  const store = new Map<string, SessionCookie>(initial.map((c) => [c.name, { ...c, options: {} }]));
  const written: SessionCookie[] = [];
  return {
    cookies: store,
    written,
    adapter: {
      getAll: () => [...store.values()].map(({ name, value }) => ({ name, value })),
      setAll: (cookies: SessionCookie[]) => {
        for (const cookie of hardenCookies(appUrl.current, cookies)) {
          written.push(cookie);
          if (cookie.value === "") store.delete(cookie.name);
          else store.set(cookie.name, cookie);
        }
      },
    },
  };
}

export const appUrl = { current: "http://localhost:3000" };

export function createTestClient(jar = createJar()) {
  return {
    jar,
    client: createServerClient({
      url: env.url,
      key: env.publishableKey,
      cookies: jar.adapter,
    }),
  };
}

export function createEmailClient() {
  return createSessionlessClient({ url: env.url, key: env.publishableKey });
}

interface MailpitSummary {
  ID: string;
}

export async function waitForEmail(to: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = await findEmails(to);
    const latest = messages.at(0);
    if (latest) return latest;
    if (Date.now() > deadline) throw new Error(`No email for ${to}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

export async function findEmails(to: string): Promise<{ id: string; html: string }[]> {
  const search = await fetch(
    `${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  );
  const body = (await search.json()) as { messages: MailpitSummary[] };
  return Promise.all(
    body.messages.map(async ({ ID }) => {
      const res = await fetch(`${env.mailpitUrl}/api/v1/message/${ID}`);
      const message = (await res.json()) as { HTML: string };
      return { id: ID, html: message.HTML };
    }),
  );
}

export function sessionFromCookies(cookies: { name: string; value: string }[]) {
  const chunks = cookies
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const joined = chunks.map((c) => c.value).join("");
  const raw = joined.startsWith("base64-")
    ? Buffer.from(joined.slice(7), "base64url").toString()
    : joined;
  return {
    baseName: first(chunks).name.replace(/\.\d+$/, ""),
    session: JSON.parse(raw) as { access_token: string; refresh_token: string },
  };
}

export function sessionCookie(name: string, session: object) {
  return { name, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` };
}

export function extractLink(html: string) {
  const href = /href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error("No link in email");
  const url = new URL(href.replaceAll("&amp;", "&"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (!tokenHash || !type) throw new Error(`Unexpected link ${href}`);
  return { url, tokenHash, type };
}
