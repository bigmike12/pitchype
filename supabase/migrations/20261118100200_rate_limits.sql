-- Shared rate limits (CLAUDE.md §7). The limits used to live in each server's
-- memory, so on Vercel a client could get a fresh allowance from every
-- instance. Each attempt is now a row here, and every instance counts the same
-- rows.
--
-- Only the server calls this, through the service role (lib/db/rate-limits.ts).
-- The table has no policies and no grants to anon or authenticated, so no
-- browser can read it or write to it.
--
-- A limited attempt is not recorded, so being blocked does not extend the
-- block. Rows older than the window are deleted for their key whenever that
-- key is checked; the key is always the limiter's name plus the person or
-- address, so the table holds no more than the recent attempts of each key.

create table public.rate_limit_hits (
  key text not null,
  hit_at timestamptz not null default now()
);

create index rate_limit_hits_key_hit_at_idx on public.rate_limit_hits (key, hit_at);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- Records one attempt for `p_key` and reports whether it is over the limit:
-- true means blocked (and nothing is recorded), false means allowed.
--
-- The advisory lock makes two concurrent attempts on one key count one after
-- the other, so a burst cannot slip past the limit.
create function public.consume_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));

  delete from public.rate_limit_hits
    where key = p_key
      and hit_at <= now() - make_interval(secs => p_window_seconds);

  select count(*) into v_recent
    from public.rate_limit_hits
    where key = p_key;

  if v_recent >= p_max then
    return true;
  end if;

  insert into public.rate_limit_hits (key) values (p_key);
  return false;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
