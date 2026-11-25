-- Notification kinds for checkpoints (spec §5.6). Enum values can't be used in
-- the migration that adds them, so they come first, on their own. The rest
-- (reminders, overdue notices, warnings) arrive with the daily job.
--   kickoff_done     to the business, when the creator confirms the kickoff on time
--   checkpoint_done  to the business, when a checkpoint's evidence arrives on time
--   checkpoint_late  to the business, when evidence for an overdue checkpoint (or kickoff) arrives
alter type public.notification_kind add value 'kickoff_done';
alter type public.notification_kind add value 'checkpoint_done';
alter type public.notification_kind add value 'checkpoint_late';
