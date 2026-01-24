/*
  # Fix Ledger Account ID from Payment

  ## Problem
  When creating maintenance fee income entries, the `account_id` was being lost
  because the trigger that automatically creates ledger entries from payments
  was not copying the `account_id` field.

  ## Solution
  Update the `create_ledger_for_payment()` trigger function to include the
  `account_id` when creating the ledger entry from a payment.

  ## Changes
  - Modified `create_ledger_for_payment()` trigger to copy `account_id` from payment to ledger
*/

-- Update the trigger function to include account_id
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

  -- Use the category from the payment, default to 'Maintenance Fees' if not specified
  v_category := COALESCE(NEW.category, 'Maintenance Fees');

  -- Create corresponding ledger entry with account_id
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
    v_category,
    'Unit ' || v_unit_info || ' - ' || v_category ||
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by,
    NEW.id,
    NEW.account_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;