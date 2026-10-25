# STORE-024 — Never advertise an unapproved CCTV package

The existing Medusa DTC templates contained default "In stock", a calculated price and an "Add to cart" button even when the real Minarva hardware package was not owner-approved. The default prelaunch backend release gate already blocks checkout, but customer-facing claims must also fail closed.

This milestone reuses **Medusa's own product catalogue** and the owner-approved product metadata contract introduced by STORE-020. In the Next.js storefront:

- Product cards say **Price on enquiry** until a product is published and contains merchant-approved BOM, warranty/terms, packed weight/dimensions, positive INR calculated variant amounts and verified managed stock.
- Product details only display price/availability if approved, and refrain from emitting Product/Offer JSON-LD, Meta price or "In stock" if not.
- Both desktop and mobile add-to-cart buttons remain disabled before separate development-only, two-flag UI approval; production disables them unconditionally.
- The server-side Medusa Store cart-write release guard remains the real security control, even against browser API manipulation.
- A voluntarily clicked WhatsApp quotation link is available at +91 6235353732; no consent-free outbound messages or lead scraping.

This does not invent package prices/images, imply active stock or mark product records as approved. The separate **read-only operator CLI** `node store/scripts/audit-catalog.mjs` remains the source of the actual merchant catalogue readiness report.

Do not enable the two **frontend** sandbox flags unless the separate **backend** `STORE_PUBLIC_CHECKOUT_TEST_ENABLED=true` and `STORE_PUBLIC_CHECKOUT_TEST_APPROVED=true` are enabled *in isolated staging*, with merchant-approved test records. Even that does not authorize real Cashfree charges, Shiprocket booking or public checkout.

This is launch preparation, not final production launch.
