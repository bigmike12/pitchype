// How much a proof form may send in one request. The host stops a request
// body at about 4.5 MB (and the Server Action limit in next.config is 6 MB);
// past that the browser gets a plain error page instead of our action's
// answer, and the form is lost. So the browser adds up the pictures it is
// about to send and refuses before it tries. No framework imports, so Node's
// test runner can load it.

/** Under the host's 4.5 MB, with room for multipart framing. */
export const REQUEST_BUDGET_BYTES = 4 * 1024 * 1024;

/**
 * What the text fields can add: ten links of 500 characters, a note or a
 * dispute reason of 2,000 characters (up to 4 bytes each), and the form's
 * other fields.
 */
export const TEXT_ALLOWANCE_BYTES = 32 * 1024;

export const TOO_BIG_TOGETHER_MESSAGE =
  "These pictures are too big together. Remove one or choose smaller ones.";

/** True when pictures of these sizes (bytes) plus the text fit in one request. */
export function fitsRequestBudget(pictureSizes: number[]): boolean {
  const total = pictureSizes.reduce((sum, size) => sum + size, 0);
  return total + TEXT_ALLOWANCE_BYTES <= REQUEST_BUDGET_BYTES;
}
