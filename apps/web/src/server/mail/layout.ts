import "server-only";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function emailLayout({
  appName,
  title,
  intro,
  button,
  footer,
}: {
  appName: string;
  title: string;
  intro: string;
  button: { label: string; url: string };
  footer: string;
}) {
  const url = escapeHtml(button.url);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f6f3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f3;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;font-family:${FONT};color:#14171f;">
            <tr>
              <td style="padding:0 4px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:#4338ca;border-radius:8px;color:#ffffff;font-size:16px;font-weight:700;line-height:28px;">^</td>
                    <td style="padding-left:10px;font-size:15px;font-weight:700;">${escapeHtml(appName)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d9d9d2;border-radius:14px;padding:32px;">
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;">${title}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#14171f;">${intro}</p>
                <a href="${url}" style="display:inline-block;background:#4338ca;color:#ffffff;font-size:15px;font-weight:600;line-height:1;padding:14px 22px;border-radius:10px;text-decoration:none;">${escapeHtml(button.label)}</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5b6070;">Or paste this link into your browser:<br><a href="${url}" style="color:#4338ca;word-break:break-all;">${url}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0;font-size:13px;line-height:1.6;color:#5b6070;">${footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
