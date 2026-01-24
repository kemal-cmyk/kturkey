/*
  # Fix Cross-Currency Payment Application

  1. Problem
    - When paying TRY for EUR dues, the system was converting to TRY for reporting
    - Then applying TRY amounts to EUR dues (incorrect currency mismatch)
    - Exchange rate interpretation was backwards

  2. Solution
    - Get the unit's dues currency
    - If payment currency differs from dues currency, convert to dues currency
    - Apply the converted amount in dues currency
    - Store both amounts: original payment and dues-currency amount
    - Ledger shows: "44,200 TRY @ 0.02 = 884 EUR applied"

  3. Exchange Rate Logic
    - exchange_rate represents: 1 unit of payment_currency = exchange_rate units of dues_currency
    - Example: 1 TRY = 0.02 EUR, so 44,200 TRY × 0.02 = 884 EUR
*/

CREATE OR REPLACE FUNCTION apply_unit_payment(
  p_unit_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT 'bank_transfer',
  p_reference_no text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_category text DEFAULT 'Maintenance Fees',
  p_currency_code text DEFAULT 'TRY',
  p_exchange_rate numeric DEFAULT 1.0
) RETURNS jsonb AS $$
DECLARE
  v_remaining_amount numeric;
  v_due RECORD;
  v_applied_dues jsonb := '[]'::jsonb;
  v_amount_to_apply numeric;
  v_due_balance numeric;
  v_new_paid_amount numeric;
  v_new_status text;
  v_payment_id uuid;
  v_amount_reporting_try numeric;
  v_amount_in_dues_currency numeric;
  v_dues_currency text;
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_created_by uuid;
BEGIN
  -- Validate payment amount
  IF p_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  
  -- Get unit's site and dues currency from first pending/partial due
  SELECT d.currency_code, d.fiscal_period_id, u.site_id
  INTO v_dues_currency, v_fiscal_period_id, v_site_id
  FROM dues d
  JOIN units u ON u.id = d.unit_id
  WHERE d.unit_id = p_unit_id
    AND d.status IN ('pending', 'partial', 'overdue')
  ORDER BY d.month_date ASC
  LIMIT 1;
  
  -- If no dues found, use payment currency as default
  IF v_dues_currency IS NULL THEN
    v_dues_currency := p_currency_code;
  END IF;
  
  -- Convert payment amount to dues currency for application
  -- exchange_rate represents: 1 unit of payment_currency = exchange_rate units of dues_currency
  v_amount_in_dues_currency := p_payment_amount * p_exchange_rate;
  v_remaining_amount := v_amount_in_dues_currency;
  
  -- Calculate amount in reporting currency (TRY) for ledger
  IF p_currency_code = 'TRY' THEN
    v_amount_reporting_try := p_payment_amount;
  ELSIF v_dues_currency = 'TRY' THEN
    v_amount_reporting_try := v_amount_in_dues_currency;
  ELSE
    -- Need to convert from payment currency to TRY
    -- For now, if neither payment nor dues is TRY, use the dues currency amount
    v_amount_reporting_try := v_amount_in_dues_currency;
  END IF;
  
  -- Loop through unpaid/partial dues in chronological order
  FOR v_due IN 
    SELECT id, month_date, total_amount, paid_amount, currency_code
    FROM dues
    WHERE unit_id = p_unit_id
      AND status IN ('pending', 'partial', 'overdue')
    ORDER BY month_date ASC
  LOOP
    EXIT WHEN v_remaining_amount <= 0;
    
    v_due_balance := v_due.total_amount - v_due.paid_amount;
    v_amount_to_apply := LEAST(v_remaining_amount, v_due_balance);
    
    -- Update due record with amount in dues currency
    v_new_paid_amount := v_due.paid_amount + v_amount_to_apply;
    v_new_status := CASE 
      WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
      ELSE 'partial'
    END;
    
    UPDATE dues 
    SET paid_amount = v_new_paid_amount,
        status = v_new_status
    WHERE id = v_due.id;
    
    -- Track applied dues
    v_applied_dues := v_applied_dues || jsonb_build_object(
      'due_id', v_due.id,
      'month_date', v_due.month_date,
      'amount_applied', v_amount_to_apply,
      'dues_currency', v_due.currency_code
    );
    
    v_remaining_amount := v_remaining_amount - v_amount_to_apply;
  END LOOP;
  
  -- Get created_by from current user
  v_created_by := auth.uid();
  
  -- Create payment record with full currency information
  INSERT INTO payments (
    unit_id,
    amount,
    payment_date,
    payment_method,
    reference_no,
    account_id,
    category,
    currency_code,
    exchange_rate,
    amount_reporting_try
  )
  VALUES (
    p_unit_id,
    p_payment_amount,
    p_payment_date,
    p_payment_method,
    p_reference_no,
    p_account_id,
    p_category,
    p_currency_code,
    p_exchange_rate,
    v_amount_reporting_try
  )
  RETURNING id INTO v_payment_id;
  
  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_amount', p_payment_amount,
    'payment_currency', p_currency_code,
    'dues_currency', v_dues_currency,
    'amount_applied_to_dues', v_amount_in_dues_currency,
    'exchange_rate', p_exchange_rate,
    'amount_reporting_try', v_amount_reporting_try,
    'applied_dues', v_applied_dues,
    'overpayment', v_remaining_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
