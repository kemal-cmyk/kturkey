/*
  # Add Payment ID to Ledger Entries

  ## Overview
  This migration adds the missing `payment_id` column to the ledger_entries table.
  This column is required by the triggers that synchronize ledger entries with payments.

  ## Changes
  
  1. New Column: `payment_id`
    - Links ledger entries to their corresponding payment records
    - Used by triggers to maintain referential integrity
    - Makes it easier to trace income entries back to their payment source

  ## Notes
  - This column was referenced in migration 016 but was never created
  - The missing column was preventing ledger entry deletions from working correctly
  - Existing ledger entries will have NULL payment_id (manual entries)
*/

-- Add payment_id column to ledger_entries if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE ledger_entries ADD COLUMN payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_ledger_payment ON ledger_entries(payment_id);
  END IF;
END $$;

-- Update the function to create ledger entry when payment is made
-- This ensures the payment_id is set when creating ledger entries from payments
CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
  v_account_id uuid;
BEGIN
  -- Get unit's site_id, unit identifier, and default account
  SELECT 
    u.site_id,
    fp.id as fiscal_period_id,
    CASE 
      WHEN u.block IS NOT NULL THEN u.block || '-' || u.unit_number
      ELSE u.unit_number
    END as unit_identifier,
    (SELECT id FROM accounts WHERE site_id = u.site_id AND is_active = true LIMIT 1) as default_account_id
  INTO v_site_id, v_fiscal_period_id, v_unit_info, v_account_id
  FROM units u
  LEFT JOIN fiscal_periods fp ON fp.site_id = u.site_id AND fp.status = 'active'
  WHERE u.id = NEW.unit_id;
  
  -- Create corresponding ledger entry with payment_id
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    entry_date,
    created_by,
    payment_id,
    account_id
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    'income',
    'Maintenance Fees',
    'Unit ' || v_unit_info || ' - Payment' || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by,
    NEW.id,
    v_account_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_create_ledger_for_payment ON payments;
CREATE TRIGGER trigger_create_ledger_for_payment
  AFTER INSERT ON payments
  FOR EACH ROW 
  EXECUTE FUNCTION create_ledger_for_payment();