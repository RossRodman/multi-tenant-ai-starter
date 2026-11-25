import { describe, expect, it, vi } from "vitest";

import { getBillingAccount } from "../src";
import { fakeStripe } from "./helpers";

function stripeWith({
  customer,
  methods = [],
  invoices = [],
}: {
  customer: object;
  methods?: object[];
  invoices?: object[];
}) {
  const retrieve = vi.fn(() => Promise.resolve(customer));
  const stripe = fakeStripe({
    customers: { retrieve },
    paymentMethods: { list: vi.fn(() => Promise.resolve({ data: methods })) },
    invoices: { list: vi.fn(() => Promise.resolve({ data: invoices })) },
  });
  return { stripe, retrieve };
}

const card = { brand: "visa", last4: "4242", exp_month: 8, exp_year: 2028 };

describe("getBillingAccount", () => {
  it("maps the default card, email and invoices", async () => {
    const { stripe } = stripeWith({
      customer: {
        email: "billing@acme.test",
        invoice_settings: { default_payment_method: { card } },
      },
      invoices: [
        {
          id: "in_1",
          created: 1_800_000_000,
          total: 1900,
          currency: "usd",
          status: "paid",
          invoice_pdf: "https://pay.stripe.test/in_1.pdf",
          hosted_invoice_url: "https://pay.stripe.test/in_1",
        },
        { id: "in_2", created: 1_800_000_100, total: 0, currency: "usd", status: "draft" },
        {
          id: "in_3",
          created: 1_790_000_000,
          total: 1900,
          currency: "usd",
          status: "open",
          invoice_pdf: null,
          hosted_invoice_url: "https://pay.stripe.test/in_3",
        },
      ],
    });

    expect(await getBillingAccount({ stripe, customerId: "cus_1" })).toEqual({
      email: "billing@acme.test",
      card: { brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
      invoices: [
        {
          id: "in_1",
          date: "2027-01-15T08:00:00.000Z",
          amount: 1900,
          currency: "usd",
          status: "paid",
          pdfUrl: "https://pay.stripe.test/in_1.pdf",
        },
        {
          id: "in_3",
          date: "2026-09-21T14:13:20.000Z",
          amount: 1900,
          currency: "usd",
          status: "open",
          pdfUrl: "https://pay.stripe.test/in_3",
        },
      ],
    });
  });

  it("falls back to the first card on file", async () => {
    const { stripe } = stripeWith({
      customer: { email: null, invoice_settings: { default_payment_method: null } },
      methods: [{ card }],
    });
    expect((await getBillingAccount({ stripe, customerId: "cus_1" })).card?.last4).toBe("4242");
  });

  it("returns no card and no invoices for a new customer", async () => {
    const { stripe } = stripeWith({
      customer: { email: "new@acme.test", invoice_settings: { default_payment_method: null } },
    });
    expect(await getBillingAccount({ stripe, customerId: "cus_1" })).toEqual({
      email: "new@acme.test",
      card: null,
      invoices: [],
    });
  });

  it("treats a deleted customer as empty", async () => {
    const { stripe } = stripeWith({ customer: { id: "cus_1", deleted: true } });
    expect(await getBillingAccount({ stripe, customerId: "cus_1" })).toEqual({
      email: null,
      card: null,
      invoices: [],
    });
  });
});
