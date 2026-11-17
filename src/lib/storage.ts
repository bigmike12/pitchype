import "server-only";

// File storage boundary (CLAUDE.md §2a): the only code that knows photos live
// in Supabase Storage. Moving to S3, R2 or a disk means rewriting this file;
// callers pass a user id and version and get a URL back. See docs/PROVIDERS.md.

import { registerProofFile } from "@/lib/db/proof-files";
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

// Proof of work (screenshots) -------------------------------------------------------------------------------------

// Private bucket, created by supabase/migrations/20261117100000_create_submissions.sql.
// Nothing here is public: pages get short-lived signed URLs.
const PROOF_BUCKET = "work-proof";

// Long enough to read a page and open a picture, short enough that a copied
// link soon stops working.
const PROOF_URL_SECONDS = 10 * 60;

/**
 * Stores an already-processed screenshot (lib/proof-image.ts) at
 * `<owner id>/<uuid>.webp` and registers it for that owner; returns the proof
 * file's id, which submitting work or a dispute statement then attaches.
 * Screenshots of one form are ordered by when they were registered, so the
 * caller uploads them one after another.
 */
export async function saveProofFile(
  ownerId: string,
  webp: Buffer,
): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}.webp`;
  const bucket = createAdminClient().storage.from(PROOF_BUCKET);
  const { error } = await bucket.upload(path, webp, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw new Error(`proof upload failed: ${error.message}`);
  try {
    return await registerProofFile(ownerId, path, webp.byteLength);
  } catch (registerError) {
    // Don't leave a file nothing points to; the daily clean-up only knows
    // files that have a row.
    await bucket.remove([path]);
    throw registerError;
  }
}

/** A signed URL for each path that could be signed, valid for 10 minutes. */
export async function proofFileUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await createAdminClient()
    .storage.from(PROOF_BUCKET)
    .createSignedUrls(paths, PROOF_URL_SECONDS);
  if (error) throw new Error(`proof urls failed: ${error.message}`);
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/** Deletes screenshots from the bucket (their rows are removed elsewhere). */
export async function deleteProofObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await createAdminClient()
    .storage.from(PROOF_BUCKET)
    .remove(paths);
  if (error) throw new Error(`proof delete failed: ${error.message}`);
}
