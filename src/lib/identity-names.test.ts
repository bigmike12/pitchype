import assert from "node:assert/strict";
import { test } from "node:test";

import {
  companyNamesMatch,
  normaliseName,
  parseRegistrationNumber,
  personNamesMatch,
  splitLegalName,
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

test("a legal name is split into first and last, with middle names kept in the full name", () => {
  assert.deepEqual(splitLegalName("  Chidi   Emeka  Okafor "), {
    ok: true,
    full: "Chidi Emeka Okafor",
    firstName: "Chidi",
    lastName: "Okafor",
  });
  assert.deepEqual(splitLegalName("Ada Obi"), {
    ok: true,
    full: "Ada Obi",
    firstName: "Ada",
    lastName: "Obi",
  });
});

test("a legal name needs a first and a last name, within the length limits", () => {
  for (const bad of ["", "Chidi", "   ", "A", "x ".repeat(120)]) {
    assert.equal(splitLegalName(bad).ok, false, JSON.stringify(bad));
  }
});

test("a registration number keeps its digits and drops the usual prefix", () => {
  for (const [typed, digits] of [
    ["1234567", "1234567"],
    [" RC 1234567 ", "1234567"],
    ["rc-1234567", "1234567"],
    ["BN1234567", "1234567"],
    ["IT 98765", "98765"],
  ]) {
    assert.deepEqual(
      parseRegistrationNumber(typed),
      { ok: true, digits },
      typed,
    );
  }
  for (const bad of ["", "12", "abc", "12345678901", "RC", "123-456-x"]) {
    assert.equal(parseRegistrationNumber(bad).ok, false, bad);
  }
});
