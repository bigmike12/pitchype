import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideIdentityResult,
  isCompanyActive,
  trimIdentityEvent,
} from "./identity.ts";
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
