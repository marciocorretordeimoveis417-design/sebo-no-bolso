alter table public.livros add column if not exists capa_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists capas_select_own on storage.objects;
drop policy if exists capas_insert_own on storage.objects;
drop policy if exists capas_update_own on storage.objects;
drop policy if exists capas_delete_own on storage.objects;

create policy capas_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'capas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy capas_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'capas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy capas_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'capas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy capas_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'capas'
  and (storage.foldername(name))[1] = auth.uid()::text
);
