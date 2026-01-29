/*
  # Fix unit_balances_from_ledger view to calculate paid amounts from ledger entries

  1. Changes
    - Modified view to calculate total_paid from ledger_entries table instead of dues.paid_amount
    - Properly converts cross-currency payments using stored exchange_rate
    - For payments in display currency: use amount directly
    - For payments in other currencies: multiply amount by exchange_rate

  2. Why
    - The dues.paid_amount values were stale/not being updated
    - Ledger entries contain accurate payment records with exchange rates
    - This ensures balance calculations match the Financial Summary display
*/

DROP VIEW IF EXISTS unit_balances_from_ledger;

CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  s.default_currency AS currency_code,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  COALESCE(paid.total_paid, 0) AS total_paid,
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(paid.total_paid, 0) AS current_balance,
  u.site_id
FROM units u
JOIN sites s ON s.id = u.site_id
LEFT JOIN dues d ON d.unit_id = u.id
LEFT JOIN LATERAL (
  SELECT SUM(
    CASE 
      WHEN le.currency_code = s.default_currency THEN le.amount
      ELSE le.amount * COALESCE(le.exchange_rate, 1)
    END
  ) AS total_paid
  FROM ledger_entries le
  JOIN payments p ON p.id = le.payment_id
  WHERE p.unit_id = u.id
    AND le.entry_type = 'income'
) paid ON true
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, s.default_currency, paid.total_paid;
