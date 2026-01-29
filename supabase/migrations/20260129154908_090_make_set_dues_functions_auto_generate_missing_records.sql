/*
  # Make Set Dues Functions Smart - Auto-Generate Missing Records
  
  ## Problem
  When units are imported AFTER a fiscal period starts, they don't have dues records.
  The "Set Dues" functions fail silently because there's nothing to update.
  
  ## Solution
  Both dues-setting functions now automatically call `generate_fiscal_period_dues()`
  before updating amounts. This ensures all current units have placeholder records
  for the fiscal period, catching any units added after the period started.
  
  ## Changes
  1. set_all_units_monthly_due: Now generates missing dues first, then updates all
  2. set_varied_unit_monthly_dues: Now generates missing dues first, then updates specific units
  
  ## Impact
  - Newly imported units will immediately appear in fiscal period dues
  - No manual intervention needed to sync units with fiscal periods
  - "Set Dues" button always works for all units, regardless of when they were created
*/

DROP FUNCTION IF EXISTS set_all_units_monthly_due(uuid, numeric, text);
DROP FUNCTION IF EXISTS set_varied_unit_monthly_dues(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION set_all_units_monthly_due(
    p_fiscal_period_id uuid,
    p_monthly_amount numeric,
    p_currency_code text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Step 1: Ensure all units have placeholder records for this period
    -- This catches any units imported AFTER the period started
    PERFORM generate_fiscal_period_dues(p_fiscal_period_id);

    -- Step 2: Now update the amounts
    UPDATE dues
    SET 
        base_amount = p_monthly_amount,
        currency_code = p_currency_code
    WHERE fiscal_period_id = p_fiscal_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_varied_unit_monthly_dues(
    p_fiscal_period_id uuid,
    p_unit_amounts jsonb,
    p_currency_code text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    item jsonb;
BEGIN
    -- Step 1: Ensure all units have placeholder records
    PERFORM generate_fiscal_period_dues(p_fiscal_period_id);

    -- Step 2: Loop and update specific units
    FOR item IN SELECT * FROM jsonb_array_elements(p_unit_amounts)
    LOOP
        UPDATE dues
        SET 
            base_amount = (item->>'monthly_amount')::numeric,
            currency_code = p_currency_code
        WHERE fiscal_period_id = p_fiscal_period_id
        AND unit_id = (item->>'unit_id')::uuid;
    END LOOP;
END;
$$;
