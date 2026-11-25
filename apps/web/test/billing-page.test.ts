import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const requireUser = vi.fn();
const currentOrganization = vi.fn();
const getBilling = vi.fn();
const loadBillingAccount = vi.fn();
const completeCheckout = vi.fn();
const isBillingConfigured = vi.fn();

vi.mock("@/server/session", () => ({ requireUser }));
vi.mock("@/server/supabase/client", () => ({ getSupabase: () => Promise.resolve({}) }));
vi.mock("@/server/organizations", () => ({ currentOrganization, getOrganization: vi.fn() }));
vi.mock("@/server/billing", () => ({
  completeCheckout,
  getBilling,
  isBillingConfigured,
  loadBillingAccount,
  startCheckout: vi.fn(),
  startPortal: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { default: BillingPage } = await import("../src/app/o/[slug]/billing/page");

const organization = { id: "org-1", name: "Acme", slug: "acme" };
const subscription = {
  id: "sub_1",
  interval: "month",
  status: "active",
  cancel_at_period_end: false,
  current_period_end: "2026-12-25T00:00:00Z",
};
const seats = { used: 2, members: 2, pending: 0, limit: 10 };

function render(searchParams: Record<string, string | string[]> = {}) {
  return BillingPage({
    params: Promise.resolve({ slug: "acme" }),
    searchParams: Promise.resolve(searchParams),
  }).then(renderToStaticMarkup);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "user-1" });
  isBillingConfigured.mockReturnValue(true);
  getBilling.mockResolvedValue({ plan: "pro", subscription, seats });
  loadBillingAccount.mockResolvedValue({
    email: "billing@acme.test",
    card: { brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
    invoices: [
      {
        id: "in_1",
        date: "2026-11-25T00:00:00Z",
        amount: 1900,
        currency: "usd",
        status: "paid",
        pdfUrl: "https://pay.stripe.test/in_1.pdf",
      },
    ],
  });
});

describe("billing page", () => {
  it("shows an admin the account without any action", async () => {
    currentOrganization.mockResolvedValue({ ...organization, role: "admin" });

    const html = await render();

    expect(html).toContain("Visa ending 4242");
    expect(html).toContain("billing@acme.test");
    expect(html).toContain("https://pay.stripe.test/in_1.pdf");
    expect(html).toContain("Only owners can change the plan or payment details.");
    expect(html).not.toContain("<form");
    for (const label of ["Manage in Stripe", "Update payment method", "Change email", "Upgrade"]) {
      expect(html).not.toContain(label);
    }
  });

  it("gives an owner the actions", async () => {
    currentOrganization.mockResolvedValue({ ...organization, role: "owner" });

    const html = await render();

    for (const label of [
      "Manage in Stripe",
      "Update payment method",
      "Change email",
      "Upgrade",
      "Downgrade",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("hides Downgrade to Free when the subscription already cancels", async () => {
    currentOrganization.mockResolvedValue({ ...organization, role: "owner" });
    getBilling.mockResolvedValue({
      plan: "pro",
      subscription: { ...subscription, cancel_at_period_end: true },
      seats,
    });

    expect(await render()).not.toContain("Downgrade");
  });

  it("is not found for a member", async () => {
    currentOrganization.mockResolvedValue({ ...organization, role: "member" });
    await expect(render()).rejects.toThrow("not-found");
    expect(loadBillingAccount).not.toHaveBeenCalled();
  });

  it("completes a Checkout return for an owner", async () => {
    currentOrganization.mockResolvedValue({ ...organization, role: "owner" });
    await expect(render({ session_id: "cs_test_a1B2" })).rejects.toThrow(
      "redirect:/o/acme/billing",
    );
    expect(completeCheckout).toHaveBeenCalledWith("cs_test_a1B2", expect.anything());
  });

  it.each([["not-a-session"], [["cs_test_a", "cs_test_b"]]])(
    "ignores the session id %j",
    async (sessionId) => {
      currentOrganization.mockResolvedValue({ ...organization, role: "owner" });
      await expect(render({ session_id: sessionId })).rejects.toThrow("redirect:/o/acme/billing");
      expect(completeCheckout).not.toHaveBeenCalled();
    },
  );
});
