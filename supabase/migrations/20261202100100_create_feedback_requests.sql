-- Feedback requests (design: docs/superpowers/specs/2026-11-27-contact-and-feedback-design.md).
--
-- Businesses and creators send ideas and problems from /feedback; admins
-- triage them on /admin/feedback. What this protects:
--   1. Private: a person reads only their own requests; admins read all.
--      Nobody writes the table directly; every write goes through the
--      functions below.
--   2. The loop closes once: when a request ships, its sender and the sender
--      of every request merged into it get one `feedback_shipped` notice
--      (email queued by notify()). `shipped_at` is set the first time a row
--      ships and never cleared, so shipping again, or moving a request back
--      and shipping it later, tells nobody twice.
--   3. Merging never reveals another person's words: a merged request shows
--      its sender their own title with the main request's status and note.

create table public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  -- What people and admins call a request: #42.
  number bigint generated always as identity unique,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('idea', 'problem')),
  title text not null check (char_length(title) between 3 and 120),
  details text not null check (char_length(details) between 10 and 2000),
  status text not null default 'received'
    check (status in ('received', 'planned', 'shipped', 'not_planned')),
  -- Written by an admin, shown to the sender.
  admin_note text check (admin_note is null or char_length(admin_note) between 1 and 1000),
  duplicate_of uuid references public.feedback_requests (id),
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint feedback_requests_not_own_duplicate check (duplicate_of is distinct from id)
);

create index feedback_requests_user_created_idx
  on public.feedback_requests (user_id, created_at desc);
create index feedback_requests_duplicate_of_idx
  on public.feedback_requests (duplicate_of) where duplicate_of is not null;

create trigger feedback_requests_set_updated_at
  before update on public.feedback_requests
  for each row execute function public.set_updated_at();

alter table public.feedback_requests enable row level security;

create policy "people read their own feedback"
  on public.feedback_requests for select to authenticated
  using (user_id = public.current_user_id());

create policy "admins read all feedback"
  on public.feedback_requests for select to authenticated
  using (public.current_user_role() = 'admin');

revoke all on public.feedback_requests from anon;
revoke insert, update, delete, truncate on public.feedback_requests
  from authenticated, service_role;

-- Sending ---------------------------------------------------------------------------------

create function public.submit_feedback(kind text, title text, details text)
returns table (id uuid, number bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sender uuid := public.current_user_id();
  v_kind text := submit_feedback.kind;
  v_title text := btrim(coalesce(submit_feedback.title, ''));
  v_details text := btrim(coalesce(submit_feedback.details, ''));
begin
  if sender is null or public.current_user_role() not in ('business', 'influencer') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_kind is null or v_kind not in ('idea', 'problem')
     or char_length(v_title) not between 3 and 120
     or char_length(v_details) not between 10 and 2000 then
    raise exception 'feedback_invalid' using errcode = 'P0001';
  end if;

  return query
    insert into public.feedback_requests as f (user_id, kind, title, details)
    values (sender, v_kind, v_title, v_details)
    returning f.id, f.number;
end;
$$;

-- A person's own requests, newest first. A merged request shows the main
-- request's status and note (security definer, so it can read the main row),
-- never its title, details or sender.
create function public.my_feedback_requests()
returns table (
  id uuid,
  number bigint,
  kind text,
  title text,
  details text,
  status text,
  admin_note text,
  created_at timestamptz,
  merged boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         f.number,
         f.kind,
         f.title,
         f.details,
         coalesce(m.status, f.status),
         case when m.id is null then f.admin_note else m.admin_note end,
         f.created_at,
         m.id is not null
    from public.feedback_requests f
    left join public.feedback_requests m on m.id = f.duplicate_of
   where f.user_id = public.current_user_id()
   order by f.created_at desc, f.number desc
$$;

-- Admins ---------------------------------------------------------------------------------

-- Every request with who sent it. `status` is what the sender sees: the main
-- request's for a merged one.
create function public.admin_feedback_requests()
returns table (
  id uuid,
  number bigint,
  kind text,
  title text,
  details text,
  status text,
  admin_note text,
  created_at timestamptz,
  shipped_at timestamptz,
  duplicate_of_number bigint,
  duplicate_count integer,
  sender_role text,
  sender_email text,
  sender_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select f.id,
           f.number,
           f.kind,
           f.title,
           f.details,
           coalesce(m.status, f.status),
           f.admin_note,
           f.created_at,
           f.shipped_at,
           m.number,
           (select count(*)::integer from public.feedback_requests d where d.duplicate_of = f.id),
           u.role::text,
           u.email,
           public.display_name_of(u.id)
      from public.feedback_requests f
      join public.users u on u.id = f.user_id
      left join public.feedback_requests m on m.id = f.duplicate_of
     order by f.created_at desc, f.number desc;
end;
$$;

-- Ships a main request and everything merged into it that hasn't shipped
-- before, and tells each of those senders once. Called only from the admin
-- functions below, after they've locked the main row.
create function public.ship_feedback(main uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  main_note text;
  shipped record;
begin
  select admin_note into main_note from public.feedback_requests where id = main;

  for shipped in
    update public.feedback_requests
       set status = 'shipped', shipped_at = now()
     where (id = main or duplicate_of = main)
       and shipped_at is null
    returning id, user_id, number, title
  loop
    perform public.notify(
      shipped.user_id,
      'feedback_shipped',
      jsonb_build_object('number', shipped.number, 'title', shipped.title, 'note', main_note),
      'feedback_shipped:' || shipped.id
    );
  end loop;
end;
$$;

create function public.set_feedback_status(request_id uuid, new_status text, note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request public.feedback_requests;
  v_note text := nullif(btrim(coalesce(note, '')), '');
begin
  perform public.require_admin();
  if new_status is null or new_status not in ('received', 'planned', 'shipped', 'not_planned')
     or char_length(v_note) > 1000 then
    raise exception 'feedback_invalid' using errcode = 'P0001';
  end if;

  select * into request from public.feedback_requests where id = request_id for update;
  if not found then
    raise exception 'no_such_feedback' using errcode = 'P0001';
  end if;
  if request.duplicate_of is not null then
    raise exception 'is_duplicate' using errcode = 'P0001';
  end if;

  update public.feedback_requests
     set status = new_status, admin_note = v_note
   where id = request_id;

  if new_status = 'shipped' then
    perform public.ship_feedback(request_id);
  end if;
end;
$$;

create function public.mark_feedback_duplicate(request_id uuid, main_number bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request public.feedback_requests;
  main public.feedback_requests;
begin
  perform public.require_admin();

  select * into request from public.feedback_requests where id = request_id for update;
  if not found then
    raise exception 'no_such_feedback' using errcode = 'P0001';
  end if;
  select * into main from public.feedback_requests where number = main_number for update;
  if not found then
    raise exception 'no_such_feedback' using errcode = 'P0001';
  end if;
  if main.id = request.id then
    raise exception 'feedback_invalid' using errcode = 'P0001';
  end if;
  if main.duplicate_of is not null then
    raise exception 'main_is_duplicate' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.feedback_requests where duplicate_of = request_id) then
    raise exception 'has_duplicates' using errcode = 'P0001';
  end if;

  update public.feedback_requests set duplicate_of = main.id where id = request_id;

  -- Merged into something that's already live: tell this sender now.
  if main.status = 'shipped' then
    perform public.ship_feedback(main.id);
  end if;
end;
$$;

create function public.unmark_feedback_duplicate(request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.feedback_requests set duplicate_of = null where id = request_id;
  if not found then
    raise exception 'no_such_feedback' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.submit_feedback(text, text, text) from public, anon;
revoke all on function public.my_feedback_requests() from public, anon;
revoke all on function public.admin_feedback_requests() from public, anon;
revoke all on function public.ship_feedback(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_feedback_status(uuid, text, text) from public, anon;
revoke all on function public.mark_feedback_duplicate(uuid, bigint) from public, anon;
revoke all on function public.unmark_feedback_duplicate(uuid) from public, anon;

grant execute on function public.submit_feedback(text, text, text) to authenticated;
grant execute on function public.my_feedback_requests() to authenticated;
grant execute on function public.admin_feedback_requests() to authenticated;
grant execute on function public.set_feedback_status(uuid, text, text) to authenticated;
grant execute on function public.mark_feedback_duplicate(uuid, bigint) to authenticated;
grant execute on function public.unmark_feedback_duplicate(uuid) to authenticated;
