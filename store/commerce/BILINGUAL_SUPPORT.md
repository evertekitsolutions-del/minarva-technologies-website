# STORE-021 — Malayalam / English CCTV support fallback

This milestone adds a **free customer-help interface** to the existing Medusa DTC storefront while the merchant AI service is not approved.

It is deliberately **not marketed as a generative AI agent**: it uses deterministic bilingual FAQ responses, and performs a read-only search through Medusa's already-existing public Store Products API (only approved, published catalogue records are eligible to be referenced). A customer may ask about package prices, stock, warranty, installation and Kerala shipping. Missing price/rates or unverified warranty are explicitly NOT invented, and no browser callback can trigger purchase.

## Code
- `apps/storefront/src/lib/cctv-support.ts`: bilingual intent classification and cautious answers. No network calls or persistence.
- `apps/storefront/src/app/api/cctv-support/route.ts`: public read-only Next.js API, 2–160-character requests, Medusa public published products only. No AI API provider, conversation storage or payments.
- `apps/storefront/src/modules/layout/components/cctv-support/index.tsx`: optional accessible help widget, input field and user-initiated WhatsApp contact to Minarva Technologies at +91 6235353732.
- Main country-code storefront layout renders the support widget. No outbound WhatsApp calls, unsolicited promotions, consent-free contacts, email/phone data capture or AI inference.
- `store/tests/bilingual-support.test.mjs`: verification tests; Next.js build/typechecks cover React/route compatibility.

## Production reality

Because owner policy forbids recurring paid AI/infra until 25-customer checkpoint, paid ChatGPT/Gemini APIs are not enabled. An actual generative sales-agent would require an approved provider-neutral/self-hosted inference backend, catalogue grounding with authoritative stock/price, conversation safety guardrails, evaluations, rate limiting, consent/privacy review and an operator override.

This fallback is a **limited customer FAQ interface**, not an autonomous sales agent. Its answers correctly state live payment/partial COD remain disabled. This module cannot fulfill orders or promise a courier charge. All real merchant products, images and rates still must be verified separately.

## Next

Introduce a provider-neutral open model connector with local/on-prem inference once infrastructure and real products are approved. Keep read-only assistance as fallback when model unavailable; never disclose admin products, merchant credentials or make guaranteed claims without verified Medusa/store references. Complete product catalog readiness (STORE-020) and full prepaid/COD and shipping merchant sandbox E2E before public checkout.
