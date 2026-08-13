create table if not exists public.spell_notes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 1024),
  content text not null default '',
  modified_at bigint not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, path)
);

alter table public.spell_notes enable row level security;

drop policy if exists "Spell users can read their notes" on public.spell_notes;
create policy "Spell users can read their notes"
on public.spell_notes for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Spell users can create their notes" on public.spell_notes;
create policy "Spell users can create their notes"
on public.spell_notes for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Spell users can update their notes" on public.spell_notes;
create policy "Spell users can update their notes"
on public.spell_notes for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create or replace function public.spell_sync_note(
  p_path text,
  p_content text,
  p_modified_at bigint,
  p_deleted boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.spell_notes (
    owner_id,
    path,
    content,
    modified_at,
    deleted,
    updated_at
  ) values (
    auth.uid(),
    p_path,
    case when p_deleted then '' else p_content end,
    p_modified_at,
    p_deleted,
    now()
  )
  on conflict (owner_id, path) do update
  set content = excluded.content,
      modified_at = excluded.modified_at,
      deleted = excluded.deleted,
      updated_at = now()
  where excluded.modified_at >= public.spell_notes.modified_at;
end;
$$;

revoke all on function public.spell_sync_note(text, text, bigint, boolean) from public;
grant execute on function public.spell_sync_note(text, text, bigint, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'spell_notes'
  ) then
    alter publication supabase_realtime add table public.spell_notes;
  end if;
end
$$;
