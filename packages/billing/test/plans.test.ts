import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PAID_STATUSES, PLANS, isPaidStatus, planForLookupKey, planRank } from "../src/plans";
import { pgClient } from "./helpers";

beforeAll(async () => {
  await pgClient.connect();
});

afterAll(async () => {
  await pgClient.end();
});

describe("planForLookupKey", () => {
  it.each([
    ["pro_monthly", "pro", "month"],
    ["pro_yearly", "pro", "year"],
    ["team_monthly", "team", "month"],
    ["team_yearly", "team", "year"],
  ])("maps %s", (key, plan, interval) => {
    expect(planForLookupKey(key)).toEqual({ plan, interval });
  });

  it("returns null for an unknown key", () => {
    expect(planForLookupKey("gold_monthly")).toBeNull();
  });
});

describe("paid statuses", () => {
  it.each(PAID_STATUSES)("includes %s", (status) => {
    expect(isPaidStatus(status)).toBe(true);
  });

  it.each(["incomplete", "incomplete_expired", "canceled", "unpaid", "paused"])(
    "excludes %s",
    (status) => {
      expect(isPaidStatus(status)).toBe(false);
    },
  );
});

describe("private.plans", () => {
  it("matches the plans config", async () => {
    const { rows } = await pgClient.query<{ id: string; seat_limit: number | null; rank: number }>(
      "select id, seat_limit, rank from private.plans order by rank",
    );
    const expected = (Object.keys(PLANS) as (keyof typeof PLANS)[])
      .map((id) => ({ id, seat_limit: PLANS[id].seats, rank: planRank(id) }))
      .sort((a, b) => a.rank - b.rank);
    expect(rows).toEqual(expected);
  });
});
