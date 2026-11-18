// Data access for proof for the record on per-click hires: where the creator
// posted their link. Writes go through record_click_proof(), which checks the
// caller, the hire and the files under locks (migration 20261120100300); reads
// go through the session, so row level security decides who sees them, and
// only then are the screenshots signed.

import "server-only";

import { proofFileUrls } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/server";

import { refused, type Result } from "./refusal";

export type ClickProofView = {
  id: string;
  createdAt: string;
  note: string | null;
  links: string[];
  /** Signed, valid for 10 minutes, in upload order. */
  files: { url: string }[];
};

export async function recordClickProof(
  engagementId: string,
  note: string | null,
  links: string[],
  fileIds: string[],
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  // The generated types don't model SQL nulls for function arguments.
  const { data, error } = await supabase.rpc("record_click_proof", {
    engagement: engagementId,
    note: note as string,
    links,
    file_ids: fileIds,
  });
  if (error) return refused(error, "record click proof");
  return { ok: true, value: data };
}

/** A per-click hire's proof, oldest first, for either person or an admin. */
export async function listClickProofs(
  engagementId: string,
): Promise<ClickProofView[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("click_proofs")
    .select("id, note, links, created_at, proof_files (path, created_at)")
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: true })
    .order("created_at", { ascending: true, referencedTable: "proof_files" });
  if (error) throw new Error(`click proofs lookup failed (${error.code})`);
  const urls = await proofFileUrls(
    data.flatMap((row) => row.proof_files.map((file) => file.path)),
  );
  return data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    note: row.note,
    links: row.links,
    files: row.proof_files.flatMap((file) => {
      const url = urls.get(file.path);
      return url ? [{ url }] : [];
    }),
  }));
}
