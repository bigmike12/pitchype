-- Proves the provider_fees migration: the current fee version carries both
-- providers' processor fees, the older version is untouched, and the config
-- stays append-only.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select ok((public.current_fee_config()).provider_fees ?& array['paystack', 'cray'],
  'the current fee version holds fees for both providers');
select is((public.current_fee_config()).provider_fees #>> '{cray,payout,tiers,0,fee_kobo}', '5000',
  'Cray''s payout fee is the provisional flat ₦50');
select is((public.current_fee_config()).provider_fees #> '{paystack,payout,tiers}',
  (public.current_fee_config()).transfer_fee_tiers,
  'Paystack''s payout tiers mirror the columns it always had');
select is((public.current_fee_config()).business_fee_bps, 500, 'the business fee is still 5%');
select is((public.current_fee_config()).min_payout_kobo, 100000::bigint, 'the minimum payout is unchanged');
select is((select count(*)::integer from public.fee_config where provider_fees = '{}'::jsonb) >= 1, true,
  'the older version keeps an empty provider_fees');
select throws_ok($$ update public.fee_config set provider_fees = '{}' $$,
  'P0001', 'fee_config_append_only', 'fee_config rows are still never updated');
select throws_ok($$ delete from public.fee_config $$,
  'P0001', 'fee_config_append_only', 'and never deleted');

select * from finish();
rollback;
