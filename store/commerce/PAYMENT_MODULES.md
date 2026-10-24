# Official payment SDK reuse — Minarva CCTV Store

## Selected reusable sources

- Backend: `cashfree-pg@6.0.6`, official Cashfree Node.js SDK; https://github.com/cashfree/cashfree-pg-sdk-nodejs. Provider package published by Cashfree Payments.
- Frontend: `@cashfreepayments/cashfree-js@1.0.7`, official browser checkout loader, MIT according to package manifest; https://github.com/cashfree/cashfree-js.
- Installed as pinned dependencies with reproducible `pnpm-lock.yaml`; dependency installation **does not** mean the gateway is connected or authorized.
- WooCommerce, unsupported community Razorpay checkout scripts and unverified SDK versions are not used.

## Authority split

1. Medusa is the sole authority for cart, confirmed order total and product stock.
2. Server-only Cashfree SDK may be invoked *only* in an audited Medusa v2 payment provider later, once merchant onboarding and application approval complete.
3. Browser may receive a payment-session token and call Cashfree's official hosted checkout loader. Browser payment return or success UI is **not payment confirmation**.
4. Signed/verified server-side payment webhook, reference amount + currency + cart/order identity, idempotency, duplicate/replay prevention and order completion must all pass.
5. Partial COD requires **two independent proofs**: captured prepaid shipping advance and Shiprocket-side COD collectable exactly equal to unpaid residual. Until then disable COD entirely.
6. Refunds, chargebacks, failed/expired sessions and partial payments must reconcile against immutable financial events.
7. Do not enable live provider in `medusa-config.ts` or Next.js UI until sandbox integration tests and explicit production authorization.

## Required next acceptance

- Cashfree merchant sandbox account and real merchant onboarding (KYC/bank).
- Medusa payment module adapter using official SDK, not manually rewritten Cashfree REST client.
- Checkout test: UPI success/failure/cancel, invalid/missing signatures, duplicated callbacks, stale price/quote, split COD, refund and amount mismatch.
- React checkout only mounts the official loader after server-created valid session; no sensitive API credentials in `NEXT_PUBLIC_*` vars.
- No gateway credential in repo, debug output, or client logs.

This file is a module provenance/integration contract, not a claim that checkout is live.

Peer-version note: Shiprocket 0.2.1 declares Medusa 2.12.4 peer requirements while store core is 2.22.0. Keep all external courier operations disabled pending compatibility verification.
