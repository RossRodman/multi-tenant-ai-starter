import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabase = vi.fn(() => Promise.resolve({}));
const getOrganization = vi.fn();
const requireUser = vi.fn();
const startCheckout = vi.fn();
const startPortal = vi.fn();
const getBilling = vi.fn();
const isBillingConfigured = vi.fn();

vi.mock("@/server/session", () => ({ requireUser }));
vi.mock("@/server/supabase/client", () => ({ getSupabase }));
vi.mock("@/server/organizations", () => ({ getOrganization }));
vi.mock("@/server/billing", () => ({
  startCheckout,
  startPortal,
  getBilling,
  isBillingConfigured,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { openPortalAction, startCheckoutAction } =
  await import("../src/app/o/[slug]/billing/actions");

const organization = { id: "org-1", name: "Acme", slug: "acme", role: "owner" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "user-1", email: "owner@example.com" });
  getOrganization.mockResolvedValue(organization);
  isBillingConfigured.mockReturnValue(true);
  startCheckout.mockResolvedValue("https://checkout.stripe.test/s");
  startPortal.mockResolvedValue("https://portal.stripe.test/p");
  getBilling.mockResolvedValue({ subscription: { id: "sub_1" } });
});

describe("startCheckoutAction", () => {
  it("sends an owner to Stripe Checkout", async () => {
    await expect(startCheckoutAction("acme", "pro", "month")).rejects.toThrow(
      "redirect:https://checkout.stripe.test/s",
    );
    expect(startCheckout).toHaveBeenCalledWith(
      organization,
      { email: "owner@example.com" },
      "pro",
      "month",
    );
  });

  it.each(["admin", "member"])("refuses a %s without calling billing", async (role) => {
    getOrganization.mockResolvedValue({ ...organization, role });
    await expect(startCheckoutAction("acme", "pro", "month")).rejects.toThrow(
      "redirect:/o/acme/billing?status=forbidden",
    );
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("sends a non-member to the chooser", async () => {
    getOrganization.mockResolvedValue(null);
    await expect(startCheckoutAction("acme", "pro", "month")).rejects.toThrow("redirect:/app");
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ["free", "month"],
    ["enterprise", "month"],
    ["pro", "weekly"],
  ])("rejects plan %s with interval %s", async (plan, interval) => {
    await expect(startCheckoutAction("acme", plan, interval)).rejects.toThrow(
      "redirect:/o/acme/billing?status=unknown",
    );
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("rejects a slug that is not a slug", async () => {
    await expect(startCheckoutAction("../x", "pro", "month")).rejects.toThrow("redirect:/app");
    expect(getOrganization).not.toHaveBeenCalled();
  });

  it("reports missing billing configuration before calling Stripe", async () => {
    isBillingConfigured.mockReturnValue(false);
    await expect(startCheckoutAction("acme", "pro", "month")).rejects.toThrow(
      "status=not_configured",
    );
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("reports a Stripe failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    startCheckout.mockRejectedValue(new Error("boom"));
    await expect(startCheckoutAction("acme", "pro", "month")).rejects.toThrow("status=unknown");
    error.mockRestore();
  });
});

describe("openPortalAction", () => {
  it("opens the portal home", async () => {
    await expect(openPortalAction("acme", { kind: "manage" })).rejects.toThrow(
      "redirect:https://portal.stripe.test/p",
    );
    expect(startPortal).toHaveBeenCalledWith(organization, { kind: "manage" }, "sub_1");
  });

  it("opens a plan change with the plan and interval", async () => {
    await expect(
      openPortalAction("acme", { kind: "change", plan: "team", interval: "year" }),
    ).rejects.toThrow("redirect:https");
    expect(startPortal).toHaveBeenCalledWith(
      organization,
      { kind: "change", plan: "team", interval: "year" },
      "sub_1",
    );
  });

  it("opens the cancel and payment method flows", async () => {
    await expect(openPortalAction("acme", { kind: "cancel" })).rejects.toThrow("redirect:https");
    await expect(openPortalAction("acme", { kind: "payment_method" })).rejects.toThrow(
      "redirect:https",
    );
    expect(startPortal).toHaveBeenNthCalledWith(1, organization, { kind: "cancel" }, "sub_1");
    expect(startPortal).toHaveBeenNthCalledWith(
      2,
      organization,
      { kind: "payment_method" },
      "sub_1",
    );
  });

  it.each([
    { kind: "change", plan: "free", interval: "month" },
    { kind: "change", plan: "pro", interval: "weekly" },
    { kind: "change", plan: "price_123", interval: "month" },
    { kind: "refund" },
    "manage",
    null,
  ])("rejects intent %j", async (intent) => {
    await expect(openPortalAction("acme", intent)).rejects.toThrow("status=unknown");
    expect(startPortal).not.toHaveBeenCalled();
  });

  it.each(["admin", "member"])("refuses a %s without calling billing", async (role) => {
    getOrganization.mockResolvedValue({ ...organization, role });
    await expect(openPortalAction("acme", { kind: "manage" })).rejects.toThrow("status=forbidden");
    expect(startPortal).not.toHaveBeenCalled();
    expect(getBilling).not.toHaveBeenCalled();
  });

  it("explains when there is nothing to change", async () => {
    startPortal.mockResolvedValue(null);
    await expect(openPortalAction("acme", { kind: "cancel" })).rejects.toThrow(
      "status=no_subscription",
    );
  });
});
