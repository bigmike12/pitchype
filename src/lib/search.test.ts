import assert from "node:assert/strict";
import { test } from "node:test";

import { SEARCH_MAX, parseSearch } from "./search.ts";

test("reads the search words from the URL", () => {
  assert.equal(parseSearch("zobo"), "zobo");
  assert.equal(parseSearch("  food   and drinks "), "food and drinks");
  assert.equal(parseSearch(["juice", "other"]), "juice");
});

test("nothing typed means no search", () => {
  for (const empty of [undefined, "", "   ", []]) {
    assert.equal(parseSearch(empty), undefined);
  }
});

test("long searches are cut", () => {
  assert.equal(parseSearch("a".repeat(200))?.length, SEARCH_MAX);
});
