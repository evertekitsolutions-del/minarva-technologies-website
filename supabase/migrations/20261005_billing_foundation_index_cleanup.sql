-- Billing Foundation — performance advisor cleanup
create index if not exists customers_created_by_idx
  on public.customers (created_by)
  where created_by is not null;

create index if not exists catalogue_items_created_by_idx
  on public.catalogue_items (created_by)
  where created_by is not null;

create index if not exists quotation_items_catalogue_item_idx
  on public.quotation_items (catalogue_item_id)
  where catalogue_item_id is not null;

create index if not exists quotations_created_by_idx
  on public.quotations (created_by)
  where created_by is not null;
