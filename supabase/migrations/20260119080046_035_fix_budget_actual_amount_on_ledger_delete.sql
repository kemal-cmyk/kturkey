/*
  # Fix Budget Category Actual Amount on Ledger Delete

  ## Problem
  When ledger entries (especially expense entries) are deleted, the budget_categories.actual_amount
  is not being decremented. This causes the dashboard to show incorrect "Total Spent" amounts.

  ## Solution
  Update the reverse_dues_from_ledger() function to also handle decrementing actual_amount
  for expense entries when they are deleted.

  ## Changes
  - Updated reverse_dues_from_ledger() to decrement budget_categories.actual_amount for expense entries
  - Ensures dashboard totals stay in sync with ledger entries
*/

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
BEGIN
  -- Handle expense entries - decrement budget category actual_amount
  IF OLD.entry_type = 'expense' THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount - OLD.amount
    WHERE fiscal_period_id = OLD.fiscal_period_id
      AND category_name = OLD.category
      AND actual_amount >= OLD.amount;
  END IF;

  -- Only process if this is a Monthly Dues income entry with a payment_id
  IF OLD.entry_type = 'income' AND OLD.category = 'Monthly Dues' AND OLD.payment_id IS NOT NULL THEN
    
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
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
