-- Customer Care — Milestone 3B2 performance hardening.
create index if not exists customer_care_dead_letters_provider_adapter_idx
  on public.customer_care_dead_letters(provider_adapter_key)
  where provider_adapter_key is not null;

create index if not exists customer_care_test_allowlist_created_by_idx
  on public.customer_care_test_allowlist(created_by)
  where created_by is not null;
