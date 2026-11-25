import type Stripe from "stripe";

export interface BillingAccount {
  email: string | null;
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  invoices: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    status: string;
    pdfUrl: string | null;
  }[];
}

const INVOICE_LIMIT = 12;

async function defaultCard(stripe: Stripe, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return { email: null, card: null };

  let method = customer.invoice_settings.default_payment_method;
  if (typeof method === "string" || method == null) {
    const { data } = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });
    method = data[0] ?? null;
  }
  const card = method?.card;
  return {
    email: customer.email,
    card: card
      ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year }
      : null,
  };
}

export async function getBillingAccount({
  stripe,
  customerId,
}: {
  stripe: Stripe;
  customerId: string;
}): Promise<BillingAccount> {
  const [{ email, card }, invoices] = await Promise.all([
    defaultCard(stripe, customerId),
    stripe.invoices.list({ customer: customerId, limit: INVOICE_LIMIT }),
  ]);

  return {
    email,
    card,
    invoices: invoices.data
      .filter(({ status }) => status !== "draft")
      .map((invoice) => ({
        id: invoice.id,
        date: new Date(invoice.created * 1000).toISOString(),
        amount: invoice.total,
        currency: invoice.currency,
        status: invoice.status ?? "open",
        pdfUrl: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null,
      })),
  };
}
