# multi-tenant-ai-starter

A multi-tenant SaaS starter built with Next.js, Supabase and Stripe, with a Claude-powered agent that respects tenant boundaries.

- Tenant isolation enforced in Postgres with Row Level Security
- Stripe subscriptions driven by verified webhooks
- AI agent whose tools run under the caller's permissions
- Vitest and Playwright suites that prove tenant A never sees tenant B's data
- `AUDIT_CHECKLIST.md` — what to verify in Lovable and other AI-generated code

> Work in progress.
