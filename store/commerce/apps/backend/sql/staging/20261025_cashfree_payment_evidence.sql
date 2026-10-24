-- STORE-013 (staging only): immutable Cashfree payment evidence for the Medusa store.
-- Apply ONLY to the isolated Medusa PostgreSQL database after review.
-- This script is deliberately NOT part of Supabase CRM or auto Medusa migrations.
-- A row means "verified gateway evidence", NOT "Medusa payment captured" or
-- "fulfillment authorized". No webhook, order or shipping actions are defined.

BEGIN;

CREATE TABLE IF NOT EXISTS store_cashfree_payment_evidence (
  cashfree_order_id VARCHAR(128) PRIMARY KEY,
  cf_payment_id VARCHAR(128) NOT NULL UNIQUE,
  medusa_payment_session_id VARCHAR(128) NOT NULL UNIQUE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 9007199254740991),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  proof_key VARCHAR(300) NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'verified_unsettled'
    CHECK (stage = 'verified_unsettled'),
  first_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_cashfree_order_id_valid CHECK (cashfree_order_id ~ '^[A-Za-z0-9_-]{3,128}$'),
  CONSTRAINT store_cashfree_payment_id_valid CHECK (cf_payment_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  CONSTRAINT store_cashfree_medusa_session_valid CHECK (medusa_payment_session_id ~ '^payses_[A-Za-z0-9_-]{4,100}$'),
  CONSTRAINT store_cashfree_proof_key_valid CHECK (proof_key = 'cashfree:' || cashfree_order_id || ':' || cf_payment_id)
);

-- No public or anonymous database role may write receipts.
REVOKE ALL ON TABLE store_cashfree_payment_evidence FROM PUBLIC;

COMMENT ON TABLE store_cashfree_payment_evidence IS
  'Verified Cashfree gateway evidence only; never treated as captured/authorized Medusa payment or permission to fulfill.';
COMMENT ON COLUMN store_cashfree_payment_evidence.stage IS
  'Always verified_unsettled; a separate approved, transactional Medusa settlement workflow is required.';

COMMIT;
