/*
  # Handle cross-currency payments in unit balances view

  1. Changes
    - Update `unit_balances_from_ledger` view to handle cross-currency payments
    - When payment currency doesn't match dues currency, convert using exchange_rate
    - Example: 44,200 TRY payment with rate 52 should count as 850 EUR (44200/52)
  
  2. Logic
    - If payment.currency_code = dues.currency_code: use payment.amount directly
    - If different: convert payment using exchange_rate
    - For TRY to other currency: payment.amount / exchange_rate
    - For other currency to TRY: payment.amount * exchange_rate
*/

-- Drop the existing view
DROP VIEW IF EXISTS unit_balances_from_ledger;

-- Recreate the view with cross-currency payment support
CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  d.currency_code,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  -- Calculate total_paid from payments, converting currency if needed
  COALESCE(
    (SELECT SUM(
      CASE 
        -- Same currency: use payment amount directly
        WHEN p.currency_code = d.currency_code THEN p.amount
        -- Payment in TRY, dues in other currency: divide by exchange rate
        WHEN p.currency_code = 'TRY' AND d.currency_code != 'TRY' THEN p.amount / NULLIF(p.exchange_rate, 0)
        -- Payment in other currency, dues in TRY: multiply by exchange rate
        WHEN p.currency_code != 'TRY' AND d.currency_code = 'TRY' THEN p.amount * p.exchange_rate
        -- Both non-TRY currencies: convert through TRY as intermediary
        -- First convert payment to TRY, then to target currency
        ELSE (p.amount * p.exchange_rate) / NULLIF(d.currency_code::numeric, 0)
      END
     )
     FROM payments p
     WHERE p.unit_id = u.id
    ), 0
  ) AS total_paid,
  -- Current balance = opening + dues - actual payments (converted)
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(
    (SELECT SUM(
      CASE 
        WHEN p.currency_code = d.currency_code THEN p.amount
        WHEN p.currency_code = 'TRY' AND d.currency_code != 'TRY' THEN p.amount / NULLIF(p.exchange_rate, 0)
        WHEN p.currency_code != 'TRY' AND d.currency_code = 'TRY' THEN p.amount * p.exchange_rate
        ELSE (p.amount * p.exchange_rate) / NULLIF(d.currency_code::numeric, 0)
      END
     )
     FROM payments p
     WHERE p.unit_id = u.id
    ), 0
  ) AS current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, d.currency_code;
