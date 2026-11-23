-- Two admin decisions for creator portfolios (20261127100100): taking down a
-- work sample and removing a cover image. Added in their own migration
-- because a new enum value can't be used in the transaction that adds it.

alter type public.moderation_event_kind add value 'portfolio_sample_hidden';
alter type public.moderation_event_kind add value 'cover_removed';
