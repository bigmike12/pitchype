-- Undoing a merge gives the request back its own life (found in review of
-- 20261202100100). A request merged into one that had already shipped was
-- marked shipped and its sender told; if the merge was a mistake, keeping
-- `shipped` and `shipped_at` would show them "Shipped" for something that
-- isn't live, and the shipped_at guard would stop them ever hearing when it
-- really ships. So a shipped request that's unmerged goes back to `received`
-- with `shipped_at` cleared. The cost: if it was genuinely shipped on its own
-- before being merged, shipping it again tells its sender a second time.

create or replace function public.unmark_feedback_duplicate(request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.feedback_requests
     set duplicate_of = null,
         status = case when status = 'shipped' then 'received' else status end,
         shipped_at = case when status = 'shipped' then null else shipped_at end
   where id = request_id;
  if not found then
    raise exception 'no_such_feedback' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.unmark_feedback_duplicate(uuid) from public, anon;
grant execute on function public.unmark_feedback_duplicate(uuid) to authenticated;
