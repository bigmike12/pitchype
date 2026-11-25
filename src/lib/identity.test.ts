import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import { DojahError } from "./dojah.ts";
import {
  applyIdentityEvent,
  buildCacDecision,
  cacFromCache,
  decideCacResult,
  decideIdentityResult,
  handleDojahWebhook,
  isCompanyActive,
  runIdentityChecks,
  trimIdentityEvent,
  type IdentityDeps,
} from "./identity.ts";
import { identityFingerprint } from "./identity-crypto.ts";
import { SAMPLE_BVN, SAMPLE_NIN, widgetEvent } from "./identity-fixtures.ts";

const NIN_CHECK = {
  kind: "creator_nin",
  legalNameEntered: "John Doe",
} as const;

function steps(event: Record<string, unknown>) {
  return event.data as Record<string, Record<string, unknown>>;
}

test("the documented sample is verified when the names match", () => {
  const result = decideIdentityResult(widgetEvent(), NIN_CHECK);
  assert.equal(result.status, "verified");
  assert.equal(result.reason, null);
  assert.equal(result.idType, "NIN");
  assert.equal(result.idNumber, SAMPLE_NIN);
  assert.equal(result.nameOnRecord, "JOHN EMEKA DOE");
  assert.equal(result.dateOfBirth, "1992-10-10");
});

test("a BVN session verifies an owner check and reads the BVN record", () => {
  const result = decideIdentityResult(widgetEvent("BVN"), {
    kind: "owner_bvn",
    legalNameEntered: "Doe John",
  });
  assert.equal(result.status, "verified");
  assert.equal(result.idNumber, SAMPLE_BVN);
});

test("Completed with a failed selfie step is failed, never verified", () => {
  const event = widgetEvent();
  steps(event).selfie = {
    data: {},
    message: "Face does not match",
    status: false,
  };
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "selfie_mismatch");
  assert.equal(result.idNumber, null);
});

test("a failed liveness step is its own reason", () => {
  const event = widgetEvent();
  steps(event).selfie = {
    data: {},
    message: "Liveness check failed",
    status: false,
  };
  assert.equal(
    decideIdentityResult(event, NIN_CHECK).reason,
    "liveness_failed",
  );
});

test("a Failed session with no selfie step and a liveness message is liveness_failed", () => {
  // Seen in sandbox 2026-11-25: a failed liveness drops the selfie step and
  // says why only in the top-level message.
  const event = widgetEvent();
  event.verification_status = "Failed";
  event.status = false;
  event.message = "Liveness Verification Error";
  delete steps(event).selfie;
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "liveness_failed");
  assert.equal(result.detail, "Liveness Verification Error");
});

test("a Failed session with no failed step and another message stays other", () => {
  const event = widgetEvent();
  event.verification_status = "Failed";
  event.status = false;
  event.message = "Something unexpected";
  delete steps(event).selfie;
  assert.equal(decideIdentityResult(event, NIN_CHECK).reason, "other");
});

test("Completed with an overall status of false is failed", () => {
  const event = widgetEvent();
  event.status = false;
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.equal(result.status, "failed");
});

test("a failed government lookup means the ID was not found", () => {
  const event = widgetEvent();
  steps(event).government_data = {
    data: {},
    message: "not found",
    status: false,
  };
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "id_not_found");
});

test("a name that differs from the record is a mismatch", () => {
  const result = decideIdentityResult(widgetEvent(), {
    kind: "creator_nin",
    legalNameEntered: "John Smith",
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "name_mismatch");
  assert.equal(result.nameOnRecord, null);
});

test("the wrong kind of ID for the check is failed", () => {
  const result = decideIdentityResult(widgetEvent("BVN"), NIN_CHECK);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "other");
});

test("Ongoing, Pending and Abandoned map directly", () => {
  assert.equal(
    decideIdentityResult(widgetEvent("NIN", "Ongoing"), NIN_CHECK).status,
    "ongoing",
  );
  assert.equal(
    decideIdentityResult(widgetEvent("NIN", "Pending"), NIN_CHECK).status,
    "pending",
  );
  const abandoned = decideIdentityResult(
    widgetEvent("NIN", "Abandoned"),
    NIN_CHECK,
  );
  assert.equal(abandoned.status, "abandoned");
  assert.equal(abandoned.reason, "abandoned");
});

test("Failed takes its reason from the failing step", () => {
  const event = widgetEvent("NIN", "Failed");
  event.status = false;
  steps(event).government_data = {
    data: {},
    message: "no record",
    status: false,
  };
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "id_not_found");
});

test("a Failed session with no failing step is other", () => {
  const event = widgetEvent("NIN", "Failed");
  event.status = false;
  assert.equal(decideIdentityResult(event, NIN_CHECK).reason, "other");
});

test("malformed input is failed other and never throws", () => {
  for (const input of [
    null,
    undefined,
    "x",
    42,
    [],
    {},
    { verification_status: "Weird" },
  ]) {
    const result = decideIdentityResult(input, NIN_CHECK);
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "other");
  }
});

test("a session without a usable ID number is not verified", () => {
  const event = widgetEvent();
  event.value = "123";
  delete (steps(event).government_data.data as Record<string, unknown>).nin;
  assert.equal(decideIdentityResult(event, NIN_CHECK).status, "failed");
});

test("the number is read from the government record when the top level lacks it", () => {
  const event = widgetEvent();
  delete event.value;
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.equal(result.status, "verified");
  assert.equal(result.idNumber, SAMPLE_NIN);
});

test("the failure detail carries no numbers", () => {
  const event = widgetEvent();
  steps(event).selfie = {
    data: {},
    message: `No match for ${SAMPLE_NIN}`,
    status: false,
  };
  const result = decideIdentityResult(event, NIN_CHECK);
  assert.ok(result.detail !== null && !/\d/.test(result.detail));
});

test("a trimmed event has no ID number, link or name", () => {
  const trimmed = trimIdentityEvent(widgetEvent());
  const text = JSON.stringify(trimmed);
  assert.ok(!/\d{11}/.test(text));
  assert.ok(!text.includes("http"));
  assert.ok(!/john/i.test(text));
  assert.ok(!text.includes("ipinfo"));
  assert.equal(trimmed.reference_id, "pit_id_0123456789abcdef0123456789abcdef");
  assert.equal(trimmed.verification_status, "Completed");
  assert.equal(trimmed.status, true);
  assert.equal(trimmed.id_type, "NIN");
  assert.equal(trimmed.selfie_status, true);
  assert.equal(trimmed.selfie_message, "Successfully validated your liveness");
  assert.equal("value" in trimmed, false);
});

test("a trimmed event masks digits in step messages and survives junk", () => {
  const trimmed = trimIdentityEvent(widgetEvent());
  assert.equal(trimmed.phone_number_message, "# validation Collected");
  assert.deepEqual(trimIdentityEvent("nonsense"), {});
});

test("company status text: inactive words, otherwise active", () => {
  assert.equal(isCompanyActive(null), true);
  assert.equal(isCompanyActive("ACTIVE"), true);
  assert.equal(isCompanyActive("Inactive"), false);
  assert.equal(isCompanyActive("STRUCK OFF"), false);
  assert.equal(isCompanyActive("Dissolved"), false);
  assert.equal(isCompanyActive("Wound up"), false);
});

// The webhook, the backstop and the director match ----------------------------------------------------------

const REF = "pit_id_0123456789abcdef0123456789abcdef";
const WEBHOOK_SECRET = "whsec_identity_test";
const NOW = new Date("2026-11-23T03:50:00.000Z");
const savedEnv = {
  key: process.env.IDENTITY_FINGERPRINT_KEY,
  secret: process.env.DOJAH_WEBHOOK_SECRET,
};
const realConsoleError = console.error;
const realConsoleLog = console.log;
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  console.log = console.error;
  process.env.IDENTITY_FINGERPRINT_KEY = randomBytes(32).toString("base64");
  process.env.DOJAH_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  console.error = realConsoleError;
  console.log = realConsoleLog;
  for (const [name, value] of [
    ["IDENTITY_FINGERPRINT_KEY", savedEnv.key],
    ["DOJAH_WEBHOOK_SECRET", savedEnv.secret],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function assertNoLongNumbersLogged() {
  for (const line of logged) {
    assert.doesNotMatch(
      line,
      /\d{11}/,
      `a log line carries an 11-digit run: ${line}`,
    );
  }
}

type Script = {
  check?: Awaited<ReturnType<IdentityDeps["getCheck"]>>;
  finish?: Awaited<ReturnType<IdentityDeps["finish"]>>;
  finishError?: Error;
  facts?: Awaited<ReturnType<IdentityDeps["getCacFacts"]>>;
  cac?: Awaited<ReturnType<IdentityDeps["lookupCac"]>>;
  verifications?: Record<string, unknown | Error>;
  toPoll?: string[];
  abandoned?: number;
  abandonError?: Error;
  purged?: number;
};

function fakes(script: Script = {}) {
  const calls = {
    finish: [] as {
      reference: string;
      decision: Record<string, unknown>;
      eventKey: string;
    }[],
    refreshDirectors: [] as { userId: string; directors: string[] }[],
    lookupCac: [] as { rc: string; type: string }[],
    order: [] as string[],
  };
  const deps: IdentityDeps = {
    getCheck: async () =>
      script.check === undefined
        ? {
            id: "check-1",
            userId: "user-1",
            kind: "creator_nin",
            status: "started",
            legalNameEntered: "John Doe",
            createdAt: NOW.toISOString(),
          }
        : script.check,
    finish: async (reference, decision, eventKey) => {
      calls.order.push("finish");
      if (script.finishError) throw script.finishError;
      calls.finish.push({
        reference,
        decision: decision as Record<string, unknown>,
        eventKey,
      });
      return script.finish ?? (decision as { status: "verified" }).status;
    },
    fingerprint: identityFingerprint,
    getCacFacts: async () =>
      script.facts === undefined
        ? {
            checkId: "cac-1",
            companyName: "ACME LIMITED",
            companyType: "COMPANY",
            registrationNumber: "1234567",
            directors: ["JOHN DOE"],
            directorsFetchedAt: NOW.toISOString(),
          }
        : script.facts,
    refreshDirectors: async (userId, directors) => {
      calls.refreshDirectors.push({ userId, directors });
    },
    lookupCac: async (rc, type) => {
      calls.lookupCac.push({ rc, type });
      return script.cac ?? { found: false };
    },
    getVerification: async (reference) => {
      const answer = script.verifications?.[reference];
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
    listToPoll: async () => script.toPoll ?? [],
    abandonStale: async () => {
      if (script.abandonError) throw script.abandonError;
      return script.abandoned ?? 0;
    },
    purgeSecrets: async () => script.purged ?? 0,
    now: () => NOW,
  };
  return { deps, calls };
}

test("a verified widget event is decided once, with the number fingerprinted and dropped", async () => {
  const { deps, calls } = fakes();
  const result = await applyIdentityEvent(widgetEvent(), deps);
  assert.equal(result, "applied");
  assert.equal(calls.finish.length, 1);
  const call = calls.finish[0];
  assert.equal(call.reference, REF);
  assert.equal(call.eventKey, `dojah:${REF}:Completed`);
  assert.equal(call.decision.status, "verified");
  assert.equal(
    call.decision.id_fingerprint,
    identityFingerprint("NIN", SAMPLE_NIN),
  );
  assert.equal(call.decision.id_last3, "789");
  assert.equal(call.decision.legal_name_on_record, "JOHN EMEKA DOE");
  assert.equal(call.decision.counted, true);
  assert.ok(!JSON.stringify(call.decision).includes(SAMPLE_NIN));
});

test("the same event again is a duplicate and the same unknown reference is unknown", async () => {
  assert.equal(
    await applyIdentityEvent(
      widgetEvent(),
      fakes({ finish: "duplicate" }).deps,
    ),
    "duplicate",
  );
  assert.equal(
    await applyIdentityEvent(widgetEvent(), fakes({ finish: "ignored" }).deps),
    "ignored",
  );
  const unknown = fakes({ check: null });
  assert.equal(
    await applyIdentityEvent(widgetEvent(), unknown.deps),
    "unknown",
  );
  assert.equal(unknown.calls.finish.length, 0);
});

test("an Ongoing event changes nothing", async () => {
  const { deps, calls } = fakes();
  assert.equal(
    await applyIdentityEvent(widgetEvent("NIN", "Ongoing"), deps),
    "ignored",
  );
  assert.equal(calls.finish.length, 0);
});

test("Pending is recorded as pending and counted", async () => {
  const { deps, calls } = fakes();
  await applyIdentityEvent(widgetEvent("NIN", "Pending"), deps);
  assert.equal(calls.finish[0].decision.status, "pending");
  assert.equal(calls.finish[0].decision.counted, true);
  assert.equal(calls.finish[0].eventKey, `dojah:${REF}:Pending`);
});

test("a failed selfie is recorded as failed with its reason and no fingerprint", async () => {
  const event = widgetEvent();
  steps(event).selfie = {
    data: {},
    message: "Face does not match",
    status: false,
  };
  const { deps, calls } = fakes();
  await applyIdentityEvent(event, deps);
  const decision = calls.finish[0].decision;
  assert.equal(decision.status, "failed");
  assert.equal(decision.reason, "selfie_mismatch");
  assert.equal(decision.counted, true);
  assert.equal("id_fingerprint" in decision, false);
});

test("an abandoned session is recorded as abandoned and not counted", async () => {
  const { deps, calls } = fakes();
  await applyIdentityEvent(widgetEvent("NIN", "Abandoned"), deps);
  assert.equal(calls.finish[0].decision.status, "abandoned");
  assert.equal(calls.finish[0].decision.counted, false);
});

test("a widget event for a CAC check is ignored", async () => {
  const { deps, calls } = fakes({
    check: {
      id: "c",
      userId: "u",
      kind: "business_cac",
      status: "started",
      legalNameEntered: "Acme Limited",
      createdAt: NOW.toISOString(),
    },
  });
  assert.equal(await applyIdentityEvent(widgetEvent(), deps), "ignored");
  assert.equal(calls.finish.length, 0);
});

test("a missing fingerprint key stops a verified event before anything is recorded", async () => {
  delete process.env.IDENTITY_FINGERPRINT_KEY;
  const { deps, calls } = fakes();
  await assert.rejects(() => applyIdentityEvent(widgetEvent(), deps));
  assert.equal(calls.finish.length, 0);
});

const DIRECTOR_CHECK = {
  id: "dir-1",
  userId: "user-1",
  kind: "director_bvn" as const,
  status: "started" as const,
  legalNameEntered: "John Doe",
  createdAt: NOW.toISOString(),
};

test("a director who is on CAC's list verifies, and nothing about the BVN is kept", async () => {
  const { deps, calls } = fakes({ check: DIRECTOR_CHECK });
  assert.equal(await applyIdentityEvent(widgetEvent("BVN"), deps), "applied");
  assert.equal(calls.finish[0].decision.status, "verified");
  assert.equal(
    calls.finish[0].decision.id_fingerprint,
    identityFingerprint("BVN", SAMPLE_BVN),
  );
  assert.deepEqual(calls.order, ["finish"]);
  assert.equal(calls.lookupCac.length, 0);
});

test("a director who is not on the list fails not_a_director and nothing is stored", async () => {
  const { deps, calls } = fakes({
    check: DIRECTOR_CHECK,
    facts: {
      checkId: "cac-1",
      companyName: "ACME LIMITED",
      companyType: "COMPANY",
      registrationNumber: "1234567",
      directors: ["ADA OBI"],
      directorsFetchedAt: NOW.toISOString(),
    },
  });
  await applyIdentityEvent(widgetEvent("BVN"), deps);
  assert.equal(calls.finish[0].decision.status, "failed");
  assert.equal(calls.finish[0].decision.reason, "not_a_director");
  assert.equal("id_fingerprint" in calls.finish[0].decision, false);
});

test("a director list older than 90 days is looked up again before matching", async () => {
  const old = new Date(NOW.getTime() - 91 * 24 * 3_600_000).toISOString();
  const { deps, calls } = fakes({
    check: DIRECTOR_CHECK,
    facts: {
      checkId: "cac-1",
      companyName: "ACME LIMITED",
      companyType: "COMPANY",
      registrationNumber: "1234567",
      directors: ["ADA OBI"],
      directorsFetchedAt: old,
    },
    cac: {
      found: true,
      companyName: "ACME LIMITED",
      companyType: "COMPANY",
      status: null,
      registrationNumber: "1234567",
      directors: ["JOHN DOE"],
    },
  });
  await applyIdentityEvent(widgetEvent("BVN"), deps);
  assert.deepEqual(calls.lookupCac, [{ rc: "1234567", type: "COMPANY" }]);
  assert.deepEqual(calls.refreshDirectors, [
    { userId: "user-1", directors: ["JOHN DOE"] },
  ]);
  assert.equal(calls.finish[0].decision.status, "verified");
});

test("a director list that was never fetched is fetched too", async () => {
  const { deps, calls } = fakes({
    check: DIRECTOR_CHECK,
    facts: {
      checkId: "cac-1",
      companyName: "ACME LIMITED",
      companyType: "COMPANY",
      registrationNumber: "1234567",
      directors: [],
      directorsFetchedAt: null,
    },
    cac: {
      found: true,
      companyName: "ACME LIMITED",
      companyType: "COMPANY",
      status: null,
      registrationNumber: "1234567",
      directors: ["JOHN MUSA DOE"],
    },
  });
  await applyIdentityEvent(widgetEvent("BVN"), deps);
  assert.equal(calls.lookupCac.length, 1);
  assert.equal(calls.finish[0].decision.status, "verified");
});

test("an unreachable CAC lookup throws before anything is recorded, so Dojah retries", async () => {
  const { deps, calls } = fakes({
    check: DIRECTOR_CHECK,
    facts: {
      checkId: "cac-1",
      companyName: "ACME LIMITED",
      companyType: "COMPANY",
      registrationNumber: "1234567",
      directors: [],
      directorsFetchedAt: null,
    },
  });
  deps.lookupCac = async () => {
    throw new DojahError("Dojah answered 424", 424);
  };
  await assert.rejects(
    () => applyIdentityEvent(widgetEvent("BVN"), deps),
    DojahError,
  );
  assert.equal(calls.finish.length, 0);
});

test("a director with no verified CAC record fails not_a_director", async () => {
  const { deps, calls } = fakes({ check: DIRECTOR_CHECK, facts: null });
  assert.equal(await applyIdentityEvent(widgetEvent("BVN"), deps), "applied");
  assert.equal(calls.finish[0].decision.reason, "not_a_director");
});

function signed(body: string, secret = WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function webhookDeps(
  result: "applied" | "duplicate" | "ignored" | "unknown" | Error = "applied",
) {
  const seen: unknown[] = [];
  return {
    seen,
    deps: {
      apply: async (event: unknown) => {
        seen.push(event);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

test("a signed webhook is applied once", async () => {
  const body = JSON.stringify(widgetEvent());
  const { deps, seen } = webhookDeps();
  const response = await handleDojahWebhook(body, signed(body), deps);
  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, result: "applied" },
  });
  assert.equal(seen.length, 1);
});

test("a bad, tampered or missing signature is 401 and nothing is read", async () => {
  const body = JSON.stringify(widgetEvent());
  for (const signature of [
    signed(body, "another secret"),
    signed(body + " "),
    null,
    "",
  ]) {
    const { deps, seen } = webhookDeps();
    const response = await handleDojahWebhook(body, signature, deps);
    assert.equal(response.status, 401);
    assert.equal(seen.length, 0);
  }
});

test("a repeat is a 200 duplicate", async () => {
  const body = JSON.stringify(widgetEvent());
  const response = await handleDojahWebhook(
    body,
    signed(body),
    webhookDeps("duplicate").deps,
  );
  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, result: "duplicate" },
  });
});

test("malformed JSON with a good signature is 400", async () => {
  const body = "{not json";
  const response = await handleDojahWebhook(
    body,
    signed(body),
    webhookDeps().deps,
  );
  assert.equal(response.status, 400);
});

test("an event that is not one of our sessions is acknowledged and ignored", async () => {
  for (const event of [
    { ...widgetEvent(), reference_id: "DJ-31038041E0" },
    { verification_status: "Completed" },
    [],
    "text",
  ]) {
    const body = JSON.stringify(event);
    const { deps, seen } = webhookDeps();
    const response = await handleDojahWebhook(body, signed(body), deps);
    assert.deepEqual(response, {
      status: 200,
      body: { ok: true, result: "ignored" },
    });
    assert.equal(seen.length, 0);
  }
});

test("an unknown reference is a 200", async () => {
  const body = JSON.stringify(widgetEvent());
  const response = await handleDojahWebhook(
    body,
    signed(body),
    webhookDeps("unknown").deps,
  );
  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, result: "unknown" },
  });
});

test("a database or provider failure is a 500 so Dojah retries, and the log has no ID number", async () => {
  const body = JSON.stringify(widgetEvent());
  for (const failure of [
    new Error(`database down while handling ${SAMPLE_NIN}`),
    new DojahError(`Dojah answered 424 for ${SAMPLE_NIN}`, 424),
  ]) {
    const response = await handleDojahWebhook(
      body,
      signed(body),
      webhookDeps(failure).deps,
    );
    assert.equal(response.status, 500);
  }
  assert.ok(logged.length >= 2);
  assertNoLongNumbersLogged();
});

test("the backstop polls open sessions, applies what Dojah answers and reports the rest", async () => {
  const { deps, calls } = fakes({
    toPoll: ["pit_id_a", "pit_id_b", "pit_id_c"],
    verifications: {
      pit_id_a: { ...widgetEvent(), reference_id: "pit_id_a" },
      pit_id_c: new DojahError(`Dojah answered 424 for ${SAMPLE_NIN}`, 424),
    },
    abandoned: 2,
    purged: 3,
  });
  const result = await runIdentityChecks(NOW, deps);
  assert.deepEqual(result, {
    polled: 3,
    applied: 1,
    errored: 1,
    abandoned: 2,
    secretsPurged: 3,
  });
  assert.equal(calls.finish[0].reference, "pit_id_a");
  assert.equal(calls.finish[0].eventKey, "dojah:pit_id_a:Completed");
  assertNoLongNumbersLogged();
});

test("the backstop answers for the reference it asked about", async () => {
  const { deps, calls } = fakes({
    toPoll: ["pit_id_asked"],
    verifications: {
      pit_id_asked: { ...widgetEvent(), reference_id: "DJ-OTHER" },
    },
  });
  await runIdentityChecks(NOW, deps);
  assert.equal(calls.finish[0].reference, "pit_id_asked");
});

test("one failing step does not stop the others", async () => {
  const { deps } = fakes({
    abandonError: new Error("db"),
    purged: 4,
    toPoll: [],
  });
  const result = await runIdentityChecks(NOW, deps);
  assert.equal(result.errored, 1);
  assert.equal(result.secretsPurged, 4);
});

test("the webhook and the backstop deciding one check at once decide it once", async () => {
  // Same reference and status give the same event key, so the database sees one.
  const { deps, calls } = fakes({
    toPoll: [REF],
    verifications: { [REF]: widgetEvent() },
  });
  await applyIdentityEvent(widgetEvent(), deps);
  await runIdentityChecks(NOW, deps);
  assert.equal(new Set(calls.finish.map((c) => c.eventKey)).size, 1);
});

// CAC lookups --------------------------------------------------------------------------------------------------------

const CAC_FOUND = {
  found: true as const,
  companyName: "ACME INDUSTRIES LIMITED",
  companyType: "COMPANY",
  status: null,
  registrationNumber: "1234567",
  directors: ["JOHN MUSA"],
};

test("a found, active company with a matching name verifies", () => {
  assert.deepEqual(decideCacResult("Acme Industries Ltd", CAC_FOUND), {
    status: "verified",
    reason: null,
  });
  assert.equal(
    decideCacResult("Acme Industries Ltd", { ...CAC_FOUND, status: "ACTIVE" })
      .status,
    "verified",
  );
});

test("a company CAC does not know fails company_not_found", () => {
  assert.deepEqual(decideCacResult("Acme", { found: false }), {
    status: "failed",
    reason: "company_not_found",
  });
});

test("a struck-off company fails company_inactive even when the name matches", () => {
  assert.deepEqual(
    decideCacResult("Acme Industries Ltd", {
      ...CAC_FOUND,
      status: "STRUCK OFF",
    }),
    { status: "failed", reason: "company_inactive" },
  );
});

test("a different name fails name_mismatch", () => {
  assert.deepEqual(decideCacResult("Acme Foods Ltd", CAC_FOUND), {
    status: "failed",
    reason: "name_mismatch",
  });
});

test("a verified CAC decision keeps the company, our company type and the directors", () => {
  const decision = buildCacDecision({
    enteredName: "Acme Industries Ltd",
    companyType: "COMPANY",
    rcNumber: "1234567",
    cac: CAC_FOUND,
    lookedUp: true,
  });
  assert.equal(decision.status, "verified");
  assert.equal(decision.company_name_on_record, "ACME INDUSTRIES LIMITED");
  assert.equal(decision.company_type, "COMPANY");
  assert.equal(decision.registration_number, "1234567");
  assert.deepEqual(decision.directors, ["JOHN MUSA"]);
  assert.equal(decision.counted, true);
  assert.equal("reason" in decision, false);
});

test("a failed CAC decision keeps CAC's answer for a corrected name, and an uncounted re-compare", () => {
  const decision = buildCacDecision({
    enteredName: "Acme Foods Ltd",
    companyType: "COMPANY",
    rcNumber: "1234567",
    cac: CAC_FOUND,
    lookedUp: false,
  });
  assert.equal(decision.status, "failed");
  assert.equal(decision.reason, "name_mismatch");
  assert.equal(decision.registration_number, "1234567");
  assert.equal(decision.counted, false);
  assert.deepEqual(cacFromCache(decision.cac_cache), CAC_FOUND);
});

test("a company CAC does not know has no cached answer", () => {
  const decision = buildCacDecision({
    enteredName: "Acme",
    companyType: "COMPANY",
    rcNumber: "1234567",
    cac: { found: false },
    lookedUp: true,
  });
  assert.equal(decision.reason, "company_not_found");
  assert.equal("cac_cache" in decision, false);
  assert.equal(decision.counted, true);
});

test("a cached answer that is not a found company is not used", () => {
  assert.equal(cacFromCache(null), null);
  assert.equal(cacFromCache({}), null);
  assert.equal(cacFromCache({ found: true, companyName: "" }), null);
  assert.equal(cacFromCache("text"), null);
});
