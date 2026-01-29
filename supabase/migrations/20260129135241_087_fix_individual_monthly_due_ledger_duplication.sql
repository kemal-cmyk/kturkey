/*
  # Fix Individual Monthly Due Function - Remove Ledger Duplication
  
  ## Problem
  The set_unit_monthly_due function was including applied_to_dues when re-inserting
  payments, which may have triggered ledger entry creation and caused duplicates.
  
  ## Solution
  Match the approach from set_unit_monthly_dues (batch function):
  1. Store existing payment data
  2. Delete old dues and payments
  3. Create new dues records
  4. Re-insert payment records WITHOUT applied_to_dues (avoids ledger triggers)
  5. Manually update dues paid amounts by iterating through dues
  6. NO manual applied_to_dues collection during re-insertion
*/

DROP FUNCTION IF EXISTS set_unit_monthly_due(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION set_unit_monthly_due(
  p_unit_id uuid,
  p_fiscal_period_id uuid,
  p_monthly_amount numeric,
  p_currency_code text DEFAULT 'TRY'
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
  v_payment_currencies text[];
  v_payment_rates numeric[];
  v_payment_reporting_amounts numeric[];
  v_idx integer := 1;
  v_new_payment_id uuid;
  v_remaining_amount numeric;
  v_due RECORD;
  v_due_balance numeric;
  v_amount_to_apply numeric;
  v_new_paid_amount numeric;
  v_new_status text;
BEGIN
  IF p_monthly_amount < 0 THEN
    RAISE EXCEPTION 'Monthly amount cannot be negative';
  END IF;
  
  SELECT site_id, start_date, end_date
  INTO v_site_id, v_start_date, v_end_date
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  IF NOT EXISTS (
    SELECT 1 FROM units 
    WHERE id = p_unit_id AND site_id = v_site_id
  ) THEN
    RAISE EXCEPTION 'Unit does not belong to this fiscal period site';
  END IF;
  
  SELECT 
    array_agg(amount ORDER BY payment_date, created_at),
    array_agg(payment_date ORDER BY payment_date, created_at),
    array_agg(payment_method ORDER BY payment_date, created_at),
    array_agg(reference_no ORDER BY payment_date, created_at),
    array_agg(account_id ORDER BY payment_date, created_at),
    array_agg(COALESCE(category, 'Maintenance Fees') ORDER BY payment_date, created_at),
    array_agg(COALESCE(currency_code, 'TRY') ORDER BY payment_date, created_at),
    array_agg(COALESCE(exchange_rate, 1.0) ORDER BY payment_date, created_at),
    array_agg(COALESCE(amount_reporting_try, amount) ORDER BY payment_date, created_at)
  INTO 
    v_payment_amounts,
    v_payment_dates,
    v_payment_methods,
    v_payment_refs,
    v_payment_accounts,
    v_payment_categories,
    v_payment_currencies,
    v_payment_rates,
    v_payment_reporting_amounts
  FROM payments
  WHERE unit_id = p_unit_id;
  
  DELETE FROM payments WHERE unit_id = p_unit_id;
  
  DELETE FROM dues 
  WHERE unit_id = p_unit_id 
    AND fiscal_period_id = p_fiscal_period_id;
  
  v_month_date := v_start_date;
  WHILE v_month_date < v_end_date LOOP
    INSERT INTO dues (
      unit_id, 
      fiscal_period_id, 
      month_date, 
      base_amount,
      due_date,
      currency_code
    )
    VALUES (
      p_unit_id,
      p_fiscal_period_id,
      v_month_date,
      p_monthly_amount,
      v_month_date + interval '15 days',
      p_currency_code
    );
    
    v_dues_count := v_dues_count + 1;
    v_month_date := v_month_date + interval '1 month';
  END LOOP;
  
  IF v_payment_amounts IS NOT NULL THEN
    FOR v_idx IN 1..array_length(v_payment_amounts, 1)
    LOOP
      INSERT INTO payments (
        unit_id,
        amount,
        payment_date,
        payment_method,
        reference_no,
        account_id,
        category,
        currency_code,
        exchange_rate,
        amount_reporting_try
      )
      VALUES (
        p_unit_id,
        v_payment_amounts[v_idx],
        v_payment_dates[v_idx],
        COALESCE(v_payment_methods[v_idx], 'bank_transfer'),
        v_payment_refs[v_idx],
        v_payment_accounts[v_idx],
        COALESCE(v_payment_categories[v_idx], 'Maintenance Fees'),
        COALESCE(v_payment_currencies[v_idx], 'TRY'),
        COALESCE(v_payment_rates[v_idx], 1.0),
        COALESCE(v_payment_reporting_amounts[v_idx], v_payment_amounts[v_idx])
      )
      RETURNING id INTO v_new_payment_id;
      
      v_remaining_amount := v_payment_amounts[v_idx] * COALESCE(v_payment_rates[v_idx], 1.0);
      
      FOR v_due IN 
        SELECT id, total_amount, paid_amount
        FROM dues
        WHERE unit_id = p_unit_id
          AND status IN ('pending', 'partial', 'overdue')
        ORDER BY month_date ASC
      LOOP
        EXIT WHEN v_remaining_amount <= 0;
        
        v_due_balance := v_due.total_amount - v_due.paid_amount;
        v_amount_to_apply := LEAST(v_remaining_amount, v_due_balance);
        
        v_new_paid_amount := v_due.paid_amount + v_amount_to_apply;
        v_new_status := CASE 
          WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
          ELSE 'partial'
        END;
        
        UPDATE dues 
        SET paid_amount = v_new_paid_amount,
            status = v_new_status
        WHERE id = v_due.id;
        
        v_remaining_amount := v_remaining_amount - v_amount_to_apply;
      END LOOP;
    END LOOP;
  END IF;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
