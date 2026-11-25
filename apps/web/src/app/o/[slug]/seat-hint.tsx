"use client";

import type { Route } from "next";
import Link from "next/link";

import type { SeatUsage } from "@/lib/billing";
import { seatsFull } from "@/lib/billing";
import { memberCountLabel } from "@/lib/format";

export function countFilled(form: HTMLFormElement) {
  return new FormData(form)
    .getAll("email")
    .filter((value) => typeof value === "string" && value.trim() !== "").length;
}

export function seatsBlocked(seats: SeatUsage, filled: number) {
  return seats.limit !== null && (seatsFull(seats) || seats.used + filled > seats.limit);
}

export function SeatHint({
  seats,
  filled,
  slug,
  isOwner,
}: {
  seats: SeatUsage;
  filled: number;
  slug: string;
  isOwner: boolean;
}) {
  if (seats.limit === null) return null;

  if (seatsFull(seats)) {
    return (
      <p role="status" className="text-sm text-destructive">
        {String(seats.used)} of {String(seats.limit)} seats used.{" "}
        {isOwner ? (
          <Link
            href={`/o/${slug}/billing` as Route}
            className="font-semibold underline-offset-4 hover:underline"
          >
            Upgrade to invite more
          </Link>
        ) : (
          "Ask an owner to upgrade."
        )}
      </p>
    );
  }

  if (filled === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {String(seats.used)} of {String(seats.limit)} seats used.
      </p>
    );
  }

  const after = seats.used + filled;
  const over = after > seats.limit;
  return (
    <p
      role="status"
      className={over ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
    >
      This adds {memberCountLabel(filled)}. You will use {String(after)} of {String(seats.limit)}{" "}
      seats.
      {over ? (
        <>
          {" "}
          {isOwner ? (
            <Link
              href={`/o/${slug}/billing` as Route}
              className="font-semibold underline-offset-4 hover:underline"
            >
              Upgrade to invite more
            </Link>
          ) : (
            "Ask an owner to upgrade."
          )}
        </>
      ) : null}
    </p>
  );
}
