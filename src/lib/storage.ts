import "server-only";

// File storage boundary (CLAUDE.md §2a): the only code that knows photos live
// in Supabase Storage. Moving to S3, R2 or a disk means rewriting this file;
// callers pass a user id and version and get a URL back. See docs/PROVIDERS.md.

import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseEnv } from "@/lib/supabase/env";

// Created by supabase/migrations/20261109133550_create_profile_photos_bucket.sql.
const BUCKET = "profile-photos";

// A new version gets a new name, so a photo's URL never changes content and
// can be cached for good.
const photoPath = (userId: string, version: number) =>
  `${userId}/${version}.webp`;

export function profilePhotoUrl(
  userId: string,
  version: number | null,
): string | null {
  if (version === null) return null;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${BUCKET}/${photoPath(userId, version)}`;
}

/** Stores an already-processed photo (lib/profile-photo.ts). */
export async function saveProfilePhoto(
  userId: string,
  version: number,
  webp: Buffer,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(photoPath(userId, version), webp, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
}

export async function deleteProfilePhoto(
  userId: string,
  version: number,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .remove([photoPath(userId, version)]);
  if (error) throw new Error(`photo delete failed: ${error.message}`);
}
