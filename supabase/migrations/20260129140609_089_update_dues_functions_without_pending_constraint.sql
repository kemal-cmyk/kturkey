/*
  # Update Dues Functions - Remove Pending Status Constraint
  
  ## Problem
  The functions were only updating dues with status='pending', preventing retroactive
  updates to already-paid dues months.
  
  ## Solution
  Remove the status filter so the functions update ALL dues for the fiscal period,
  allowing immediate reflection of new prices across all months in the financial year.
  
  ## Changes
  - set_all_units_monthly_due: Updates base_amount for all units in period
  - set_varied_unit_monthly_dues: Updates base_amount for specified units regardless of payment status
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
