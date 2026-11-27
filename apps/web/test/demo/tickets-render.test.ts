import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Highlight } from "../../src/demo/tickets/components/highlight";
import { searchTerms } from "../../src/demo/tickets/format";

const hostile =
  "<script>alert(1)</script> <img src=x onerror=alert(2)> **bold** [link](javascript:x)";

const render = (query: string) =>
  renderToStaticMarkup(
    createElement(
      "span",
      null,
      createElement(Highlight, { text: hostile, terms: searchTerms(query) }),
    ),
  );

describe("ticket text", () => {
  it.each([
    ["without a search", ""],
    ["with highlighted terms", "script img bold link"],
  ])("renders as plain text %s", (_label, query) => {
    const html = render(query);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<strong");
    expect(html).not.toContain("<a ");
    const text = html.replace(/<\/?(mark|span)[^>]*>/g, "");
    expect(text).toContain("&lt;script&gt;");
    expect(text).toContain("**bold**");
  });

  it("wraps matches in mark without changing the text", () => {
    const html = render("bold");
    expect(html).toContain("<mark");
    expect(html.replace(/<\/?(mark|span)[^>]*>/g, "")).toBe(
      renderToStaticMarkup(createElement("span", null, hostile)).replace(/<\/?span>/g, ""),
    );
  });
});
