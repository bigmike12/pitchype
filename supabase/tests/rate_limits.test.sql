-- Proves the rules from the rate_limits migration: the limit holds within the
-- window, a blocked attempt is not recorded, keys count separately, old attempts
-- stop counting, and only the service role can call the function or touch the
-- table. The window and limit numbers that lib/money-limits.ts uses are plain
-- arguments here, so this file checks the rules, not those numbers.
-- Run with: supabase test db
begin;

select plan(14);

-- Who may do what -------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'anonymous visitors cannot call consume_rate_limit');
select ok(
  not has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'signed-in people cannot call consume_rate_limit');
select ok(
  has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'the service role can call consume_rate_limit');
select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_hits', 'SELECT'),
  'signed-in people cannot read rate_limit_hits');
select ok(
  not has_table_privilege('anon', 'public.rate_limit_hits', 'INSERT'),
  'anonymous visitors cannot write rate_limit_hits');

-- The limit ---------------------------------------------------------------------------------------
select is(public.consume_rate_limit('test:a', 3, 3600), false, 'attempt 1 of 3 is allowed');
select is(public.consume_rate_limit('test:a', 3, 3600), false, 'attempt 2 of 3 is allowed');
select is(public.consume_rate_limit('test:a', 3, 3600), false, 'attempt 3 of 3 is allowed');
select is(public.consume_rate_limit('test:a', 3, 3600), true, 'attempt 4 is blocked');
select is(
  (select count(*)::int from public.rate_limit_hits where key = 'test:a'),
  3,
  'the blocked attempt is not recorded, so it does not extend the block');

select is(
  public.consume_rate_limit('test:b', 3, 3600),
  false,
  'a different key starts with its own count');

-- Old attempts stop counting -----------------------------------------------------------------
insert into public.rate_limit_hits (key, hit_at) values ('test:c', now() - interval '2 hours');
select is(
  public.consume_rate_limit('test:c', 1, 3600),
  false,
  'an attempt from before the window does not count against the limit');
select is(
  (select count(*)::int from public.rate_limit_hits where key = 'test:c'),
  1,
  'the expired attempt is deleted when its key is checked');
select is(
  public.consume_rate_limit('test:c', 1, 3600),
  true,
  'once the new attempt is inside the window, the limit holds again');

select * from finish();
rollback;
