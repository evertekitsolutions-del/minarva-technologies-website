# AMC/Warranty continuation

Work extends existing Minarva Technologies Service Jobs and Technician PWA; do not restart prior modules. The AMC/Warranty register defaults inactive. Existing pg_cron prepares recurring planned visits over a 45-day horizon only when a contract is activated. All customer jobs require explicit admin approval, with unique visit-to-job mapping. No outbound calls or paid integrations. Remaining: staged authenticated UAT, full AMC renewal/billing, parts, WhatsApp approvals, release recovery drill and completion rebaseline.

## Service RPC privilege boundary — 2026-10-19

Supabase Security Advisor identified two public SECURITY DEFINER entry points:
`acknowledge_service_sla_alert(uuid)` and `refresh_maintenance_schedule()`.
Migration `20261019_service_rpc_private_boundaries.sql` moves the unchanged
administrator-authorized write/refresh logic to non-exposed
`service_ops_private`. Their original public RPC signatures now use
SECURITY INVOKER wrappers with explicit authenticated-only EXECUTE.
The definer bodies additionally reject a missing auth user and recheck
`private.is_active_admin()` before touching any records.
The database cron service refresh, outbox, API responses and website UI
are not changed. No production service jobs or messages are generated.
The new regression contract runs in Service Pages Integrity CI.
A live SQL privilege check and a fresh Supabase Security Advisor scan are
required before this milestone may be marked verified. The independent
Auth leaked-password protection warning remains outside this migration.
