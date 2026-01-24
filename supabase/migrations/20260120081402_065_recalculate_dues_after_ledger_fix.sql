/*
  # Recalculate Dues After Creating Missing Ledger Entries
  
  1. Problem
    - Created missing ledger entries for payments
    - But dues table wasn't updated to reflect these payments
    - All units show 0 paid even though ledger entries exist
    
  2. Solution
    - Reset all dues paid amounts
    - Recalculate from existing ledger entries
    - Apply payments chronologically to dues
    
  3. Impact
    - Dues will accurately reflect payments
    - Unit balances will be correct
    - Financial reports will match ledger
*/

-- Step 1: Reset all dues paid amounts
UPDATE dues
SET paid_amount = 0,
    status = CASE 
      WHEN total_amount > 0 THEN 'pending'
      ELSE status
    END;

-- Step 2: Recalculate paid amounts from existing ledger entries
DO $$
DECLARE
  v_ledger RECORD;
  v_remaining numeric;
  v_due RECORD;
  v_amount_to_apply numeric;
  v_dues_currency text;
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
      p.exchange_rate
    FROM ledger_entries le
    JOIN payments p ON p.id = le.payment_id
    WHERE le.entry_type = 'income'
      AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')
      AND le.payment_id IS NOT NULL
    ORDER BY p.unit_id, le.entry_date, le.id
  LOOP
    -- Get dues currency for this unit
    SELECT currency_code INTO v_dues_currency
    FROM dues
    WHERE unit_id = v_ledger.unit_id
    LIMIT 1;
    
    -- Calculate amount in dues currency
    IF v_ledger.currency_code = v_dues_currency THEN
      v_remaining := v_ledger.amount;
    ELSE
      v_remaining := v_ledger.amount * v_ledger.exchange_rate;
    END IF;
    
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
