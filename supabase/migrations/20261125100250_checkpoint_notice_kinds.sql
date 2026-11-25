-- Notification kinds for the daily checkpoint notices (spec §5.6). Enum values
-- can't be used in the migration that adds them, so they come first.
--   checkpoint_reminder           to the creator, once, when a checkpoint is due within a day
--   checkpoint_overdue            to both, once, when a checkpoint (or the kickoff) passes its due time
--   checkpoint_warning            to the creator, once, two days overdue, with the date a dispute could open
--   checkpoint_dispute_available  to the business, once, when it may open a dispute about missing work early
alter type public.notification_kind add value 'checkpoint_reminder';
alter type public.notification_kind add value 'checkpoint_overdue';
alter type public.notification_kind add value 'checkpoint_warning';
alter type public.notification_kind add value 'checkpoint_dispute_available';
