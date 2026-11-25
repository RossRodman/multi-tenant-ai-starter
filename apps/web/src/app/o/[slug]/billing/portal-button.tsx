import type { ComponentProps } from "react";

import { SubmitButton } from "@/app/(auth)/auth-ui";
import type { PortalIntent } from "@/lib/billing";
import { cn } from "@/lib/utils";

import { openPortalAction } from "./actions";

export function PortalButton({
  slug,
  intent,
  variant = "outline",
  className,
  children,
}: {
  slug: string;
  intent: PortalIntent;
  variant?: "default" | "outline";
  className?: string;
  children: ComponentProps<typeof SubmitButton>["children"];
}) {
  return (
    <form action={openPortalAction.bind(null, slug, intent)}>
      <SubmitButton
        pendingLabel="Opening..."
        variant={variant}
        className={cn("h-11 w-auto px-4 text-[15px] font-semibold", className)}
      >
        {children}
      </SubmitButton>
    </form>
  );
}
