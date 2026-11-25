import type { ReactNode } from "react";

export function OnboardingCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: ReactNode; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-input bg-background p-6 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
