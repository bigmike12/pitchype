import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPANY_TYPE_OPTIONS, parseCompanyType } from "./company-types.ts";

test("every option parses back to itself", () => {
  assert.equal(COMPANY_TYPE_OPTIONS.length, 5);
  for (const option of COMPANY_TYPE_OPTIONS) {
    assert.equal(parseCompanyType(option.value), option.value);
    assert.ok(option.label.length > 5);
  }
});

test("anything else is not a company type", () => {
  for (const bad of ["", "company", "SOLE_TRADER", "constructor"]) {
    assert.equal(parseCompanyType(bad), null, bad);
  }
});
