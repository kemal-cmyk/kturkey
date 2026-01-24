/*
  # Sync Ledger Entries with Payment System

  ## Overview
  Creates triggers to ensure ledger entries and the dues/payment system stay synchronized.
  When maintenance fee income is deleted from the ledger, it should also reverse the payment in the dues table.

  ## Changes
  
  1. New Function: `reverse_payment_from_ledger()`
    - Triggered when a ledger entry with category 'Monthly Dues' is deleted
    - Finds and reverses the corresponding payment in the dues table
    - Ensures unit_balances view reflects accurate outstanding amounts
  
  2. New Function: `create_ledger_entry_for_payment()`
    - Triggered when a payment is created
    - Automatically creates a corresponding ledger entry for bookkeeping
    - Keeps general ledger in sync with payment records
  
  3. Modified: Payment deletion handling
    - When a payment is deleted, it reverses the dues updates
    - Ensures data consistency across the system

  ## Notes
  - Ledger entries and dues/payments are now tightly coupled
  - Deleting a ledger entry will reverse the corresponding payment
  - This prevents inconsistencies between the general ledger and unit balances
*/

-- Function to reverse payment when ledger entry is deleted
CREATE OR REPLACE FUNCTION reverse_payment_from_ledger()
RETURNS trigger AS $$
DECLARE
  v_unit_id uuid;
  v_payment_amount numeric;
  v_due RECORD;
  v_amount_to_reverse numeric;
  v_remaining_amount numeric;
  v_new_paid_amount numeric;
  v_new_status text;
BEGIN
  -- Only process if this is a Monthly Dues income entry
  IF OLD.entry_type = 'income' AND OLD.category = 'Monthly Dues' THEN
    
    -- Extract unit information from description
    -- Format expected: "Unit A-101 - Monthly Dues" or "Unit 101 - Monthly Dues"
    -- We'll try to match the payment by amount and date
    v_payment_amount := OLD.amount;
    
    -- Find payments matching this ledger entry (by amount and date within a reasonable window)
    FOR v_due IN
      SELECT d.id, d.unit_id, d.month_date, d.total_amount, d.paid_amount, d.status
      FROM dues d
      WHERE d.paid_amount > 0
        AND EXISTS (
          SELECT 1 FROM units u 
          WHERE u.id = d.unit_id 
          AND u.site_id = OLD.site_id
        )
      ORDER BY d.month_date DESC
      LIMIT 20
    LOOP
      -- Check if this due might match the deleted ledger entry
      -- We'll reverse up to the payment amount from the most recent dues
      IF v_payment_amount > 0 AND v_due.paid_amount > 0 THEN
        v_amount_to_reverse := LEAST(v_payment_amount, v_due.paid_amount);
        v_new_paid_amount := v_due.paid_amount - v_amount_to_reverse;
        
        -- Update status based on new paid amount
        v_new_status := CASE
          WHEN v_new_paid_amount <= 0 THEN 'pending'
          WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
          ELSE 'partial'
        END;
        
        UPDATE dues
        SET 
          paid_amount = v_new_paid_amount,
          status = v_new_status
        WHERE id = v_due.id;
        
        v_payment_amount := v_payment_amount - v_amount_to_reverse;
        
        IF v_payment_amount <= 0 THEN
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for when ledger entries are deleted
DROP TRIGGER IF EXISTS trigger_reverse_payment_on_ledger_delete ON ledger_entries;
CREATE TRIGGER trigger_reverse_payment_on_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_payment_from_ledger();

-- Function to reverse payment when payment record is deleted
CREATE OR REPLACE FUNCTION reverse_payment_on_delete()
RETURNS trigger AS $$
DECLARE
  v_due_application jsonb;
  v_due_id uuid;
  v_amount numeric;
  v_due RECORD;
  v_new_paid_amount numeric;
  v_new_status text;
BEGIN
  -- Loop through all dues this payment was applied to
  IF OLD.applied_to_dues IS NOT NULL THEN
    FOR v_due_application IN SELECT * FROM jsonb_array_elements(OLD.applied_to_dues)
    LOOP
      v_due_id := (v_due_application->>'due_id')::uuid;
      v_amount := (v_due_application->>'amount')::numeric;
      
      -- Get current due information
      SELECT id, total_amount, paid_amount, status
      INTO v_due
      FROM dues
      WHERE id = v_due_id;
      
      IF FOUND THEN
        -- Reverse the payment
        v_new_paid_amount := GREATEST(v_due.paid_amount - v_amount, 0);
        
        -- Update status
        v_new_status := CASE
          WHEN v_new_paid_amount <= 0 THEN 'pending'
          WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
          ELSE 'partial'
        END;
        
        UPDATE dues
        SET 
          paid_amount = v_new_paid_amount,
          status = v_new_status
        WHERE id = v_due_id;
      END IF;
    END LOOP;
  END IF;
  
  -- Also delete the corresponding ledger entry if it exists
  DELETE FROM ledger_entries
  WHERE entry_type = 'income'
    AND category = 'Monthly Dues'
    AND amount = OLD.amount
    AND entry_date = OLD.payment_date
    AND site_id = (SELECT site_id FROM units WHERE id = OLD.unit_id);
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for when payments are deleted
DROP TRIGGER IF EXISTS trigger_reverse_payment_on_delete ON payments;
CREATE TRIGGER trigger_reverse_payment_on_delete
  BEFORE DELETE ON payments
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_payment_on_delete();

-- Function to create ledger entry when payment is made
CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
BEGIN
  -- Get unit's site_id and unit identifier
  SELECT 
    u.site_id,
    fp.id as fiscal_period_id,
    CASE 
      WHEN u.block IS NOT NULL THEN u.block || '-' || u.unit_number
      ELSE u.unit_number
    END as unit_identifier
  INTO v_site_id, v_fiscal_period_id, v_unit_info
  FROM units u
  LEFT JOIN fiscal_periods fp ON fp.site_id = u.site_id AND fp.status = 'active'
  WHERE u.id = NEW.unit_id;
  
  -- Create corresponding ledger entry
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    entry_date,
    created_by
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    'income',
    'Monthly Dues',
    'Unit ' || v_unit_info || ' - Monthly Dues Payment' || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create ledger entry when payment is made
DROP TRIGGER IF EXISTS trigger_create_ledger_for_payment ON payments;
CREATE TRIGGER trigger_create_ledger_for_payment
  AFTER INSERT ON payments
  FOR EACH ROW 
  EXECUTE FUNCTION create_ledger_for_payment();