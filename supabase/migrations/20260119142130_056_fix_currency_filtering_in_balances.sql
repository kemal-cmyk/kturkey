/*
  # Fix Currency Filtering in Unit Balances View

  1. Changes
    - Only include ledger entries that match the currency being calculated
    - Don't try to convert between different currencies in balance view
    - Each currency row should only show payments made in that currency

  2. Why
    - A TRY payment should not affect EUR balance
    - A EUR payment should not affect TRY balance
    - Keep currency calculations simple and accurate
*/

CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  d.currency_code,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  -- Calculate total paid from ledger entries that match this currency
  COALESCE((
    SELECT SUM(le.amount)
    FROM ledger_entries le
    WHERE le.payment_id IN (
      SELECT p.id FROM payments p WHERE p.unit_id = u.id
    )
    AND le.entry_type = 'income'
    AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')
    AND le.currency_code = COALESCE(d.currency_code, 'TRY')
  ), 0) AS total_paid,
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE((
    SELECT SUM(le.amount)
    FROM ledger_entries le
    WHERE le.payment_id IN (
      SELECT p.id FROM payments p WHERE p.unit_id = u.id
    )
    AND le.entry_type = 'income'
    AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')
    AND le.currency_code = COALESCE(d.currency_code, 'TRY')
  ), 0) AS current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, d.currency_code;
