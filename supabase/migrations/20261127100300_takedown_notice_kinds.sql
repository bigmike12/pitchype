-- The creator is told when an admin takes down a work sample or removes
-- their cover (20261127100400). Added in their own migration because a new
-- enum value can't be used in the transaction that adds it.

alter type public.notification_kind add value 'portfolio_sample_hidden';
alter type public.notification_kind add value 'cover_removed';
