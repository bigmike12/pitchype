-- The per-minute backstop for notification emails (Stage 8).
--
-- Emails already send without this: the app sends them right after the action
-- that caused them, and at the end of the daily jobs. This schedule only
-- covers what those can't: a chat email goes out 15 minutes after the message
-- if the thread is still unread, and failed sends are retried. Without it the
-- app still works; those two just wait for the daily Vercel call.
--
-- Once a minute, Supabase pg_cron runs public.call_send_emails_route(), which
-- asks pg_net to GET <app_url>/api/cron/send-emails with
-- `Authorization: Bearer <cron_secret>`. The URL and the secret are read from
-- Supabase Vault at run time, so neither is in this file or in cron.job.
--
-- Manual setup on each environment (docs/TODO.md):
--   select vault.create_secret('https://<the live site>', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
-- Until both exist, the function does nothing. This migration also applies
-- cleanly where pg_cron or pg_net is not available (plain Postgres): the
-- function is created, and the schedule is skipped with a notice.

create or replace function public.call_send_emails_route()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Do nothing, quietly, where the pieces aren't there.
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  -- pg_net sends the request in the background; nothing waits for the answer.
  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/send-emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;

-- The function reads the secret, so only the scheduler's role (the owner) may
-- run it.
revoke all on function public.call_send_emails_route() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron or pg_net is not available: the email backstop is not scheduled';
    return;
  end if;

  begin
    create extension if not exists pg_net;
    create extension if not exists pg_cron;

    -- Re-applying replaces the job instead of doubling it.
    perform cron.unschedule(jobid) from cron.job where jobname = 'send-notification-emails';
    perform cron.schedule(
      'send-notification-emails',
      '* * * * *',
      'select public.call_send_emails_route()'
    );
  exception when others then
    -- For example pg_cron not preloaded, or not allowed to create it.
    raise notice 'the email backstop is not scheduled: %', sqlerrm;
  end;
end;
$$;
