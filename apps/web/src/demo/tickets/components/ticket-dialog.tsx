"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { Icon } from "./icon";

export function TicketDialog({
  title,
  description,
  closeHref,
  children,
}: {
  title: string;
  description: string;
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref as Route, { scroll: false });
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(20_23_31/0.48)] dark:bg-black/70" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-6 pt-24 pb-6">
          <DialogPrimitive.Content className="pointer-events-auto flex w-full max-w-[540px] flex-col gap-5 rounded-2xl border border-transparent bg-background p-7 shadow-[0_24px_64px_rgb(20_23_31/0.28)] outline-none dark:border-input dark:bg-muted">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <DialogPrimitive.Title className="text-xl font-bold">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm leading-normal text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Icon>
                  <path d="M5 5l10 10M15 5L5 15" />
                </Icon>
              </DialogPrimitive.Close>
            </div>
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
