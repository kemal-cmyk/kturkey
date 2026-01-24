/*
  # Fix Monthly Dues Setup to Preserve Payments

  ## Problem
  When setting monthly dues through "Set Monthly Dues", the function deletes
  existing dues records and creates new ones, but doesn't re-apply existing
  payments. This causes:
  - dues.paid_amount to reset to 0
  - Financial Summary to show incorrect balance
  - Payment history to disappear from the unit view

  ## Solution
  Update the set_unit_monthly_due function to:
  1. Store all existing payments for the unit before deleting dues
  2. Delete and recreate dues with new amounts
  3. Re-apply all existing payments to the new dues using apply_unit_payment

  ## Changes
  - Modified set_unit_monthly_due() to preserve and re-apply payments
  - Modified set_all_units_monthly_due() wrapper
  - Modified set_varied_unit_monthly_dues() wrapper
*/

-- Update set_unit_monthly_due to preserve and re-apply payments
CREATE OR REPLACE FUNCTION set_unit_monthly_due(
  p_unit_id uuid,
  p_fiscal_period_id uuid,
  p_monthly_amount numeric
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_start_date date;
  v_end_date date;
  v_month_date date;
  v_dues_count integer := 0;
  v_payment RECORD;
BEGIN
  -- Validate inputs
  IF p_monthly_amount < 0 THEN
    RAISE EXCEPTION 'Monthly amount cannot be negative';
  END IF;
  
  -- Get fiscal period dates
  SELECT site_id, start_date, end_date
  INTO v_site_id, v_start_date, v_end_date
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Verify unit belongs to same site
  IF NOT EXISTS (
    SELECT 1 FROM units 
    WHERE id = p_unit_id AND site_id = v_site_id
  ) THEN
    RAISE EXCEPTION 'Unit does not belong to this fiscal period site';
  END IF;
  
  -- Store all existing payments for this unit
  -- We'll re-apply them after recreating dues
  CREATE TEMP TABLE IF NOT EXISTS temp_unit_payments (
    payment_id uuid,
    amount numeric,
    payment_date date,
    payment_method text,
    reference_no text,
    account_id uuid,
    category text
  ) ON COMMIT DROP;
  
  DELETE FROM temp_unit_payments;
  
  INSERT INTO temp_unit_payments (payment_id, amount, payment_date, payment_method, reference_no, account_id, category)
  SELECT id, amount, payment_date, payment_method, reference_no, account_id, category
  FROM payments
  WHERE unit_id = p_unit_id
  ORDER BY payment_date, created_at;
  
  -- Delete existing payments and dues for this unit and period
  -- This will cascade and delete related ledger entries via trigger
  DELETE FROM payments WHERE unit_id = p_unit_id;
  
  DELETE FROM dues 
  WHERE unit_id = p_unit_id 
    AND fiscal_period_id = p_fiscal_period_id;
  
  -- Generate 12 months of dues with the specified amount
  v_month_date := v_start_date;
  WHILE v_month_date < v_end_date LOOP
    INSERT INTO dues (unit_id, fiscal_period_id, month_date, base_amount, due_date)
    VALUES (
      p_unit_id,
      p_fiscal_period_id,
      v_month_date,
      p_monthly_amount,
      v_month_date + interval '15 days'
    );
    
    v_dues_count := v_dues_count + 1;
    v_month_date := v_month_date + interval '1 month';
  END LOOP;
  
  -- Re-apply all existing payments
  FOR v_payment IN SELECT * FROM temp_unit_payments ORDER BY payment_date
  LOOP
    PERFORM apply_unit_payment(
      p_unit_id,
      v_payment.amount,
      v_payment.payment_date,
      v_payment.payment_method,
      v_payment.reference_no,
      v_payment.account_id,
      v_payment.category
    );
  END LOOP;
  
  -- Clean up temp table
  DROP TABLE IF EXISTS temp_unit_payments;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update set_all_units_monthly_due (no changes needed, just recreating)
CREATE OR REPLACE FUNCTION set_all_units_monthly_due(
  p_fiscal_period_id uuid,
  p_monthly_amount numeric
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit RECORD;
  v_total_dues integer := 0;
  v_unit_dues integer;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through all units in the site
  FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id
  LOOP
    -- Set monthly due for this unit (will preserve and re-apply payments)
    v_unit_dues := set_unit_monthly_due(v_unit.id, p_fiscal_period_id, p_monthly_amount);
    v_total_dues := v_total_dues + v_unit_dues;
  END LOOP;
  
  RETURN v_total_dues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update set_varied_unit_monthly_dues (no changes needed, just recreating)
CREATE OR REPLACE FUNCTION set_varied_unit_monthly_dues(
  p_fiscal_period_id uuid,
  p_unit_amounts jsonb
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit_data jsonb;
  v_unit_id uuid;
  v_monthly_amount numeric;
  v_total_dues integer := 0;
  v_unit_dues integer;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through the unit amounts array
  FOR v_unit_data IN SELECT * FROM jsonb_array_elements(p_unit_amounts)
  LOOP
    v_unit_id := (v_unit_data->>'unit_id')::uuid;
    v_monthly_amount := (v_unit_data->>'monthly_amount')::numeric;
    
    -- Set monthly due for this unit (will preserve and re-apply payments)
    v_unit_dues := set_unit_monthly_due(v_unit_id, p_fiscal_period_id, v_monthly_amount);
    v_total_dues := v_total_dues + v_unit_dues;
  END LOOP;
  
  RETURN v_total_dues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;