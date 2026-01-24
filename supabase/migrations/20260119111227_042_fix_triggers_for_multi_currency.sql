/*
  # Fix Triggers for Multi-Currency Support
  
  ## Problem
  The `create_ledger_for_payment()` trigger and `create_account_transfer()` function
  were not updated to populate the new multi-currency fields:
  - currency_code
  - exchange_rate
  - amount_reporting_try
  
  This causes errors when creating maintenance fee income entries or transfers.
  
  ## Solution
  Update both functions to properly handle currency fields:
  - Get currency from payment/site default
  - Set exchange_rate (default 1.0 for same currency)
  - Calculate amount_reporting_try
  
  ## Changes
  1. Updated `create_ledger_for_payment()` to include currency fields
  2. Updated `create_account_transfer()` to include currency fields
*/

-- Update the payment ledger trigger to include currency fields
CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
  v_category text;
  v_currency text;
  v_exchange_rate numeric;
BEGIN
  -- Get unit's site_id, unit identifier, and site's default currency
  SELECT
    u.site_id,
    fp.id as fiscal_period_id,
    CASE
      WHEN u.block IS NOT NULL THEN u.block || '-' || u.unit_number
      ELSE u.unit_number
    END as unit_identifier,
    s.default_currency
  INTO v_site_id, v_fiscal_period_id, v_unit_info, v_currency
  FROM units u
  LEFT JOIN fiscal_periods fp ON fp.site_id = u.site_id AND fp.status = 'active'
  LEFT JOIN sites s ON s.id = u.site_id
  WHERE u.id = NEW.unit_id;

  -- Use the category from the payment, default to 'Maintenance Fees' if not specified
  v_category := COALESCE(NEW.category, 'Maintenance Fees');
  
  -- Default currency to TRY if not set
  v_currency := COALESCE(v_currency, 'TRY');
  
  -- For now, default exchange rate to 1.0 (can be enhanced later to get actual rates)
  v_exchange_rate := 1.0;

  -- Create corresponding ledger entry with currency fields
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    currency_code,
    exchange_rate,
    amount_reporting_try,
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
    v_currency,
    v_exchange_rate,
    NEW.amount * v_exchange_rate,
    NEW.payment_date,
    NEW.created_by,
    NEW.id,
    NEW.account_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the account transfer function to include currency fields
CREATE OR REPLACE FUNCTION create_account_transfer(
  p_site_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_description text,
  p_entry_date date,
  p_created_by uuid
)
RETURNS uuid AS $$
DECLARE
  v_transfer_id uuid;
  v_currency text;
BEGIN
  -- Validate inputs
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  -- Get site's default currency
  SELECT default_currency INTO v_currency
  FROM sites
  WHERE id = p_site_id;
  
  v_currency := COALESCE(v_currency, 'TRY');

  -- Create transfer ledger entry with currency fields
  INSERT INTO ledger_entries (
    site_id,
    entry_type,
    category,
    description,
    amount,
    currency_code,
    exchange_rate,
    amount_reporting_try,
    entry_date,
    from_account_id,
    to_account_id,
    created_by
  ) VALUES (
    p_site_id,
    'transfer',
    'Account Transfer',
    p_description,
    p_amount,
    v_currency,
    1.0,
    p_amount,
    p_entry_date,
    p_from_account_id,
    p_to_account_id,
    p_created_by
  )
  RETURNING id INTO v_transfer_id;

  -- Update account balances
  UPDATE accounts SET balance = balance - p_amount WHERE id = p_from_account_id;
  UPDATE accounts SET balance = balance + p_amount WHERE id = p_to_account_id;

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;