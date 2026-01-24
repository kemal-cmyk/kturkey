/*
  # Rebuild Dues Paid Amounts from Ledger Entries
  
  1. Problem
    - Ledger entries were deleted but dues.paid_amount wasn't reversed
    - This happened because payments.applied_to_dues is empty for all payments
    - The trigger reverse_dues_from_ledger relies on applied_to_dues to know which dues to reverse
    - Result: Dues show as paid even though ledger entries are gone
    
  2. Solution
    - Reset all dues.paid_amount to 0
    - Recalculate paid amounts from existing ledger entries
    - For each ledger income entry, apply it to dues chronologically
    - Update trigger to handle cases where applied_to_dues is empty
    
  3. Impact
    - Fixes inconsistency between ledger and dues
    - Ensures dues reflect actual ledger entries
    - Future ledger deletions will work correctly
*/

-- Step 1: Reset all dues paid amounts to start fresh
UPDATE dues
SET paid_amount = 0,
    status = CASE 
      WHEN total_amount > 0 THEN 'pending'
      ELSE status
    END;

-- Step 2: Recalculate paid amounts from existing ledger entries
-- For each unit's income ledger entries, apply them chronologically to dues
DO $$
DECLARE
  v_ledger RECORD;
  v_remaining numeric;
  v_due RECORD;
  v_amount_to_apply numeric;
BEGIN
  -- Loop through all income ledger entries that are payment-related
  FOR v_ledger IN 
    SELECT 
      le.id,
      le.amount,
      le.currency_code,
      le.entry_date,
      le.payment_id,
      p.unit_id,
      p.exchange_rate,
      -- Calculate amount in dues currency
      CASE 
        WHEN le.currency_code = (SELECT currency_code FROM dues WHERE unit_id = p.unit_id LIMIT 1) 
        THEN le.amount
        ELSE le.amount * p.exchange_rate
      END as amount_in_dues_currency
    FROM ledger_entries le
    JOIN payments p ON p.id = le.payment_id
    WHERE le.entry_type = 'income'
      AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')
      AND le.payment_id IS NOT NULL
    ORDER BY p.unit_id, le.entry_date, le.id
  LOOP
    v_remaining := v_ledger.amount_in_dues_currency;
    
    -- Apply this amount to dues chronologically
    FOR v_due IN
      SELECT id, total_amount, paid_amount
      FROM dues
      WHERE unit_id = v_ledger.unit_id
        AND paid_amount < total_amount
      ORDER BY month_date ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      
      v_amount_to_apply := LEAST(v_remaining, v_due.total_amount - v_due.paid_amount);
      
      UPDATE dues
      SET 
        paid_amount = paid_amount + v_amount_to_apply,
        status = CASE
          WHEN paid_amount + v_amount_to_apply >= total_amount THEN 'paid'
          WHEN paid_amount + v_amount_to_apply > 0 THEN 'partial'
          ELSE 'pending'
        END
      WHERE id = v_due.id;
      
      v_remaining := v_remaining - v_amount_to_apply;
    END LOOP;
  END LOOP;
END $$;

-- Step 3: Update the trigger to recalculate from ledger when applied_to_dues is empty
CREATE OR REPLACE FUNCTION reverse_dues_from_ledger()
RETURNS trigger AS $$
DECLARE
  v_payment RECORD;
  v_due_application jsonb;
  v_due_id uuid;
  v_amount numeric;
  v_due RECORD;
  v_new_paid_amount numeric;
  v_new_status text;
  v_amount_in_dues_currency numeric;
  v_remaining numeric;
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
  IF OLD.entry_type = 'income' 
     AND OLD.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees') 
     AND OLD.payment_id IS NOT NULL THEN

    -- Get the payment details
    SELECT * INTO v_payment
    FROM payments
    WHERE id = OLD.payment_id;

    IF FOUND THEN
      -- Check if applied_to_dues has data
      IF v_payment.applied_to_dues IS NOT NULL AND jsonb_array_length(v_payment.applied_to_dues) > 0 THEN
        -- Use applied_to_dues to reverse specific dues
        FOR v_due_application IN SELECT * FROM jsonb_array_elements(v_payment.applied_to_dues)
        LOOP
          v_due_id := (v_due_application->>'due_id')::uuid;
          v_amount := (v_due_application->>'amount_applied')::numeric;

          -- Get current due information
          SELECT * INTO v_due FROM dues WHERE id = v_due_id;

          IF FOUND THEN
            v_new_paid_amount := GREATEST(0, v_due.paid_amount - v_amount);

            IF v_new_paid_amount = 0 THEN
              v_new_status := 'pending';
            ELSIF v_new_paid_amount < v_due.total_amount THEN
              v_new_status := 'partial';
            ELSE
              v_new_status := 'paid';
            END IF;

            UPDATE dues
            SET 
              paid_amount = v_new_paid_amount,
              status = v_new_status
            WHERE id = v_due_id;
          END IF;
        END LOOP;
      ELSE
        -- applied_to_dues is empty or null, calculate amount to reverse
        -- Convert ledger amount to dues currency
        SELECT 
          CASE 
            WHEN OLD.currency_code = d.currency_code THEN OLD.amount
            ELSE OLD.amount * v_payment.exchange_rate
          END
        INTO v_amount_in_dues_currency
        FROM dues d
        WHERE d.unit_id = v_payment.unit_id
        LIMIT 1;

        v_remaining := v_amount_in_dues_currency;

        -- Reverse dues chronologically (LIFO - last paid first reversed)
        FOR v_due IN
          SELECT id, total_amount, paid_amount
          FROM dues
          WHERE unit_id = v_payment.unit_id
            AND paid_amount > 0
          ORDER BY month_date DESC
        LOOP
          EXIT WHEN v_remaining <= 0;

          v_amount := LEAST(v_remaining, v_due.paid_amount);
          v_new_paid_amount := v_due.paid_amount - v_amount;

          IF v_new_paid_amount = 0 THEN
            v_new_status := 'pending';
          ELSIF v_new_paid_amount < v_due.total_amount THEN
            v_new_status := 'partial';
          ELSE
            v_new_status := 'paid';
          END IF;

          UPDATE dues
          SET 
            paid_amount = v_new_paid_amount,
            status = v_new_status
          WHERE id = v_due.id;

          v_remaining := v_remaining - v_amount;
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_reverse_dues_on_ledger_delete ON ledger_entries;
CREATE TRIGGER trigger_reverse_dues_on_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_dues_from_ledger();
