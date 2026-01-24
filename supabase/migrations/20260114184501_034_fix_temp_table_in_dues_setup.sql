/*
  # Fix Temporary Table in Monthly Dues Setup

  ## Problem
  Migration 033 had a bug where the temporary table was set to ON COMMIT DROP,
  which caused it to be dropped before we could re-apply the payments.

  ## Solution
  Use arrays to store payment data instead of temp tables.

  ## Changes
  - Fixed set_unit_monthly_due() function to use arrays for storing payment data
*/

-- Fix set_unit_monthly_due to use arrays instead of temp tables
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
  v_payment_amounts numeric[];
  v_payment_dates date[];
  v_payment_methods text[];
  v_payment_refs text[];
  v_payment_accounts uuid[];
  v_payment_categories text[];
  v_idx integer := 1;
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
  
  -- Store all existing payments for this unit in arrays
  SELECT 
    array_agg(amount ORDER BY payment_date, created_at),
    array_agg(payment_date ORDER BY payment_date, created_at),
    array_agg(payment_method ORDER BY payment_date, created_at),
    array_agg(reference_no ORDER BY payment_date, created_at),
    array_agg(account_id ORDER BY payment_date, created_at),
    array_agg(COALESCE(category, 'Maintenance Fees') ORDER BY payment_date, created_at)
  INTO 
    v_payment_amounts,
    v_payment_dates,
    v_payment_methods,
    v_payment_refs,
    v_payment_accounts,
    v_payment_categories
  FROM payments
  WHERE unit_id = p_unit_id;
  
  -- Delete existing payments and dues for this unit and period
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
  IF v_payment_amounts IS NOT NULL THEN
    FOR v_idx IN 1..array_length(v_payment_amounts, 1)
    LOOP
      PERFORM apply_unit_payment(
        p_unit_id,
        v_payment_amounts[v_idx],
        v_payment_dates[v_idx],
        COALESCE(v_payment_methods[v_idx], 'bank_transfer'),
        v_payment_refs[v_idx],
        v_payment_accounts[v_idx],
        COALESCE(v_payment_categories[v_idx], 'Maintenance Fees')
      );
    END LOOP;
  END IF;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;