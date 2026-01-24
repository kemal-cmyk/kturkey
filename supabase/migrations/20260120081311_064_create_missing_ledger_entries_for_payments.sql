/*
  # Create Missing Ledger Entries for Payments
  
  1. Problem
    - Many payments exist without corresponding ledger entries
    - This causes inconsistencies in financial reports
    - Ledger doesn't show all income transactions
    
  2. Solution
    - Create ledger entries for all payments that don't have them
    - Use the same logic as the create_ledger_for_payment trigger
    - Ensure proper currency conversion and account tracking
    
  3. Impact
    - All payments will have ledger entries
    - Financial reports will be accurate
    - Ledger will show complete transaction history
*/

-- Create missing ledger entries for all payments without them
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
)
SELECT 
  u.site_id,
  fp.id as fiscal_period_id,
  p.account_id,
  'income' as entry_type,
  COALESCE(p.category, 'Maintenance Fees') as category,
  'Unit ' || 
    CASE 
      WHEN u.block IS NOT NULL THEN u.block || '-' || u.unit_number
      ELSE u.unit_number
    END || ' - ' || COALESCE(p.category, 'Maintenance Fees') ||
    CASE WHEN p.reference_no IS NOT NULL THEN ' (Ref: ' || p.reference_no || ')' ELSE '' END as description,
  -- Calculate amount in account currency or use payment currency
  CASE 
    WHEN p.account_id IS NOT NULL AND a.currency_code IS NOT NULL THEN
      CASE 
        WHEN p.currency_code = a.currency_code THEN p.amount
        ELSE p.amount * COALESCE(p.exchange_rate, 1.0)
      END
    ELSE p.amount
  END as amount,
  -- Use account currency if available, otherwise payment currency
  COALESCE(a.currency_code, p.currency_code) as currency_code,
  p.exchange_rate,
  -- Calculate reporting amount in TRY
  CASE 
    WHEN p.currency_code = 'TRY' THEN p.amount
    WHEN COALESCE(a.currency_code, p.currency_code) = 'TRY' THEN
      CASE 
        WHEN p.currency_code = a.currency_code THEN p.amount
        ELSE p.amount * COALESCE(p.exchange_rate, 1.0)
      END
    ELSE COALESCE(p.amount_reporting_try, p.amount)
  END as amount_reporting_try,
  p.payment_date as entry_date,
  p.created_by,
  p.id as payment_id
FROM payments p
JOIN units u ON u.id = p.unit_id
LEFT JOIN accounts a ON a.id = p.account_id
LEFT JOIN fiscal_periods fp ON fp.site_id = u.site_id AND fp.status = 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM ledger_entries le WHERE le.payment_id = p.id
)
ORDER BY p.payment_date;
