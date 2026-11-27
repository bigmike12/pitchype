-- Proves claim_due_emails() returns the name an email greets: a business's
-- contact name, a creator's display name, null with no profile; and that the
-- grants survived the function being made again.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000e9001', '99999999-0000-0000-0000-0000000e9001', 'nora.name@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000e9002', '99999999-0000-0000-0000-0000000e9002', 'tolu.name@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000e9003', '99999999-0000-0000-0000-0000000e9003', 'nobody.name@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000e9001', 'Nora Bakes Ltd', 'Nora Eze', 'Lagos', 'Ikeja');
insert into public.influencer_profiles (user_id, display_name, state, city) values
  ('00000000-0000-0000-0000-0000000e9002', 'Tolu Eats', 'Lagos', 'Yaba');

-- Other runs' queued rows must not be claimed here (rolled back with the rest).
update public.notifications set email_due_at = null;

insert into public.notifications (id, user_id, kind, data, email_due_at) values
  ('e9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000e9001', 'work_started', '{}', now() - interval '1 minute'),
  ('e9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000e9002', 'hire_funded', '{}', now() - interval '1 minute'),
  ('e9000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000e9003', 'payout_paid', '{}', now() - interval '1 minute');

create temp table claimed on commit drop as select * from public.claim_due_emails(50);

select is((select name from claimed where id = 'e9000000-0000-0000-0000-000000000001'), 'Nora Eze',
  'a business is greeted by its contact name, not the company');
select is((select name from claimed where id = 'e9000000-0000-0000-0000-000000000002'), 'Tolu Eats',
  'a creator is greeted by their display name');
select ok((select name is null from claimed where id = 'e9000000-0000-0000-0000-000000000003'),
  'someone with no profile gets a null name');

select ok(has_function_privilege('service_role', 'public.claim_due_emails(integer)', 'execute'),
  'the service role can still claim');
select ok(not has_function_privilege('authenticated', 'public.claim_due_emails(integer)', 'execute'),
  'signed-in people still cannot');

select * from finish();
rollback;
