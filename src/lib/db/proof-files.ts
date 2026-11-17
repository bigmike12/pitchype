// Records a screenshot that the server has just stored (lib/storage.ts), so
// that submitting work or a dispute statement can attach it. Its own file so
// storage.ts can register files without importing the code that reads them
// back through storage.

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registers an uploaded proof file for its owner and returns its id.
 * Secret-key client (register_proof_file is service_role-only), so the CALLER
 * passes the signed-in person's own id from requireUser(), never one from the
 * request. The database refuses a path outside `<owner id>/`.
 */
export async function registerProofFile(
  ownerId: string,
  path: string,
  bytes: number,
): Promise<string> {
  const { data, error } = await createAdminClient().rpc("register_proof_file", {
    owner: ownerId,
    path,
    content_type: "image/webp",
    bytes,
  });
  if (error) throw new Error(`proof file registration failed (${error.code})`);
  return data;
}
