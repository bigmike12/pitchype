-- Per-provider processor fees on fee_config (docs/superpowers/specs/2026-11-21-cray-payments-design.md §5.7).
--
-- fee_config rows are never edited (they are append-only), so this adds a
-- column and a NEW row: a copy of the current one with provider_fees filled
-- in. Older rows keep '{}'; the Paystack columns they already carry stay the
-- source for Paystack. The new row becomes the current one by created_at.
--
-- The Cray figures are PROVISIONAL (the support agent's "usually" and
-- "about"); docs/TODO.md asks the owner to get them in writing. The seed is one
-- JSON literal so src/lib/fee-config.test.ts can read it from this file and
-- check it equals src/lib/fees.ts. Change both together.
--
-- Every Cray charge is carried by the business or the creator, never by us
-- (spec §3): card charges are added at checkout, a bank transfer's charge
-- comes out of what arrives, payouts are paid by the creator.

alter table public.fee_config
  add column provider_fees jsonb not null default '{}'::jsonb;

alter table public.fee_config
  add constraint fee_config_provider_fees_check check (jsonb_typeof(provider_fees) = 'object');

insert into public.fee_config (business_fee_bps, creator_fee_bps, min_fee_kobo, min_payout_kobo,
                               transfer_fee_tiers, transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo,
                               paystack_rate, provider_fees)
select c.business_fee_bps, c.creator_fee_bps, c.min_fee_kobo, c.min_payout_kobo,
       c.transfer_fee_tiers, c.transfer_stamp_duty_kobo, c.transfer_stamp_duty_from_kobo,
       c.paystack_rate, seed.fees
  from public.current_fee_config() c,
       (select $provider_fees_seed$
{
  "paystack": {
    "card": {
      "rate_bps": 150,
      "flat_kobo": 10000,
      "flat_waived_under_kobo": 250000,
      "cap_kobo": 200000,
      "vat_bps": 750
    },
    "payout": {
      "tiers": [
        { "up_to_kobo": 500000, "fee_kobo": 1000 },
        { "up_to_kobo": 5000000, "fee_kobo": 2500 },
        { "up_to_kobo": null, "fee_kobo": 5000 }
      ],
      "stamp_duty_kobo": 5000,
      "stamp_duty_from_kobo": 1000000
    }
  },
  "cray": {
    "card": { "rate_bps": 150, "cap_kobo": 200000 },
    "transfer_in": { "rate_bps": 100, "cap_kobo": 20000, "allowance_kobo": 20000 },
    "payout": {
      "tiers": [{ "up_to_kobo": null, "fee_kobo": 5000 }],
      "stamp_duty_kobo": 0,
      "stamp_duty_from_kobo": 0
    }
  }
}
$provider_fees_seed$::jsonb as fees) seed;
