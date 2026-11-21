import assert from "node:assert/strict";
import { test } from "node:test";

import {
  companyNamesMatch,
  normaliseName,
  personNamesMatch,
} from "./identity-names.ts";

test("normaliseName upper-cases, strips accents and punctuation", () => {
  assert.equal(normaliseName("  Chídi   O'Kafor-Eze. "), "CHIDI O KAFOR EZE");
});

test("person names match in any order and ignore middle names", () => {
  assert.equal(personNamesMatch("Chidi Okafor", "OKAFOR CHIDI EMEKA"), true);
  assert.equal(personNamesMatch("Chídi  Okafor", "CHIDI OKAFOR"), true);
  assert.equal(personNamesMatch("Chidi Emeka Okafor", "CHIDI OKAFOR"), true);
});

test("person names that differ do not match", () => {
  assert.equal(personNamesMatch("Chidi Okafor", "CHIDI OKORO"), false);
  assert.equal(personNamesMatch("Chidi", "CHIDI OKAFOR"), false);
  assert.equal(personNamesMatch("", "CHIDI OKAFOR"), false);
});

test("company names match through the usual equivalences", () => {
  assert.equal(
    companyNamesMatch("Acme Industries Ltd", "ACME INDUSTRIES LIMITED"),
    true,
  );
  assert.equal(companyNamesMatch("The Acme & Co", "ACME AND COMPANY"), true);
  assert.equal(
    companyNamesMatch("Acme Enterprise Nig", "ACME ENTERPRISES NIGERIA"),
    true,
  );
  assert.equal(companyNamesMatch("Acme Ent", "ACME ENTERPRISES"), true);
});

test("different company names do not match", () => {
  assert.equal(
    companyNamesMatch("Acme Foods Ltd", "ACME INDUSTRIES LIMITED"),
    false,
  );
  assert.equal(companyNamesMatch("", ""), false);
});
