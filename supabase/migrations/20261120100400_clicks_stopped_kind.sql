-- Told to the business when a per-click creator withdraws after starting: the
-- link stops counting and no money moves until the hold, so no settlement
-- notice fires (review finding). On its own because enum values can't be used
-- in the migration that adds them.
alter type public.notification_kind add value 'clicks_stopped';
