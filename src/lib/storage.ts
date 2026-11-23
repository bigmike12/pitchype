import "server-only";

// File storage boundary (CLAUDE.md §2a): the only code that knows photos live
// in Supabase Storage. Moving to S3, R2 or a disk means rewriting this file;
// callers pass a user id and version and get a URL back. See docs/PROVIDERS.md.

import { registerProofFile } from "@/lib/db/proof-files";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseEnv } from "@/lib/supabase/env";

// Created by supabase/migrations/20261109133550_create_profile_photos_bucket.sql.
const BUCKET = "profile-photos";

// A new version gets a new name, so an image's URL never changes content and
// can be cached for good.
const photoPath = (userId: string, version: number) =>
  `${userId}/${version}.webp`;
const coverPath = (userId: string, version: number) =>
  `${userId}/cover-${version}.webp`;
const samplePath = (userId: string, sampleId: string, version: number) =>
  `${userId}/sample-${sampleId}-${version}.webp`;

function publicUrl(path: string): string {
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function uploadImage(path: string, webp: Buffer): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, webp, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(`image upload failed: ${error.message}`);
}

async function deleteImage(path: string): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .remove([path]);
  if (error) throw new Error(`image delete failed: ${error.message}`);
}

export function profilePhotoUrl(
  userId: string,
  version: number | null,
): string | null {
  return version === null ? null : publicUrl(photoPath(userId, version));
}

/** Stores an already-processed photo (lib/profile-photo.ts). */
export function saveProfilePhoto(
  userId: string,
  version: number,
  webp: Buffer,
): Promise<void> {
  return uploadImage(photoPath(userId, version), webp);
}

export function deleteProfilePhoto(
  userId: string,
  version: number,
): Promise<void> {
  return deleteImage(photoPath(userId, version));
}

// Covers and work samples live in the same public bucket, beside the photo.

export function coverUrl(
  userId: string,
  version: number | null,
): string | null {
  return version === null ? null : publicUrl(coverPath(userId, version));
}

export function saveCover(
  userId: string,
  version: number,
  webp: Buffer,
): Promise<void> {
  return uploadImage(coverPath(userId, version), webp);
}

export function deleteCover(userId: string, version: number): Promise<void> {
  return deleteImage(coverPath(userId, version));
}

export function sampleUrl(
  userId: string,
  sampleId: string,
  version: number,
): string {
  return publicUrl(samplePath(userId, sampleId, version));
}

export function saveSampleImage(
  userId: string,
  sampleId: string,
  version: number,
  webp: Buffer,
): Promise<void> {
  return uploadImage(samplePath(userId, sampleId, version), webp);
}

export function deleteSampleImage(
  userId: string,
  sampleId: string,
  version: number,
): Promise<void> {
  return deleteImage(samplePath(userId, sampleId, version));
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

/**
 * A signed URL for each path that could be signed, valid for 10 minutes.
 * Signing skips row level security, so pass only paths read back through the
 * signed-in person's own session client (which RLS has already filtered),
 * never a path that came from a request.
 */
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
