/*
  # Fix Payment Category Issue

  ## Problem
  The trigger `create_ledger_for_payment()` was hardcoding all payments as 'Monthly Dues',
  causing user-entered categories like 'Maintenance Fee Income' to be overwritten.

  ## Changes
  
  1. Add category column to payments table
    - Allows payments to have their own category
    - Defaults to 'Monthly Dues' for backward compatibility
  
  2. Update trigger to use payment category
    - Use the category from the payment record instead of hardcoding
    - Preserves user intent when creating ledger entries
  
  3. Update existing payments
    - Set category to 'Monthly Dues' for existing records
  
  ## Security
  - No RLS changes needed (inherits from payments table)
*/

-- Add category column to payments table
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'Monthly Dues';

-- Update existing payments to have 'Monthly Dues' category
UPDATE payments 
SET category = 'Monthly Dues' 
WHERE category IS NULL;

-- Update the trigger function to use the payment's category
CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
  v_category text;
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
  
  -- Use the category from the payment, default to 'Monthly Dues' if not specified
  v_category := COALESCE(NEW.category, 'Monthly Dues');
  
  -- Create corresponding ledger entry
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
    v_category,  -- Use the payment's category instead of hardcoding
    'Unit ' || v_unit_info || ' - ' || v_category || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by,
    NEW.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
