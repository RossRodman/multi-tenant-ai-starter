import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { OnboardingCard } from "@/components/onboarding-card";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { parseEmailLink } from "@/server/auth";
import type { EmailLink } from "@/server/auth";

import { confirmEmailAction } from "../../(auth)/actions";
import { errorMessages } from "../../(auth)/form-state";

const titles: Record<EmailLink["type"], string> = {
  signup: "Confirm your email",
  email: "Confirm your email",
  magiclink: "Sign in",
  recovery: "Reset your password",
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; email?: string; error?: string }>;
}) {
  const params = await searchParams;
  const link = params.error ? null : parseEmailLink(params);

  return (
    <PageShell>
      <OnboardingCard
        title={link ? titles[link.type] : "Link not valid"}
        description={
          link ? (
            <>
              You&apos;ll be signed in as{" "}
              <span className="font-medium text-foreground">{link.email}</span>
            </>
          ) : undefined
        }
      >
        {link ? (
          <form action={confirmEmailAction} className="flex flex-col gap-4">
            <input type="hidden" name="token_hash" value={link.tokenHash} />
            <input type="hidden" name="type" value={link.type} />
            <input type="hidden" name="email" value={link.email} />
            <Button type="submit">Continue</Button>
          </form>
        ) : (
          <>
            <Alert variant="destructive">
              {errorMessages[params.error === "rate_limited" ? "rate_limited" : "invalid_link"]}
            </Alert>
            <Link href="/sign-in" className="text-sm text-ring underline-offset-4 hover:underline">
              Request a new link
            </Link>
          </>
        )}
      </OnboardingCard>
    </PageShell>
  );
}
