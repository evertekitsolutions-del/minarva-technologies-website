-- Ensure own-business billing defaults exist without overwriting saved settings.
insert into public.business_billing_settings (
  singleton,
  business_name,
  country,
  default_currency,
  default_tax_mode,
  quotation_prefix,
  invoice_prefix,
  document_company_code,
  financial_year_start_month,
  default_quotation_valid_days
)
values (
  true,
  'Minarva Technologies',
  'India',
  'INR',
  'none',
  'QT',
  'INV',
  'MT',
  4,
  15
)
on conflict (singleton) do nothing;
