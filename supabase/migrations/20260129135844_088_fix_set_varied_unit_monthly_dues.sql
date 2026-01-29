/*
  # Fix set_varied_unit_monthly_dues Function
  
  ## Problem
  The function was updating total_amount instead of base_amount, causing incorrect
  calculations. The database should automatically recalculate total_amount based on base_amount.
  
  ## Solution
  Update only base_amount column, allowing the generated column (total_amount) to be
  recalculated automatically.
*/

DROP FUNCTION IF EXISTS set_varied_unit_monthly_dues(uuid, jsonb, text);

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
        AND unit_id = (item->>'unit_id')::uuid
        AND status = 'pending';
    END LOOP;
END;
$$;
