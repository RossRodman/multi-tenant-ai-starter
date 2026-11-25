import { describe, expect, it } from "vitest";

import { appDestination } from "../src/lib/app-destination";

const org = (slug: string) => ({ slug });

const base = {
  invitationParam: undefined,
  pendingInvitations: 0,
  lastOrg: undefined,
  organizations: [] as { slug: string }[],
};

describe("appDestination", () => {
  it("shows the chooser for an invitation link, even with a last organization", () => {
    expect(
      appDestination({
        ...base,
        invitationParam: "abc",
        lastOrg: "acme",
        organizations: [org("acme")],
      }),
    ).toEqual({ kind: "chooser" });
  });

  it("shows the chooser while an invitation is pending", () => {
    expect(
      appDestination({
        ...base,
        pendingInvitations: 1,
        lastOrg: "acme",
        organizations: [org("acme")],
      }),
    ).toEqual({ kind: "chooser" });
  });

  it("opens the last organization when the user is still a member", () => {
    expect(
      appDestination({ ...base, lastOrg: "beta", organizations: [org("acme"), org("beta")] }),
    ).toEqual({ kind: "redirect", slug: "beta" });
  });

  it("falls through to the chooser for a stale or forged last organization", () => {
    expect(
      appDestination({ ...base, lastOrg: "gone", organizations: [org("acme"), org("beta")] }),
    ).toEqual({ kind: "chooser" });
  });

  it("sends a user without organizations to the create step", () => {
    expect(appDestination({ ...base, lastOrg: "gone" })).toEqual({ kind: "create" });
  });

  it("opens the only organization", () => {
    expect(appDestination({ ...base, organizations: [org("acme")] })).toEqual({
      kind: "redirect",
      slug: "acme",
    });
  });

  it("shows the chooser for several organizations without a last one", () => {
    expect(appDestination({ ...base, organizations: [org("acme"), org("beta")] })).toEqual({
      kind: "chooser",
    });
  });
});
