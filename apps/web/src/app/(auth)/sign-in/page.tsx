import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/server/auth";
import { getServerEnv } from "@/server/env";
import { redirectIfSignedIn } from "@/server/session";

import { GoogleForm } from "./google-form";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  await redirectIfSignedIn();
  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight font-semibold">Sign in</h1>
      {params.error === "oauth" ? (
        <Alert variant="destructive">Google sign-in failed. Try again.</Alert>
      ) : null}
      <SignInForm next={next} />
      {getServerEnv().googleEnabled ? <GoogleForm next={next} /> : null}
      <p className="text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/sign-up" className="text-ring underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}
