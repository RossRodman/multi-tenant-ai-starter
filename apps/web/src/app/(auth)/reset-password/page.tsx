import { redirect } from "next/navigation";

import { DEFAULT_NEXT, isRecoverySession } from "@/server/auth";
import { currentUser } from "@/server/session";
import { getRecoveryMarker } from "@/server/supabase/recovery";

import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!isRecoverySession(user, await getRecoveryMarker())) redirect(DEFAULT_NEXT);

  return (
    <>
      <h1 className="text-[1.75rem] leading-tight font-semibold">Set a new password</h1>
      <ResetPasswordForm />
    </>
  );
}
