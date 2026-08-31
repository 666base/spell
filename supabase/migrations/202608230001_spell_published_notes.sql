create table if not exists public.spell_published_notes (
  token uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 1024),
  title text not null default '',
  updated_at timestamptz not null default now(),
  unique (owner_id, path)
);

alter table public.spell_published_notes enable row level security;

drop policy if exists "Spell users can read their published notes" on public.spell_published_notes;
create policy "Spell users can read their published notes"
on public.spell_published_notes for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Spell users can create published notes" on public.spell_published_notes;
create policy "Spell users can create published notes"
on public.spell_published_notes for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Spell users can update published notes" on public.spell_published_notes;
create policy "Spell users can update published notes"
on public.spell_published_notes for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Spell users can delete published notes" on public.spell_published_notes;
create policy "Spell users can delete published notes"
on public.spell_published_notes for delete
to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spell-published',
  'spell-published',
  true,
  5242880,
  array['text/html']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read published Spell notes" on storage.objects;
create policy "Anyone can read published Spell notes"
on storage.objects for select
to public
using (bucket_id = 'spell-published');

drop policy if exists "Owners can upload published Spell notes" on storage.objects;
create policy "Owners can upload published Spell notes"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'spell-published'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.html$'
  and exists (
    select 1
    from public.spell_published_notes p
    where p.owner_id = (select auth.uid())
      and p.token::text = left(name, 36)
  )
);

drop policy if exists "Owners can update published Spell notes" on storage.objects;
create policy "Owners can update published Spell notes"
on storage.objects for update
to authenticated
using (
  bucket_id = 'spell-published'
  and exists (
    select 1
    from public.spell_published_notes p
    where p.owner_id = (select auth.uid())
      and p.token::text = left(name, 36)
  )
)
with check (
  bucket_id = 'spell-published'
  and exists (
    select 1
    from public.spell_published_notes p
    where p.owner_id = (select auth.uid())
      and p.token::text = left(name, 36)
  )
);

drop policy if exists "Owners can delete published Spell notes" on storage.objects;
create policy "Owners can delete published Spell notes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'spell-published'
  and exists (
    select 1
    from public.spell_published_notes p
    where p.owner_id = (select auth.uid())
      and p.token::text = left(name, 36)
  )
);

create or replace function public.spell_publish_note(p_path text, p_title text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_path is null or char_length(btrim(p_path)) = 0 then
    raise exception 'Path is required';
  end if;

  insert into public.spell_published_notes (owner_id, path, title, updated_at)
  values (auth.uid(), p_path, coalesce(p_title, ''), now())
  on conflict (owner_id, path) do update
  set title = excluded.title,
      updated_at = now()
  returning token into v_token;

  return v_token;
end;
$$;

create or replace function public.spell_published_token(p_path text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select token into v_token
  from public.spell_published_notes
  where owner_id = auth.uid()
    and path = p_path;

  return v_token;
end;
$$;

create or replace function public.spell_unpublish_note(p_path text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.spell_published_notes
  where owner_id = auth.uid()
    and path = p_path
  returning token into v_token;

  return v_token;
end;
$$;

create or replace function public.spell_move_published_note(p_from text, p_to text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_from is null or p_to is null or p_from = p_to then
    return null;
  end if;

  delete from public.spell_published_notes
  where owner_id = auth.uid()
    and path = p_to
    and path is distinct from p_from;

  update public.spell_published_notes
  set path = p_to,
      updated_at = now()
  where owner_id = auth.uid()
    and path = p_from
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.spell_publish_note(text, text) from public;
revoke all on function public.spell_published_token(text) from public;
revoke all on function public.spell_unpublish_note(text) from public;
revoke all on function public.spell_move_published_note(text, text) from public;

grant execute on function public.spell_publish_note(text, text) to authenticated;
grant execute on function public.spell_published_token(text) to authenticated;
grant execute on function public.spell_unpublish_note(text) to authenticated;
grant execute on function public.spell_move_published_note(text, text) to authenticated;
