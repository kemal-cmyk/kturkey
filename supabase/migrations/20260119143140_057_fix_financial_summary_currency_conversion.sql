/*
  # Fix Financial Summary to Use Proper Currency Conversion

  1. Changes
    - Update site_financial_summary view to calculate total_collected from ledger_entries
    - Use amount_reporting_try which properly converts all currencies to TRY
    - This ensures dashboard shows accurate totals regardless of payment currency

  2. Why
    - Previous version summed paid_amount from dues table which mixed currencies
    - Ledger entries already have proper currency conversion in amount_reporting_try
    - Provides accurate financial reporting
*/

CREATE OR REPLACE VIEW site_financial_summary AS
SELECT 
  s.id as site_id,
  s.name as site_name,
  fp.id as fiscal_period_id,
  fp.name as fiscal_period_name,
  fp.status as period_status,
  fp.total_budget,
  COALESCE(SUM(bc.planned_amount), 0) as planned_expenses,
  COALESCE(SUM(bc.actual_amount), 0) as actual_expenses,
  COALESCE((SELECT SUM(d.total_amount) FROM dues d 
    JOIN units u ON u.id = d.unit_id 
    WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 0) as total_dues_generated,
  -- Calculate total_collected from ledger_entries with proper currency conversion
  COALESCE((SELECT SUM(le.amount_reporting_try) 
    FROM ledger_entries le
    WHERE le.site_id = s.id 
      AND le.fiscal_period_id = fp.id
      AND le.entry_type = 'income'
      AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')), 0) as total_collected,
  CASE 
    WHEN COALESCE((SELECT SUM(d.total_amount) FROM dues d 
      JOIN units u ON u.id = d.unit_id 
      WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 0) > 0
    THEN ROUND(
      COALESCE((SELECT SUM(le.amount_reporting_try) 
        FROM ledger_entries le
        WHERE le.site_id = s.id 
          AND le.fiscal_period_id = fp.id
          AND le.entry_type = 'income'
          AND le.category IN ('Monthly Dues', 'Maintenance Fees', 'Extra Fees')), 0) * 100.0 /
      COALESCE((SELECT SUM(d.total_amount) FROM dues d 
        JOIN units u ON u.id = d.unit_id 
        WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 1), 2)
    ELSE 0
  END as collection_rate,
  CASE 
    WHEN fp.total_budget > 0
    THEN ROUND(COALESCE(SUM(bc.actual_amount), 0) * 100.0 / fp.total_budget, 2)
    ELSE 0
  END as budget_utilization,
  s.total_units,
  (SELECT COUNT(DISTINCT dw.unit_id) FROM debt_workflows dw 
    JOIN units u ON u.id = dw.unit_id 
    WHERE u.site_id = s.id AND dw.is_active = true AND dw.stage >= 2) as units_in_warning,
  (SELECT COUNT(DISTINCT dw.unit_id) FROM debt_workflows dw 
    JOIN units u ON u.id = dw.unit_id 
    WHERE u.site_id = s.id AND dw.is_active = true AND dw.stage = 4) as units_in_legal
FROM sites s
LEFT JOIN fiscal_periods fp ON fp.site_id = s.id
LEFT JOIN budget_categories bc ON bc.fiscal_period_id = fp.id
GROUP BY s.id, s.name, s.total_units, fp.id, fp.name, fp.status, fp.total_budget;
