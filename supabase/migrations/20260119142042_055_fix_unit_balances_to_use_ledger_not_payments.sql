/*
  # Fix Unit Balances View to Use Ledger Entries

  1. Changes
    - Recreate `unit_balances_from_ledger` view to calculate payments from ledger_entries
    - Remove the incorrect trigger that deletes payment records
    - Keep payment records intact, calculate balances from ledger only

  2. Why
    - Payment records are source of truth and should not be deleted
    - Ledger entries represent the actual transactions
    - Balance calculations should reflect what's in the ledger
*/

-- First, revert the incorrect trigger function
CREATE OR REPLACE FUNCTION reverse_dues_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
  v_due_application jsonb;
  v_due_id uuid;
  v_amount numeric;
  v_due RECORD;
  v_new_paid_amount numeric;
  v_new_status text;
BEGIN
  -- Handle expense entries - decrement budget category actual_amount
  IF OLD.entry_type = 'expense' THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount - OLD.amount
    WHERE fiscal_period_id = OLD.fiscal_period_id
      AND category_name = OLD.category
      AND actual_amount >= OLD.amount;
  END IF;

  -- Process income entries related to unit payments
  -- Handle Monthly Dues, Maintenance Fees, and Extra Fees
  IF OLD.entry_type = 'income' 
     AND OLD.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees') 
     AND OLD.payment_id IS NOT NULL THEN

    -- Get the payment details
    SELECT * INTO v_payment
    FROM payments
    WHERE id = OLD.payment_id;

    IF FOUND AND v_payment.applied_to_dues IS NOT NULL THEN
      -- Loop through all dues this payment was applied to
      FOR v_due_application IN SELECT * FROM jsonb_array_elements(v_payment.applied_to_dues)
      LOOP
        v_due_id := (v_due_application->>'due_id')::uuid;
        v_amount := (v_due_application->>'amount')::numeric;

        -- Get current due information
        SELECT * INTO v_due FROM dues WHERE id = v_due_id;

        IF FOUND THEN
          -- Calculate new paid amount (subtract the payment amount)
          v_new_paid_amount := GREATEST(0, v_due.paid_amount - v_amount);

          -- Determine new status based on paid amount
          IF v_new_paid_amount = 0 THEN
            v_new_status := 'pending';
          ELSIF v_new_paid_amount < v_due.total_amount THEN
            v_new_status := 'partial';
          ELSE
            v_new_status := 'paid';
          END IF;

          -- Update the due
          UPDATE dues
          SET 
            paid_amount = v_new_paid_amount,
            status = v_new_status
          WHERE id = v_due_id;
        END IF;
      END LOOP;
    END IF;
    
    -- DO NOT delete the payment record - keep it as source of truth
  END IF;

  RETURN OLD;
END;
$$;

-- Recreate the view to calculate from ledger_entries instead of payments table
CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  d.currency_code,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  -- Calculate total paid from ledger entries, not from payments table
  COALESCE((
    SELECT SUM(
      CASE 
        -- Same currency, use amount directly
        WHEN le.currency_code = COALESCE(d.currency_code, 'TRY') THEN le.amount
        -- Convert TRY to foreign currency
        WHEN le.currency_code = 'TRY' AND COALESCE(d.currency_code, 'TRY') != 'TRY' 
          THEN le.amount / NULLIF(le.exchange_rate, 0)
        -- Convert foreign currency to TRY
        WHEN le.currency_code != 'TRY' AND COALESCE(d.currency_code, 'TRY') = 'TRY' 
          THEN le.amount * le.exchange_rate
        -- For cross-currency, convert both to TRY first
        ELSE le.amount_reporting_try
      END
    )
    FROM ledger_entries le
    WHERE le.payment_id IN (
      SELECT p.id FROM payments p WHERE p.unit_id = u.id
    )
    AND le.entry_type = 'income'
    AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')
  ), 0) AS total_paid,
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE((
    SELECT SUM(
      CASE 
        WHEN le.currency_code = COALESCE(d.currency_code, 'TRY') THEN le.amount
        WHEN le.currency_code = 'TRY' AND COALESCE(d.currency_code, 'TRY') != 'TRY' 
          THEN le.amount / NULLIF(le.exchange_rate, 0)
        WHEN le.currency_code != 'TRY' AND COALESCE(d.currency_code, 'TRY') = 'TRY' 
          THEN le.amount * le.exchange_rate
        ELSE le.amount_reporting_try
      END
    )
    FROM ledger_entries le
    WHERE le.payment_id IN (
      SELECT p.id FROM payments p WHERE p.unit_id = u.id
    )
    AND le.entry_type = 'income'
    AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')
  ), 0) AS current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, d.currency_code;
