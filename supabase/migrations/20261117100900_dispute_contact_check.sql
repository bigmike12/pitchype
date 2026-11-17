-- Disputes refuse contact details in the database, like chat does, so the check
-- in src/lib/proof.ts cannot be bypassed by calling the functions directly.
-- Grants on write_dispute_statement carry over (create or replace).

-- Writes one statement and attaches its screenshots. The caller holds the
-- locks and has checked who may write and that the dispute is open. Links and
-- files follow the submission rules (submit_work). Contact details are refused
-- here, in the database, because open_dispute and add_dispute_statement are
-- callable straight through the API; the opening reason comes through here too.
-- Unlike chat, there is no strike: the text is simply not stored.
create or replace function public.write_dispute_statement(dispute uuid, author uuid, body text, links text[], file_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_body text := btrim(body);
  clean_links text[];
  files uuid[] := coalesce(file_ids, '{}');
  owned integer;
  written uuid;
begin
  if clean_body is null or char_length(clean_body) not between 1 and 2000 then
    raise exception 'statement_invalid' using errcode = 'P0001';
  end if;
  if public.contact_detail_kind(clean_body) is not null then
    raise exception 'contact_details' using errcode = 'P0001';
  end if;

  if exists (select 1 from unnest(coalesce(links, '{}')) l where l is null) then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  clean_links := array(select btrim(l) from unnest(coalesce(links, '{}')) with ordinality u(l, i) order by i);
  if cardinality(clean_links) > 10
     or cardinality(files) > 5
     or (select count(distinct f) from unnest(files) f) <> cardinality(files)
     or exists (select 1 from unnest(files) f where f is null)
     or exists (select 1 from unnest(clean_links) l
                 where char_length(l) > 500 or l !~* '^https?://\S+$') then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;

  select count(*) into owned from (
    select 1 from public.proof_files f
     where f.id = any(files) and f.owner_id = author
       and f.submission_id is null and f.dispute_statement_id is null
       for update
  ) x;
  if owned <> cardinality(files) then
    raise exception 'not_your_file' using errcode = 'P0001';
  end if;

  insert into public.dispute_statements (dispute_id, author_id, body, links)
  values (dispute, author, clean_body, clean_links)
  returning id into written;

  update public.proof_files f set dispute_statement_id = written where f.id = any(files);
  return written;
end;
$$;
