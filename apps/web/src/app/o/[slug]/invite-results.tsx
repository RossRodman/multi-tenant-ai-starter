import type { InviteFormState } from "./form-state";
import { inviteResultLabels } from "./form-state";

export function InviteResults({ results }: { results: NonNullable<InviteFormState["results"]> }) {
  return (
    <ul className="flex flex-col divide-y divide-input rounded-md border border-input bg-background">
      {results.map(({ email, result }, index) => (
        <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{email}</span>
          <span className={result === "sent" ? "shrink-0" : "shrink-0 text-destructive"}>
            {inviteResultLabels[result]}
          </span>
        </li>
      ))}
    </ul>
  );
}
