/*
  # Fix Ledger to Record Amount in Account Currency

  1. Problem
    - When payment is in TRY but account is in EUR, ledger records TRY amount
    - This makes account balances wrong (shows 44,200 EUR instead of 884 EUR)
    
  2. Solution
    - Get the account's currency
    - If payment currency differs from account currency, convert using exchange rate
    - Record the amount in account's currency
    - Keep original payment info for reference
    
  3. Logic
    - Payment: 44,200 TRY @ 0.02 (1 TRY = 0.02 EUR)
    - Account: EUR
    - Ledger records: 884 EUR (44,200 × 0.02)
*/

CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
  v_account_currency text;
  v_amount_in_account_currency numeric;
  v_ledger_currency text;
  v_amount_reporting_try numeric;
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
  
  -- Get account currency if account_id is provided
  IF NEW.account_id IS NOT NULL THEN
    SELECT currency_code INTO v_account_currency
    FROM accounts
    WHERE id = NEW.account_id;
  END IF;
  
  -- Determine ledger currency and amount
  IF v_account_currency IS NOT NULL THEN
    -- Use account's currency
    v_ledger_currency := v_account_currency;
    
    -- Convert payment amount to account currency
    IF NEW.currency_code = v_account_currency THEN
      -- Same currency, no conversion needed
      v_amount_in_account_currency := NEW.amount;
    ELSE
      -- Different currency, convert using exchange rate
      -- exchange_rate represents: 1 unit of payment_currency = exchange_rate units of account_currency
      v_amount_in_account_currency := NEW.amount * COALESCE(NEW.exchange_rate, 1.0);
    END IF;
  ELSE
    -- No account specified, use payment currency
    v_ledger_currency := NEW.currency_code;
    v_amount_in_account_currency := NEW.amount;
  END IF;
  
  -- Calculate reporting amount in TRY
  IF NEW.currency_code = 'TRY' THEN
    v_amount_reporting_try := NEW.amount;
  ELSIF v_ledger_currency = 'TRY' THEN
    v_amount_reporting_try := v_amount_in_account_currency;
  ELSE
    -- Use the pre-calculated amount from payment
    v_amount_reporting_try := NEW.amount_reporting_try;
  END IF;
  
  -- Create corresponding ledger entry with payment_id reference
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    account_id,
    entry_type,
    category,
    description,
    amount,
    currency_code,
    exchange_rate,
    amount_reporting_try,
    entry_date,
    created_by,
    payment_id
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    NEW.account_id,
    'income',
    COALESCE(NEW.category, 'Monthly Dues'),
    'Unit ' || v_unit_info || ' - ' || COALESCE(NEW.category, 'Monthly Dues') ||
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    v_amount_in_account_currency,
    v_ledger_currency,
    NEW.exchange_rate,
    v_amount_reporting_try,
    NEW.payment_date,
    NEW.created_by,
    NEW.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
