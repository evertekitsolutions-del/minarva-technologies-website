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
