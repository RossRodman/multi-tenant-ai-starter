import { APP_NAME } from "@/lib/brand";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-3.5"
        >
          <path d="m3.5 11 4.5-6 4.5 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm font-semibold">{APP_NAME}</span>
    </span>
  );
}
