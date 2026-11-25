import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-2 rounded-lg px-3 py-2.5 text-sm", {
  variants: {
    variant: {
      success: "bg-success-muted text-success-muted-foreground",
      destructive: "bg-destructive-muted text-destructive-muted-foreground",
    },
  },
  defaultVariants: { variant: "success" },
});

const iconPaths = {
  success: "m5.5 8.25 1.75 1.75 3.25-3.5",
  destructive: "M8 4.5v4M8 11h.01",
};

function AlertIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d={path} />
    </svg>
  );
}

function Alert({
  className,
  variant,
  children,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const kind = variant ?? "success";
  return (
    <div
      role={kind === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant: kind }), className)}
      {...props}
    >
      <AlertIcon path={iconPaths[kind]} />
      <div>{children}</div>
    </div>
  );
}

export { Alert };
