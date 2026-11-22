import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  BUSINESS_FEE_BPS,
  CRAY_FEES,
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  MIN_PAYOUT_KOBO,
  PAYSTACK_CAP_KOBO,
  PAYSTACK_FLAT_KOBO,
  PAYSTACK_FLAT_WAIVED_UNDER_KOBO,
  PAYSTACK_RATE_BPS,
  PAYSTACK_VAT_BPS,
  TRANSFER_FEE_TIERS,
  TRANSFER_STAMP_DUTY_FROM_KOBO,
  TRANSFER_STAMP_DUTY_KOBO,
} from "./fees.ts";

// The ledger migration seeds fee_config from one JSON literal between
// $fee_config_seed$ markers; read it and check it equals the TS constants.
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261113100000_create_ledger.sql",
    import.meta.url,
  ),
  "utf8",
);
const match = migration.match(
  /\$fee_config_seed\$([\s\S]*?)\$fee_config_seed\$/,
);
assert.ok(match, "the migration has a $fee_config_seed$ block");
const seed = JSON.parse(match[1]);

test("seeded fee_config rates and minimum fee equal src/lib/fees.ts", () => {
  assert.equal(seed.business_fee_bps, BUSINESS_FEE_BPS);
  assert.equal(seed.creator_fee_bps, INFLUENCER_FEE_BPS);
  assert.equal(seed.min_fee_kobo, MIN_FEE_KOBO);
  assert.equal(seed.min_payout_kobo, MIN_PAYOUT_KOBO);
});

test("seeded Paystack card rate equals src/lib/fees.ts", () => {
  assert.deepEqual(seed.paystack_rate, {
    rate_bps: PAYSTACK_RATE_BPS,
    flat_kobo: PAYSTACK_FLAT_KOBO,
    flat_waived_under_kobo: PAYSTACK_FLAT_WAIVED_UNDER_KOBO,
    cap_kobo: PAYSTACK_CAP_KOBO,
    vat_bps: PAYSTACK_VAT_BPS,
  });
});

test("seeded transfer fee tiers and stamp duty equal src/lib/fees.ts", () => {
  assert.deepEqual(
    seed.transfer_fee_tiers,
    TRANSFER_FEE_TIERS.map((t) => ({
      up_to_kobo: t.upToKobo === Infinity ? null : t.upToKobo,
      fee_kobo: t.feeKobo,
    })),
  );
  assert.equal(seed.transfer_stamp_duty_kobo, TRANSFER_STAMP_DUTY_KOBO);
  assert.equal(
    seed.transfer_stamp_duty_from_kobo,
    TRANSFER_STAMP_DUTY_FROM_KOBO,
  );
});

// The provider fees arrive in a later migration, seeded the same way.
const providerMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261122100100_provider_fees.sql",
    import.meta.url,
  ),
  "utf8",
);
const providerMatch = providerMigration.match(
  /\$provider_fees_seed\$([\s\S]*?)\$provider_fees_seed\$/,
);
assert.ok(providerMatch, "the migration has a $provider_fees_seed$ block");
const providerFees = JSON.parse(providerMatch[1]);

test("seeded Cray fees equal src/lib/fees.ts", () => {
  assert.deepEqual(providerFees.cray, CRAY_FEES);
});

test("seeded Paystack provider fees mirror the original fee_config columns", () => {
  assert.deepEqual(providerFees.paystack, {
    card: seed.paystack_rate,
    payout: {
      tiers: seed.transfer_fee_tiers,
      stamp_duty_kobo: seed.transfer_stamp_duty_kobo,
      stamp_duty_from_kobo: seed.transfer_stamp_duty_from_kobo,
    },
  });
});
