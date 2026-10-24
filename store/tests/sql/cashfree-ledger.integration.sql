-- Runs ONLY against disposable CI PostgreSQL after the staging-only schema.
-- Any failed assertion terminates psql with ON_ERROR_STOP.
\set ON_ERROR_STOP on

BEGIN;
INSERT INTO store_cashfree_payment_evidence
(cashfree_order_id, cf_payment_id, medusa_payment_session_id, amount_paise, proof_key)
VALUES ('mcf_pg_test_01','518230000123','payses_pgtestAAA',21900,
        'cashfree:mcf_pg_test_01:518230000123');

DO $$
DECLARE replay_id TEXT;
BEGIN
  -- Identical replay: one row and no additional ledger entry.
  INSERT INTO store_cashfree_payment_evidence AS existing (
    cashfree_order_id, cf_payment_id, medusa_payment_session_id,
    amount_paise, currency, proof_key
  ) VALUES (
    'mcf_pg_test_01','518230000123','payses_pgtestAAA',21900,'INR',
    'cashfree:mcf_pg_test_01:518230000123'
  )
  ON CONFLICT (cashfree_order_id)
  DO UPDATE SET cashfree_order_id = EXCLUDED.cashfree_order_id
  WHERE existing.cf_payment_id = EXCLUDED.cf_payment_id
    AND existing.medusa_payment_session_id = EXCLUDED.medusa_payment_session_id
    AND existing.amount_paise = EXCLUDED.amount_paise
    AND existing.currency = EXCLUDED.currency
    AND existing.proof_key = EXCLUDED.proof_key
  RETURNING cashfree_order_id INTO replay_id;
  IF replay_id <> 'mcf_pg_test_01' THEN
    RAISE EXCEPTION 'Identical replay was not accepted';
  END IF;

  -- Same Cashfree order cannot be mapped to another Medusa session.
  replay_id := NULL;
  INSERT INTO store_cashfree_payment_evidence AS existing (
    cashfree_order_id, cf_payment_id, medusa_payment_session_id,
    amount_paise, currency, proof_key
  ) VALUES (
    'mcf_pg_test_01','518230000123','payses_pgtestBBB',21900,'INR',
    'cashfree:mcf_pg_test_01:518230000123'
  )
  ON CONFLICT (cashfree_order_id)
  DO UPDATE SET cashfree_order_id = EXCLUDED.cashfree_order_id
  WHERE existing.cf_payment_id = EXCLUDED.cf_payment_id
    AND existing.medusa_payment_session_id = EXCLUDED.medusa_payment_session_id
    AND existing.amount_paise = EXCLUDED.amount_paise
    AND existing.currency = EXCLUDED.currency
    AND existing.proof_key = EXCLUDED.proof_key
  RETURNING cashfree_order_id INTO replay_id;
  IF FOUND OR replay_id IS NOT NULL THEN
    RAISE EXCEPTION 'Mismatched replay was incorrectly accepted';
  END IF;

  -- Other Cashfree order cannot reuse a payment ID.
  BEGIN
    INSERT INTO store_cashfree_payment_evidence
    (cashfree_order_id, cf_payment_id, medusa_payment_session_id, amount_paise, proof_key)
    VALUES ('mcf_pg_test_02','518230000123','payses_pgtestBBB',21900,
            'cashfree:mcf_pg_test_02:518230000123');
    RAISE EXCEPTION 'Duplicate payment identifier was not blocked';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Other Cashfree order cannot reuse the same Medusa payment session.
  BEGIN
    INSERT INTO store_cashfree_payment_evidence
    (cashfree_order_id, cf_payment_id, medusa_payment_session_id, amount_paise, proof_key)
    VALUES ('mcf_pg_test_03','518230000124','payses_pgtestAAA',21900,
            'cashfree:mcf_pg_test_03:518230000124');
    RAISE EXCEPTION 'Duplicate Medusa payment session was not blocked';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Cannot insert a captured/settled state into the evidence-only ledger.
  BEGIN
    INSERT INTO store_cashfree_payment_evidence
    (cashfree_order_id, cf_payment_id, medusa_payment_session_id,
     amount_paise, proof_key, stage)
    VALUES ('mcf_pg_test_04','518230000125','payses_pgtestDDD',
            21900,'cashfree:mcf_pg_test_04:518230000125','captured');
    RAISE EXCEPTION 'Unsafe stage was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Cannot store non-INR or invalid amount.
  BEGIN
    INSERT INTO store_cashfree_payment_evidence
    (cashfree_order_id, cf_payment_id, medusa_payment_session_id,
     amount_paise, currency, proof_key)
    VALUES ('mcf_pg_test_05','518230000126','payses_pgtestEEE',
            21900,'USD','cashfree:mcf_pg_test_05:518230000126');
    RAISE EXCEPTION 'Wrong currency was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO store_cashfree_payment_evidence
    (cashfree_order_id, cf_payment_id, medusa_payment_session_id,
     amount_paise, proof_key)
    VALUES ('mcf_pg_test_06','518230000127','payses_pgtestFFF',
            0,'cashfree:mcf_pg_test_06:518230000127');
    RAISE EXCEPTION 'Zero amount was not rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Appending evidence must NEVER permit retroactive modification/removal.
  BEGIN
    UPDATE store_cashfree_payment_evidence
    SET amount_paise = 1 WHERE cashfree_order_id = 'mcf_pg_test_01';
    RAISE EXCEPTION 'Mutation guard failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Mutation guard failed' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM store_cashfree_payment_evidence
    WHERE cashfree_order_id = 'mcf_pg_test_01';
    RAISE EXCEPTION 'Delete guard failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Delete guard failed' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM store_cashfree_payment_evidence) <> 1 THEN
    RAISE EXCEPTION 'Replay/conflicting writes produced unexpected row count';
  END IF;

  RAISE NOTICE 'Cashfree ledger PostgreSQL integrity checks passed';
END $$;
ROLLBACK;
