import assert from "node:assert/strict";
import { test } from "node:test";

import { clicksToCsv } from "./click-csv.ts";

const HEADER =
  "Creator,Link,Clicks counted,Visits not counted,Spent (NGN),Back to you (NGN),Status";

test("a row per hire, amounts in naira", () => {
  const csv = clicksToCsv([
    {
      creatorName: "Ada Obi",
      code: "k7Xq2ab",
      billable: 180,
      notCounted: 12,
      spentKobo: 900_000,
      backKobo: 1_671_922,
      status: "Settled",
    },
    {
      creatorName: "Bola",
      code: null,
      billable: 0,
      notCounted: 0,
      spentKobo: 0,
      backKobo: null,
      status: "Running",
    },
  ]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], HEADER);
  assert.equal(lines[1], "Ada Obi,k7Xq2ab,180,12,9000.00,16719.22,Settled");
  assert.equal(lines[2], "Bola,,0,0,0.00,,Running");
});

test("names that look like formulas are made inert", () => {
  const csv = clicksToCsv([
    {
      creatorName: '=HYPERLINK("x")',
      code: "k7Xq2ab",
      billable: 1,
      notCounted: 0,
      spentKobo: 5_000,
      backKobo: null,
      status: "Running",
    },
  ]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  for (const start of ["+1", "-1", "@a", "\tx"]) {
    const row = clicksToCsv([
      {
        creatorName: start,
        code: null,
        billable: 0,
        notCounted: 0,
        spentKobo: 0,
        backKobo: null,
        status: "",
      },
    ]);
    assert.ok(
      row.split("\r\n")[1].startsWith("'") ||
        row.split("\r\n")[1].startsWith("\"'"),
      start,
    );
  }
});

test("commas and new lines in names are quoted", () => {
  const csv = clicksToCsv([
    {
      creatorName: "Obi, Ada\nLagos",
      code: null,
      billable: 0,
      notCounted: 0,
      spentKobo: 0,
      backKobo: null,
      status: "",
    },
  ]);
  assert.ok(csv.includes('"Obi, Ada\nLagos"'));
});
