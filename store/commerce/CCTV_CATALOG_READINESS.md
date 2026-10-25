# STORE-020 — CCTV package catalogue readiness

Medusa **already** has product Admin, variants, inventory quantities, product-import/export workflows, and storefront product listing. We reuse those rather than writing a second catalogue and inventory service.

However, publishing a basic Medusa product is not enough for a Kerala-wide CCTV hardware package: every customer-facing offer also needs authoritative kit contents (BOM), warranty, installation-included status, packed weight/box dimensions for courier billing, India INR price and verified stock.

## Implementation

- `store/lib/cctv-package-readiness.mjs`: validates a product export against required package fields. Returns reasoned status; never invents missing values or marks products published.
- `store/tests/cctv-package-readiness.test.mjs`: exercises stock/price/BOM/box/warranty/duplicate-SKU negative cases using **synthetic test data only**.
- `store/scripts/audit-catalog.mjs`: offline operator utility. Pass a JSON export containing an array of products or `{ "products": [ ... ] }`. Exits 0 only when every audited product is complete, has valid positive INR calculated price and quantities, and no shared SKU. Exits 1 for incomplete catalogue, 2 for bad input. It does **not** connect to any cloud service or expose credentials.

Example command:

```bash
node store/scripts/audit-catalog.mjs /path/to/medusa-product-export.json
```

Important: that JSON must be a **trusted merchant-approved Medusa export**, including live stock quantities and calculated INR prices, not public browser form input. Medusa's public Store Products API may exclude inventory if not explicitly requested; a partial export fails closed.

## Product metadata contract (store in Medusa Admin)

| Field | Type | Required |
|---|---|---|
| `minarva_sale_approved` | boolean | true after merchant verification |
| `minarva_brand` | string | actual camera brand |
| `minarva_market` | string | `Kerala` |
| `minarva_kit_components` | array of `{name, quantity}` | exact components, unique names |
| `minarva_camera_warranty_months` | integer | merchant-approved terms |
| `minarva_recorder_warranty_months` | integer | merchant-approved terms |
| `minarva_installation_included` | boolean | explicitly true/false |
| `minarva_returns_policy_ref` | string | actual policy version/reference |
| `minarva_warranty_terms_ref` | string | actual warranty/exclusion terms |
| `minarva_packed_weight_grams` | integer | measured packed shipment weight |
| `minarva_box_length_cm` | integer | packed dimension |
| `minarva_box_breadth_cm` | integer | packed dimension |
| `minarva_box_height_cm` | integer | packed dimension |

Standard Medusa fields also required: product `id`, `title`, `description`, `status=published`, HTTPS `thumbnail`, at least one variant with unique `sku`, `manage_inventory=true`, positive verified `inventory_quantity`, and `calculated_price.currency_code=inr` with positive `calculated_amount`.

These metadata fields are a **validation contract**, not evidence that any customer product exists. Do not copy test examples into production or make an unauthorized offer.

## Next work before selling

Populate the *real* approved product/stock/catalogue using Medusa's OSS Admin and product-import functions. Obtain real camera package photos, customer terms, weight/dimensions and GST invoices. Wire only audited products into approved checkout and AI answers. Shiprocket rate and partial COD must be confirmed with merchant account and external charges approved. Payment sandbox end-to-end remains unverified; production checkout stays locked.
