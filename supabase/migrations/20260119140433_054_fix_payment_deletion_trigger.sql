/*
  # Fix Payment Deletion When Ledger Entry is Deleted

  1. Changes
    - Update `reverse_dues_from_ledger` function to handle all payment-related categories
    - Add logic to delete the payment record when ledger entry is deleted
    - Handle both 'Monthly Dues', 'Maintenance Fees', and 'Extra Fees' categories

  2. Security
    - Function uses SECURITY DEFINER to ensure proper permissions
*/

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

    IF FOUND THEN
      -- If payment has dues applications, reverse them
      IF v_payment.applied_to_dues IS NOT NULL THEN
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

      -- Delete the payment record
      DELETE FROM payments WHERE id = OLD.payment_id;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;
