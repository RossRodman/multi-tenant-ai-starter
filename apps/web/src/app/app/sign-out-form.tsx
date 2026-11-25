import { Button } from "@/components/ui/button";

import { signOutAction } from "../(auth)/actions";

export function SignOutForm() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" className="w-auto shrink-0 px-3 whitespace-nowrap">
        Sign out
      </Button>
    </form>
  );
}
