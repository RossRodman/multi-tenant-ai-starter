import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/session";

import { signOutAction } from "../(auth)/actions";

export default async function AppHomePage() {
  const user = await requireUser();

  return (
    <PageShell>
      <h1 className="text-[1.75rem] leading-tight font-semibold">Signed in</h1>
      <p className="text-muted-foreground">{user.email}</p>
      <form action={signOutAction}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </PageShell>
  );
}
