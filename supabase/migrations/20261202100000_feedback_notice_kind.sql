-- The notice a person gets when a feedback request of theirs ships
-- (20261202100100). Added in its own migration because a new enum value
-- can't be used in the transaction that adds it.

alter type public.notification_kind add value 'feedback_shipped';
