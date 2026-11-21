import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { DojahError } from "./dojah.ts";
import {
  ensureScreened,
  screenBeforeHire,
  type ScreeningDeps,
} from "./screening.ts";

const realConsoleError = console.error;
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.error = realConsoleError;
});

type Script = {
  state?: Awaited<ReturnType<ScreeningDeps["getState"]>>;
  facts?: Awaited<ReturnType<ScreeningDeps["getFacts"]>>;
  matchCount?: number;
  dojahError?: Error;
};

function fakes(script: Script = {}) {
  const calls = {
    person: [] as {
      name: string;
      dateOfBirth: string | null;
      reference: string;
    }[],
    business: [] as { name: string; reference: string }[],
    recorded: [] as Parameters<ScreeningDeps["record"]>[0][],
  };
  const deps: ScreeningDeps = {
    getState: async () => script.state ?? "none",
    getFacts: async () =>
      script.facts === undefined
        ? { subject: "person", name: "CHIDI OKAFOR", dateOfBirth: "1992-10-10" }
        : script.facts,
    screenPerson: async (input) => {
      calls.person.push(input);
      if (script.dojahError) throw script.dojahError;
      return {
        matchCount: script.matchCount ?? 0,
        providerReference: input.reference,
      };
    },
    screenBusiness: async (input) => {
      calls.business.push(input);
      if (script.dojahError) throw script.dojahError;
      return {
        matchCount: script.matchCount ?? 0,
        providerReference: input.reference,
      };
    },
    record: async (input) => {
      calls.recorded.push(input);
      return "screening-1";
    },
    newReference: () => "pit_sc_test",
  };
  return { deps, calls };
}

const CREATOR = { id: "u1", role: "influencer" } as const;
const BUSINESS = { id: "b1", role: "business" } as const;

test("someone already screened is not screened again, and Dojah is not called", async () => {
  for (const state of [
    "clear",
    "possible_match",
    "error",
    "confirmed",
  ] as const) {
    const { deps, calls } = fakes({ state });
    assert.equal(
      await ensureScreened(CREATOR, "first_payout", deps),
      "already",
    );
    assert.equal(calls.person.length + calls.business.length, 0);
    assert.equal(calls.recorded.length, 0);
  }
});

test("a first screening with no matches is clear and recorded with the name and date of birth", async () => {
  const { deps, calls } = fakes();
  assert.equal(await ensureScreened(CREATOR, "first_payout", deps), "clear");
  assert.deepEqual(calls.person, [
    {
      name: "CHIDI OKAFOR",
      dateOfBirth: "1992-10-10",
      reference: "pit_sc_test",
    },
  ]);
  assert.deepEqual(calls.recorded, [
    {
      userId: "u1",
      subject: "person",
      trigger: "first_payout",
      status: "clear",
      matchCount: 0,
      providerReference: "pit_sc_test",
    },
  ]);
});

test("a match is recorded as a possible match with its count", async () => {
  const { deps, calls } = fakes({ matchCount: 3 });
  assert.equal(
    await ensureScreened(CREATOR, "first_payout", deps),
    "possible_match",
  );
  assert.equal(calls.recorded[0].status, "possible_match");
  assert.equal(calls.recorded[0].matchCount, 3);
});

test("a registered business is screened by its CAC name, not a person's name", async () => {
  const { deps, calls } = fakes({
    facts: {
      subject: "business",
      name: "ACME FOODS LIMITED",
      dateOfBirth: null,
    },
  });
  assert.equal(await ensureScreened(BUSINESS, "first_hire", deps), "clear");
  assert.deepEqual(calls.business, [
    { name: "ACME FOODS LIMITED", reference: "pit_sc_test" },
  ]);
  assert.equal(calls.person.length, 0);
  assert.equal(calls.recorded[0].subject, "business");
  assert.equal(calls.recorded[0].trigger, "first_hire");
});

test("an unregistered business is screened by its owner's verified name and date of birth", async () => {
  const { deps, calls } = fakes({
    facts: { subject: "person", name: "BOLA ADE", dateOfBirth: "1985-03-02" },
  });
  await ensureScreened(BUSINESS, "first_hire", deps);
  assert.deepEqual(calls.person, [
    { name: "BOLA ADE", dateOfBirth: "1985-03-02", reference: "pit_sc_test" },
  ]);
  assert.equal(calls.recorded[0].subject, "person");
});

test("Dojah being down records an error, never a clear", async () => {
  const { deps, calls } = fakes({
    dojahError: new DojahError("Dojah answered 424 for 22222222222", 424),
  });
  assert.equal(await ensureScreened(CREATOR, "first_payout", deps), "error");
  assert.equal(calls.recorded[0].status, "error");
  assert.equal(calls.recorded[0].matchCount, 0);
  assert.ok(logged.length > 0);
  for (const line of logged) assert.doesNotMatch(line, /\d{9,}/);
});

test("someone with no verified name is recorded as an error, with nothing sent to Dojah", async () => {
  const { deps, calls } = fakes({ facts: null });
  assert.equal(await ensureScreened(CREATOR, "first_payout", deps), "error");
  assert.equal(calls.person.length, 0);
  assert.equal(calls.recorded[0].status, "error");
  assert.equal(calls.recorded[0].subject, "person");
});

test("an admin's screen-again runs whatever the state", async () => {
  const { deps, calls } = fakes({ state: "possible_match" });
  assert.equal(await ensureScreened(CREATOR, "admin", deps), "clear");
  assert.equal(calls.recorded[0].trigger, "admin");
});

test("before a hire: clear, error or no screening proceeds; a match holds", async () => {
  assert.equal(await screenBeforeHire(BUSINESS, fakes().deps), "proceed");
  assert.equal(
    await screenBeforeHire(BUSINESS, fakes({ matchCount: 1 }).deps),
    "hold",
  );
  assert.equal(
    await screenBeforeHire(
      BUSINESS,
      fakes({ dojahError: new DojahError("x", 424) }).deps,
    ),
    "proceed",
  );
  assert.equal(
    await screenBeforeHire(BUSINESS, fakes({ state: "clear" }).deps),
    "proceed",
  );
  assert.equal(
    await screenBeforeHire(BUSINESS, fakes({ state: "error" }).deps),
    "proceed",
  );
  assert.equal(
    await screenBeforeHire(BUSINESS, fakes({ state: "possible_match" }).deps),
    "hold",
  );
  assert.equal(
    await screenBeforeHire(BUSINESS, fakes({ state: "confirmed" }).deps),
    "hold",
  );
});
