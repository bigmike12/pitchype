-- The Stage 7 notification kinds (design §5, CLAUDE.md §8). In a file of their
-- own because a new enum value can't be used in the transaction that adds it:
-- send_review_reminders() (auto_release migration) and the Stage 7 triggers
-- write these.
--
--   work_submitted     to the business  a submission is made
--   submission_denied  to the creator   denied, with the reasons
--   review_reminder    to the business  3 days and 1 day before the review deadline
--   dispute_opened     to the other person
--   dispute_statement  to the other person
--   dispute_withdrawn  to the other person

alter type public.notification_kind add value 'work_submitted';
alter type public.notification_kind add value 'submission_denied';
alter type public.notification_kind add value 'review_reminder';
alter type public.notification_kind add value 'dispute_opened';
alter type public.notification_kind add value 'dispute_statement';
alter type public.notification_kind add value 'dispute_withdrawn';
