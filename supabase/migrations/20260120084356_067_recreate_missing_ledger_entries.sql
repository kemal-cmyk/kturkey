/*
  # Recreate Missing Ledger Entries
  
  1. Problem
    - Cleanup script accidentally removed all ledger entries instead of just duplicates
    - Need to recreate them for all existing payments
    
  2. Solution
    - Create ledger entries for all payments that don't have them
    - Use the same logic as the trigger function
    
  3. Impact
    - All payments will have exactly one ledger entry
    - Financial reports will be accurate
*/

-- Recreate missing ledger entries for all payments
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
  p.amount,
  p.currency_code,
  p.exchange_rate,
  p.amount_reporting_try,
  p.payment_date as entry_date,
  p.created_by,
  p.id as payment_id
FROM payments p
JOIN units u ON u.id = p.unit_id
LEFT JOIN fiscal_periods fp ON fp.site_id = u.site_id AND fp.status = 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM ledger_entries le WHERE le.payment_id = p.id
)
ORDER BY p.payment_date;
