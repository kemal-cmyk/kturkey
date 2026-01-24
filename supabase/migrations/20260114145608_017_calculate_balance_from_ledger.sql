/*
  # Calculate Unit Balance from Ledger

  ## Overview
  Changes the unit balance calculation to use ledger entries (Monthly Dues income) 
  instead of the dues table.

  ## Changes
  
  1. New View: `unit_balances_from_ledger`
    - Calculates balance as: opening_balance + Monthly Dues income from ledger
    - Links ledger entries to units through payment_id → payments.unit_id
    - Shows current balance for each unit based on actual ledger transactions
  
  2. Columns in View
    - unit_id
    - unit_number
    - block
    - opening_balance
    - total_maintenance_fees (sum of Monthly Dues income from ledger)
    - current_balance (opening_balance + total_maintenance_fees)
    - site_id

  ## Behavior
  - When maintenance fee is paid → ledger entry created → balance increases
  - When ledger entry deleted → balance decreases automatically
  - Balance always reflects actual ledger transactions
*/

-- Create view to calculate unit balances from ledger
CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(
    CASE 
      WHEN le.entry_type = 'income' AND le.category = 'Monthly Dues' 
      THEN le.amount 
      ELSE 0 
    END
  ), 0) as total_maintenance_fees,
  u.opening_balance + COALESCE(SUM(
    CASE 
      WHEN le.entry_type = 'income' AND le.category = 'Monthly Dues' 
      THEN le.amount 
      ELSE 0 
    END
  ), 0) as current_balance,
  u.site_id,
  u.created_at,
  u.updated_at
FROM units u
LEFT JOIN payments p ON p.unit_id = u.id
LEFT JOIN ledger_entries le ON le.payment_id = p.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, u.created_at, u.updated_at;

-- Grant access to authenticated users
GRANT SELECT ON unit_balances_from_ledger TO authenticated;