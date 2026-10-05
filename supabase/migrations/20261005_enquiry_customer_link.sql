-- Billing Foundation — Milestone 2B2
-- Add a durable enquiry -> customer link. Public website inserts remain column-restricted.

alter table public.enquiries
  add column if not exists customer_id uuid
  references public.customers(id)
  on delete set null;

create index if not exists enquiries_customer_id_idx
  on public.enquiries (customer_id)
  where customer_id is not null;

-- Backfill only explicit source-enquiry relationships where the mapping is unambiguous.
with unique_source_links as (
  select
    source_enquiry_id,
    (array_agg(id order by id))[1] as customer_id
  from public.customers
  where source_enquiry_id is not null
  group by source_enquiry_id
  having count(*) = 1
)
update public.enquiries e
set customer_id = u.customer_id
from unique_source_links u
where e.id = u.source_enquiry_id
  and e.customer_id is null;
