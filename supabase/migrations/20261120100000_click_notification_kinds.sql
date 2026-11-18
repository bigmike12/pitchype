-- Notification kinds for pay per click (Part 2). Enum values can't be used in
-- the migration that adds them, so they come first, on their own.
--   click_cap_reached   to the creator, once, when their link reaches its cap
--   click_hold_started  to both people, once, when the click window ends
alter type public.notification_kind add value 'click_cap_reached';
alter type public.notification_kind add value 'click_hold_started';
