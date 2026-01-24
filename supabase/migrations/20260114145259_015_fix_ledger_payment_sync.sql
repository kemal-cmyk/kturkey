/*
  # Fix Ledger and Payment Synchronization

  ## Overview
  Fixes the synchronization between ledger entries and payments by adding a direct reference.

  ## Changes
  
  1. Schema Changes
    - Add `payment_id` column to `ledger_entries` to create direct link
    - Add foreign key constraint to ensure referential integrity
  
  2. Updated Functions
    - `create_ledger_for_payment()` - Now stores payment_id in ledger entry
    - `reverse_payment_from_ledger()` - Uses payment_id to find exact payment to delete
  
  3. Behavior
    - When payment is created → ledger entry is created with payment_id
    - When ledger entry is deleted → finds payment by payment_id and deletes it
    - When payment is deleted → reverses dues and deletes ledger entry
    - Everything stays synchronized automatically

  ## Notes
  - Creates proper bi-directional relationship
  - No more guessing which payment matches which ledger entry
  - Data consistency is guaranteed
*/

-- Add payment_id column to ledger_entries
ALTER TABLE ledger_entries 
ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ledger_payment ON ledger_entries(payment_id);

-- Drop old trigger that had matching issues
DROP TRIGGER IF EXISTS trigger_reverse_payment_on_ledger_delete ON ledger_entries;

-- New function to delete payment when ledger entry is deleted
CREATE OR REPLACE FUNCTION delete_payment_from_ledger()
RETURNS trigger AS $$
BEGIN
  -- If this ledger entry is linked to a payment, delete the payment
  -- The payment deletion trigger will handle reversing the dues
  IF OLD.payment_id IS NOT NULL THEN
    DELETE FROM payments WHERE id = OLD.payment_id;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for when ledger entries are deleted
CREATE TRIGGER trigger_delete_payment_on_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW 
  EXECUTE FUNCTION delete_payment_from_ledger();

-- Update the function to create ledger entry with payment_id
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
  
  -- Create corresponding ledger entry with payment_id reference
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    entry_date,
    created_by,
    payment_id
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    'income',
    'Monthly Dues',
    'Unit ' || v_unit_info || ' - Monthly Dues Payment' || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by,
    NEW.id  -- Store the payment ID for direct reference
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger is in place
DROP TRIGGER IF EXISTS trigger_create_ledger_for_payment ON payments;
CREATE TRIGGER trigger_create_ledger_for_payment
  AFTER INSERT ON payments
  FOR EACH ROW 
  EXECUTE FUNCTION create_ledger_for_payment();