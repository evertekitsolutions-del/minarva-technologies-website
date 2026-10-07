# Authenticated Production UAT

This harness verifies the real production admin login and protected production routes with a mobile Chromium viewport. Credentials are never committed.

Required GitHub Actions repository secrets:
- `UAT_ADMIN_EMAIL`
- `UAT_ADMIN_PASSWORD`

Run the **Authenticated Production UAT** workflow manually after the secrets exist.

This smoke test is evidence for authentication/protected-route/mobile-shell behavior only. It does **not** mark business-flow UAT gates as passed. Enquiry → Customer → Quotation → Invoice → Payment → Service Job → Technician and Customer Care/AI flows still require their own observed evidence before release sign-off.
