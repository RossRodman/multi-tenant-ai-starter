import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 w-full items-center justify-center rounded-lg px-4 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-foreground/5",
        link: "h-auto w-auto justify-start p-0 text-sm font-normal text-ring underline-offset-4 hover:underline focus-visible:ring-offset-0",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Button({
  className,
  variant,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { Button, buttonVariants };
