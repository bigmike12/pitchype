-- The bucket for creators' profile photos (Stage 3). Supabase-specific
-- (storage.buckets); see docs/PROVIDERS.md for what replaces it.
--
-- Public read, so photos load from a plain URL. There are no policies on
-- storage.objects for this bucket, so only the server, using the secret key,
-- can write: every photo has been through the server's image pipeline
-- (src/lib/profile-photo.ts). The limits repeat what the pipeline produces.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 1048576, array['image/webp']);
