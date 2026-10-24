# STORE-006 — Ready-made automation workflows

## Source and license

- Official source: https://github.com/codee-sh/medusa-plugin-automations
- Published module: `@codee-sh/medusa-plugin-automations@1.0.11`
- License: MIT (confirmed in upstream `LICENSE`, copyright Codee 2025).
- Advertised compatibility: Medusa >=2.8.8, Node >=20. **Current exact backend Medusa 2.22.0 still needs runtime verification.**

## Reused capabilities

The upstream plugin provides admin-managed event triggers, schedule and manual triggers, rules over order/product/inventory context, action registry, email and Slack actions, event subscribers and custom extension points. We will **not recreate its trigger/condition engine**.

Important boundaries:

- Dependency + staging-only plugin registration does not make the store's AI Sales Agent functional.
- Installed by CI as locked OSS package; default env `STORE_AUTOMATIONS_PLUGIN_ENABLED=false` and `STORE_AUTOMATIONS_STAGING_APPROVED=false`.
- Enabled staging build has *both email and Slack actions disabled*. External automation is blocked in production regardless of env values.
- No production migrations. The upstream plugin requires its own tables; run migrations only on isolated Medusa staging Postgres after review.
- No unsolicited WhatsApp, email marketing, voice calling, personalized offers or AI-led payment decisions. Consent and explicit message templates required.
- No connection between Medusa customer data and Minarva Technologies CRM until data mapping, access control and sync idempotency reviewed.
- Order payment, shipping rate, stock allocation and COD residual remain authoritative server-side Medusa and verified provider records.

## Follow-on integration gates

1. CI build and clean dependency install with pinned module, review plugin event subscriptions and outbound handlers.
2. Local sandbox plugin DB migrations and admin UI behavior, confirm no actions can dispatch with actions disabled.
3. Implement consent-backed transactional notifications through an approved provider and duplicate-delivery guard.
4. Use approved, read-only Medusa catalog information to ground the separate Malayalam/English sales AI. AI can recommend products and initiate customer-controlled checkout but may not capture payments or book shipments.
5. Enable production only after audited workflows, live account approval and explicit authorization.

No additional recurring paid AI/notification infrastructure is mandatory to install this plugin, although hosted services and messaging may cost extra.
