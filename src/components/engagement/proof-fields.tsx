"use client";

// The proof fields shared by every form that takes proof of work or of a
// problem: links (one per line) and up to five screenshots. Screenshots are
// shrunk in the browser before they go up, because the host caps a request
// at about 4.5 MB and phone photos run to 5 MB or more each; the server
// processes them again either way (lib/proof-image.ts).

import {
  FieldMessages,
  FieldLabel,
  TextAreaField,
} from "@/components/ui/field";
import {
  MAX_PROOF_FILES,
  MAX_PROOF_LINK_LENGTH,
  MAX_PROOF_LINKS,
} from "@/lib/proof";
import {
  fitsRequestBudget,
  TOO_BIG_TOGETHER_MESSAGE,
} from "@/lib/proof-budget";

// First pass: big enough to read a post's caption in a screenshot. If the
// pictures together are still over the request budget (busy photographs),
// one more pass at a smaller size and quality; then give up with a message.
const PASSES = [
  { maxEdge: 2000, quality: 0.8 },
  { maxEdge: 1400, quality: 0.7 },
];

/** Shrinks one picture; a file the browser can't decode goes up unchanged. */
async function shrinkScreenshot(
  file: File,
  { maxEdge, quality }: { maxEdge: number; quality: number },
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file); // applies EXIF rotation
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    // JPEG has no transparency: put see-through PNGs on white, not black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("no blob"))),
        "image/jpeg",
        quality,
      ),
    );
  } catch {
    return file;
  }
}

/**
 * The form's data with every `screenshot` file shrunk, in the order chosen,
 * or a message when the pictures can't be made to fit in one request (the
 * form is then left as it is). Forms call this from their submit handler and
 * pass the data to their action.
 */
export async function formDataWithShrunkScreenshots(
  form: HTMLFormElement,
): Promise<{ ok: true; data: FormData } | { ok: false; message: string }> {
  const data = new FormData(form);
  const files = data
    .getAll("screenshot")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { ok: true, data };

  for (const pass of PASSES) {
    const shrunk: Blob[] = [];
    for (const file of files) shrunk.push(await shrinkScreenshot(file, pass));
    // An undecodable file went through unchanged and counts at full size.
    if (!fitsRequestBudget(shrunk.map((blob) => blob.size))) continue;

    data.delete("screenshot");
    for (const [index, blob] of shrunk.entries()) {
      const file = files[index];
      data.append(
        "screenshot",
        blob,
        blob === file ? file.name : `screenshot-${index + 1}.jpg`,
      );
    }
    return { ok: true, data };
  }
  return { ok: false, message: TOO_BIG_TOGETHER_MESSAGE };
}

// Ten links of 500 characters plus a line break (or two) between them: more
// than this can't be valid, and a giant paste would blow the request budget.
const MAX_LINKS_TEXT_LENGTH = MAX_PROOF_LINKS * (MAX_PROOF_LINK_LENGTH + 2);

export function ProofFields({
  idPrefix,
  linksOptional = false,
  errors,
  onScreenshotsChange,
}: {
  /** Keeps ids apart when a page has two proof forms. */
  idPrefix: string;
  /** Links aren't needed when there is a screenshot (or nothing is required). */
  linksOptional?: boolean;
  errors?: { links?: string; screenshots?: string };
  /** Lets the form drop a "too big together" message once the choice changes. */
  onScreenshotsChange?: () => void;
}) {
  const shotsId = `${idPrefix}-screenshots`;
  return (
    <>
      <TextAreaField
        id={`${idPrefix}-links`}
        name="links"
        label="Links"
        optional={linksOptional}
        rows={3}
        autoComplete="off"
        maxLength={MAX_LINKS_TEXT_LENGTH}
        placeholder="https://www.instagram.com/p/…"
        hint={`One link per line, up to ${MAX_PROOF_LINKS}. Each starts with http:// or https://.`}
        error={errors?.links}
      />
      <div>
        <FieldLabel htmlFor={shotsId}>
          Screenshots <span className="font-normal text-muted">(optional)</span>
        </FieldLabel>
        <input
          id={shotsId}
          name="screenshot"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={onScreenshotsChange}
          aria-invalid={errors?.screenshots ? true : undefined}
          aria-describedby={
            errors?.screenshots
              ? `${shotsId}-hint ${shotsId}-error`
              : `${shotsId}-hint`
          }
          className="mt-2 block w-full text-sm text-body file:mr-4 file:h-11 file:cursor-pointer file:rounded-control file:border file:border-field file:bg-canvas file:px-4 file:font-semibold file:text-ink hover:file:bg-surface-card"
        />
        <FieldMessages
          id={shotsId}
          hint={`Choose all your screenshots at once, up to ${MAX_PROOF_FILES}: JPEG, PNG or WebP. We shrink them and remove location data.`}
          error={errors?.screenshots}
        />
      </div>
    </>
  );
}
