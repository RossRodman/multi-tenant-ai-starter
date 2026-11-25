import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn();
const createTransport = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({ createTransport }));
vi.mock("@/server/env", () => ({
  getServerEnv: () => ({
    smtpUrl: "smtp://127.0.0.1:25",
    mailFrom: "Multi-tenant AI Starter <no-reply@localhost>",
  }),
}));

const { invitationEmail, invitationUrl, sendMail } = await import("../src/server/mail");

const mail = { to: "a@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" };

beforeEach(() => {
  sendMailMock.mockReset();
});

describe("sendMail", () => {
  it("sends from the configured address with one transport per process", async () => {
    sendMailMock.mockResolvedValue({});
    expect(await sendMail(mail)).toEqual({ ok: true });
    expect(await sendMail(mail)).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "Multi-tenant AI Starter <no-reply@localhost>",
      ...mail,
    });
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "smtp://127.0.0.1:25",
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      }),
    );
  });

  it("returns ok: false and logs only the error code when sending fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendMailMock.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED smtp://user:secret@host"), {
        code: "ECONNECTION",
      }),
    );
    try {
      expect(await sendMail(mail)).toEqual({ ok: false });
      expect(consoleError).toHaveBeenCalledWith("Mail not sent", { code: "ECONNECTION" });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret");
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("invitationEmail", () => {
  const input = {
    organizationName: `<b>Acme</b> & "Co" 'x'`,
    inviterEmail: `a"<i>@example.com`,
    role: "admin" as const,
    url: "http://localhost:3000/app?invitation=1&x=<y>",
    expiresAt: new Date("2026-12-01T10:00:00Z"),
  };

  it("escapes every interpolated value in the HTML part", () => {
    const { html } = invitationEmail(input);
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<y>");
    expect(html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; &quot;Co&quot; &#39;x&#39;");
    expect(html).toContain("1&amp;x=&lt;y&gt;");
  });

  it("puts the inviter and the organization in the subject, and the raw values in the text", () => {
    const { subject, text } = invitationEmail(input);
    expect(subject).toBe(`${input.inviterEmail} invited you to ${input.organizationName}`);
    expect(text).toContain(input.url);
    expect(text).toContain("December 1, 2026");
  });

  it("builds the link from the configured app URL", () => {
    expect(invitationUrl("https://app.example.com", "abc")).toBe(
      "https://app.example.com/app?invitation=abc",
    );
  });
});
