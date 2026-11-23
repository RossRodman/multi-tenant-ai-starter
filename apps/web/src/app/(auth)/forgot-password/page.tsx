import Link from "next/link";

import { redirectIfSignedIn } from "@/server/session";

import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight font-semibold">Reset your password</h1>
      <ForgotPasswordForm />
      <p className="text-sm text-muted-foreground">
        <Link href="/sign-in" className="text-ring underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
