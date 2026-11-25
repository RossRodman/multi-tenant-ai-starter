import "server-only";

import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";

import { getServerEnv } from "../env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const SMTP_TIMEOUT_MS = 10_000;

let transport: Transporter | undefined;

function getTransport() {
  transport ??= createTransport({
    url: getServerEnv().smtpUrl,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  return transport;
}

export async function sendMail(mail: Mail): Promise<{ ok: true } | { ok: false }> {
  const transporter = getTransport();
  const { mailFrom } = getServerEnv();
  try {
    await transporter.sendMail({ from: mailFrom, ...mail });
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    console.error("Mail not sent", { code });
    return { ok: false };
  }
}
