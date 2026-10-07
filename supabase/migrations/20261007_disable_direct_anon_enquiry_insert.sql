-- Platform — Milestone 4A1
-- Cut public website enquiries over to the hardened Edge Function.
-- Direct anonymous inserts are no longer permitted.

drop policy if exists "website_create_enquiry" on public.enquiries;
revoke insert on public.enquiries from anon;
