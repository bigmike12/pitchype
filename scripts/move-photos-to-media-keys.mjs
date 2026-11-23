// One-off: copies creators' pictures from the old folders named by user id
// (<user id>/...) to the new ones named by media key (<media key>/...), so
// public image addresses stop carrying user ids (migration 20261127100200).
// The run order for production is in docs/TODO.md, section 13.
//
//   node --env-file=<env file> scripts/move-photos-to-media-keys.mjs              dry run: what would be copied
//   node --env-file=<env file> scripts/move-photos-to-media-keys.mjs --apply      copy
//   node --env-file=<env file> scripts/move-photos-to-media-keys.mjs --delete-old           dry run of the clean-up
//   node --env-file=<env file> scripts/move-photos-to-media-keys.mjs --delete-old --apply   delete the old folders
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY, and the media_key
// column (migration 20261127100200) in that database.
//
// Copy, never move: the app before this change keeps reading the old paths
// until the new one is deployed. Copying is safe to repeat: a picture already
// at its new path is skipped. --delete-old removes old folders only once every
// current picture exists at its new path, and refuses otherwise. It prints
// counts only, never keys, ids or paths.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "profile-photos";
const PAGE = 1000;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const deleteOld = args.has("--delete-old");
for (const arg of args) {
  if (!["--apply", "--delete-old"].includes(arg)) {
    console.error(`Unknown option ${arg}. Use --apply and/or --delete-old.`);
    process.exit(1);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (pass --env-file=<file>).",
  );
  process.exit(1);
}
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
console.log(
  `Target: ${local ? "local Supabase" : "REMOTE Supabase project"}. ` +
    `Mode: ${deleteOld ? "delete old folders" : "copy"}${apply ? "" : " (dry run)"}.`,
);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const storage = supabase.storage.from(BUCKET);

/** Every row of a table, a page at a time. */
async function all(table, columns, filter = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(
      supabase.from(table).select(columns),
    ).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

const profiles = await all(
  "influencer_profiles",
  "user_id, media_key, photo_version, cover_version",
);
const samples = await all(
  "portfolio_samples",
  "id, user_id, image_version",
  (q) => q.not("image_version", "is", null),
);
const keyOf = new Map(profiles.map((p) => [p.user_id, p.media_key]));

// Every current picture: where it was, and where it goes.
const pictures = [];
for (const p of profiles) {
  if (p.media_key === p.user_id)
    throw new Error("a media key equals a user id");
  if (p.photo_version !== null) {
    pictures.push({
      from: `${p.user_id}/${p.photo_version}.webp`,
      to: `${p.media_key}/${p.photo_version}.webp`,
    });
  }
  if (p.cover_version !== null) {
    pictures.push({
      from: `${p.user_id}/cover-${p.cover_version}.webp`,
      to: `${p.media_key}/cover-${p.cover_version}.webp`,
    });
  }
}
for (const s of samples) {
  const mediaKey = keyOf.get(s.user_id);
  if (!mediaKey) continue;
  const name = `sample-${s.id}-${s.image_version}.webp`;
  pictures.push({ from: `${s.user_id}/${name}`, to: `${mediaKey}/${name}` });
}

async function exists(path) {
  const { data, error } = await storage.exists(path);
  // exists() reports a missing object as an error with data false.
  if (data) return true;
  if (
    error &&
    !/not ?found|404|400/i.test(`${error.message} ${error.status ?? ""}`)
  ) {
    throw new Error(`checking a picture failed: ${error.message}`);
  }
  return false;
}

const counts = {
  profiles: profiles.length,
  pictures: pictures.length,
  alreadyCopied: 0,
  copied: 0,
  wouldCopy: 0,
  missingSource: 0,
  failed: 0,
};

if (!deleteOld) {
  for (const picture of pictures) {
    if (await exists(picture.to)) {
      counts.alreadyCopied += 1;
    } else if (!(await exists(picture.from))) {
      // Nothing at either path: the database points at a picture that isn't
      // stored. Nothing to copy; report it.
      counts.missingSource += 1;
    } else if (!apply) {
      counts.wouldCopy += 1;
    } else {
      const { error } = await storage.copy(picture.from, picture.to);
      if (error) counts.failed += 1;
      else counts.copied += 1;
    }
  }
  console.log(counts);
  process.exit(counts.failed > 0 ? 1 : 0);
}

// --delete-old: only once every current picture is at its new path.
let notCopied = 0;
for (const picture of pictures) {
  if (!(await exists(picture.to))) notCopied += 1;
}
if (notCopied > 0) {
  console.error(
    `${notCopied} of ${pictures.length} pictures are not at their new path yet. ` +
      "Run the copy (--apply) first; nothing was deleted.",
  );
  process.exit(1);
}

// Everything under each creator's old folder, stale versions included.
let oldObjects = 0;
let deleted = 0;
let failedDeletes = 0;
for (const p of profiles) {
  const { data, error } = await storage.list(p.user_id, { limit: PAGE });
  if (error) throw new Error(`listing an old folder failed: ${error.message}`);
  const paths = data
    .filter((entry) => entry.id !== null) // files only, not sub-folders
    .map((entry) => `${p.user_id}/${entry.name}`);
  oldObjects += paths.length;
  if (!apply || paths.length === 0) continue;
  const removed = await storage.remove(paths);
  if (removed.error) failedDeletes += paths.length;
  else deleted += removed.data.length;
}
console.log({
  profiles: profiles.length,
  pictures: pictures.length,
  allCopied: true,
  oldObjects,
  [apply ? "deleted" : "wouldDelete"]: apply ? deleted : oldObjects,
  failed: failedDeletes,
});
process.exit(failedDeletes > 0 ? 1 : 0);
