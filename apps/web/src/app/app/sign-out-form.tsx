import { Button } from "@/components/ui/button";

import { signOutAction } from "../(auth)/actions";

export function SignOutForm() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" className="w-auto px-3">
        Sign out
      </Button>
    </form>
  );
}
