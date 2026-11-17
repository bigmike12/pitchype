import "server-only";

// The server half of attaching screenshots to a form: pull the pictures out
// of the request, run each through processProofImage, then store and register
// them. Shared by every form that takes proof (submitting work, opening a
// dispute, dispute statements).

import { MAX_PROOF_FILES } from "@/lib/proof";
import { processProofImage } from "@/lib/proof-image";
import { saveProofFile } from "@/lib/storage";

/** The form's non-empty `screenshot` files, in the order they were chosen. */
export function screenshotFiles(form: FormData): File[] {
  return form
    .getAll("screenshot")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

export const TOO_MANY_SCREENSHOTS = `Add up to ${MAX_PROOF_FILES} screenshots.`;

/**
 * Checks every picture first, so a bad third one saves nothing, then stores
 * them one after another (their order is the order they were registered).
 * Returns the proof file ids. A storage failure throws; the caller words it.
 * Files saved before a later refusal are left for the daily orphan sweep.
 */
export async function storeScreenshots(
  ownerId: string,
  files: File[],
): Promise<{ ok: true; fileIds: string[] } | { ok: false; message: string }> {
  const processed: Buffer[] = [];
  for (const file of files) {
    const result = await processProofImage(file);
    if (!result.ok) return { ok: false, message: result.message };
    processed.push(result.webp);
  }
  const fileIds: string[] = [];
  for (const webp of processed) {
    fileIds.push(await saveProofFile(ownerId, webp));
  }
  return { ok: true, fileIds };
}
