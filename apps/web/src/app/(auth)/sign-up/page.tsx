import Link from "next/link";

import { redirectIfSignedIn } from "@/server/session";

import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage() {
  await redirectIfSignedIn();

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight font-semibold">Create account</h1>
      <SignUpForm />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-ring underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
