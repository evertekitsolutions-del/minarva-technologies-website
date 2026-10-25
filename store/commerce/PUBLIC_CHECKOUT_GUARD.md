# STORE-018 — Customer checkout lock (server-side, fail closed)

Minarva CCTV Store is not commercially launched. The Next.js cashier UI alone is **not** a security control: anyone can attempt to call the existing public Medusa Store API directly.

This milestone reuses Medusa's native `src/api/middlewares.ts` support (no route/commerce engine replacement) and intercepts **POST /store/carts/:id/complete** before Medusa's native order-completion workflow.

- No public cart can be completed without BOTH `STORE_PUBLIC_CHECKOUT_TEST_ENABLED=true` and `STORE_PUBLIC_CHECKOUT_TEST_APPROVED=true`.
- `NODE_ENV=production` always refuses public checkout **even if flags are true**. A future production launch requires its own separately reviewed explicit policy change.
- Existing cart/product browsing and admin backoffice operations remain available.
- The response is HTTP 503 with generic non-sensitive copy; no payment capture or courier booking is performed by this middleware.
- No secrets or paid external APIs were added.
- More sandbox testing does not authorize real customers to pay, use shipping balances or order goods.

**Before permitting production public orders**: verified Cashfree paid/refund lifecycle, Shiprocket actual all-in delivery rates and residual COD merchant agreement, real product catalog + stock + dimensions, India GST/legal policies, device tests, domain/hosting and explicit merchant release approval. No payment system can be marked live based on CI mocks.

Source: official [Medusa middleware documentation](https://docs.medusajs.com/learn/fundamentals/api-routes/middlewares) supports route-scoped matching for POST requests; built-in cart completion endpoint is used by the existing `sdk.store.cart.complete` flow.

## Real HTTP regression check (STORE-019)

The existing GitHub Medusa runtime smoke job now starts actual Medusa v2 against **disposable** PostgreSQL 16 and Redis 7, waits for `/health`, then makes a real `POST /store/carts/cart_ci_never_create/complete` HTTP request with both checkout flags explicitly false. It must receive HTTP 503 with the exact Minarva release-gate message. HTTP 401/404 do **not** count as a pass because those would not prove our middleware intercepted the request. No merchant token, real cart, payment, or shipment is created.


## STORE-023 — Entire cart-write API locked before merchant release

A checkout-only block left existing Medusa `POST /store/carts`, line-item, shipping/promotion and update endpoints accessible directly even when checkout was disabled. The shared backend guard now blocks all **POST/PUT/PATCH/DELETE** routes matching the exact `/store/carts` subtree until the **same existing double-approved isolated-sandbox flags** permit local testing. Product browsing, permitted GET cart views, Medusa Admin, signed Cashfree webhooks and search endpoints are unaffected.

**GitHub runtime CI must verify actual HTTP 503** from all five representative Medusa mutation routes, not a 401/404 from missing publishable keys. A separate backend unit suite exercises the path/method gate including case variations and ambiguous sibling paths. No credentials or external services involved.

This is a prelaunch defense. It does not itself guarantee inventory/price validation during a future commercial release: server-authoritative Medusa cart items, secure payment allocation, tax, region and shipping remain necessary before the business may approve checkout.
