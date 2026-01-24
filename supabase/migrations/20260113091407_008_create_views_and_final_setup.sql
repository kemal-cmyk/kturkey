/*
  # KTurkey Database Schema - Part 8: Views & Final Setup
  
  ## Overview
  Creates database views for reporting and dashboard functionality.
  
  ## Views Created
  
  ### 1. `unit_balances`
  Real-time balance calculation for each unit showing:
  - Total dues, total paid, outstanding balance
  - Previous period debt, current period debt
  
  ### 2. `site_financial_summary`
  Aggregated financial data per site:
  - Total budget vs actual spending
  - Collection rate percentage
  - Units in debt count
  
  ### 3. `debt_alerts`
  Units requiring attention:
  - All units in Stage 2+ of debt workflow
  - Units with 3+ months overdue
  
  ### 4. `transparency_report`
  Public-facing site financial summary for homeowners:
  - Total collected, total spent by category
  - Budget utilization percentage
*/

-- View: Unit balances with previous period breakdown
CREATE OR REPLACE VIEW unit_balances AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.site_id,
  u.owner_id,
  u.owner_name,
  fp.id as fiscal_period_id,
  fp.name as fiscal_period_name,
  COALESCE(SUM(CASE WHEN d.is_from_previous_period THEN d.total_amount ELSE 0 END), 0) as previous_period_debt,
  COALESCE(SUM(CASE WHEN NOT d.is_from_previous_period THEN d.total_amount ELSE 0 END), 0) as current_period_dues,
  COALESCE(SUM(d.total_amount), 0) as total_dues,
  COALESCE(SUM(d.paid_amount), 0) as total_paid,
  COALESCE(SUM(d.total_amount), 0) - COALESCE(SUM(d.paid_amount), 0) as outstanding_balance,
  COALESCE(SUM(d.penalty_amount), 0) as total_penalties,
  MIN(CASE WHEN d.status IN ('pending', 'overdue', 'partial') THEN d.due_date END) as oldest_unpaid_date
FROM units u
CROSS JOIN fiscal_periods fp
LEFT JOIN dues d ON d.unit_id = u.id AND d.fiscal_period_id = fp.id
WHERE fp.site_id = u.site_id
GROUP BY u.id, u.unit_number, u.block, u.site_id, u.owner_id, u.owner_name, fp.id, fp.name;

-- View: Site financial summary for dashboard
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
  COALESCE((SELECT SUM(d.paid_amount) FROM dues d 
    JOIN units u ON u.id = d.unit_id 
    WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 0) as total_collected,
  CASE 
    WHEN COALESCE((SELECT SUM(d.total_amount) FROM dues d 
      JOIN units u ON u.id = d.unit_id 
      WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 0) > 0
    THEN ROUND(
      COALESCE((SELECT SUM(d.paid_amount) FROM dues d 
        JOIN units u ON u.id = d.unit_id 
        WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 0) * 100.0 /
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

-- View: Debt alerts for admin dashboard
CREATE OR REPLACE VIEW debt_alerts AS
SELECT 
  dw.id as workflow_id,
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.owner_name,
  u.owner_phone,
  u.site_id,
  s.name as site_name,
  dw.stage,
  CASE dw.stage
    WHEN 1 THEN 'Standard'
    WHEN 2 THEN 'Warning'
    WHEN 3 THEN 'Letter Sent'
    WHEN 4 THEN 'Legal Action'
  END as stage_name,
  dw.total_debt_amount,
  dw.months_overdue,
  dw.oldest_unpaid_date,
  dw.stage_changed_at,
  dw.warning_sent_at,
  dw.letter_generated_at,
  dw.legal_action_at,
  dw.legal_case_number
FROM debt_workflows dw
JOIN units u ON u.id = dw.unit_id
JOIN sites s ON s.id = u.site_id
WHERE dw.is_active = true AND dw.stage >= 2
ORDER BY dw.stage DESC, dw.total_debt_amount DESC;

-- View: Transparency report for homeowners
CREATE OR REPLACE VIEW transparency_report AS
SELECT 
  s.id as site_id,
  s.name as site_name,
  fp.id as fiscal_period_id,
  fp.name as fiscal_period_name,
  fp.total_budget,
  (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries le 
    WHERE le.site_id = s.id AND le.fiscal_period_id = fp.id AND le.entry_type = 'income') as total_income,
  (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries le 
    WHERE le.site_id = s.id AND le.fiscal_period_id = fp.id AND le.entry_type = 'expense') as total_expenses,
  (SELECT jsonb_agg(jsonb_build_object(
    'category', bc.category_name,
    'planned', bc.planned_amount,
    'actual', bc.actual_amount,
    'utilization', CASE WHEN bc.planned_amount > 0 
      THEN ROUND(bc.actual_amount * 100.0 / bc.planned_amount, 2) 
      ELSE 0 END
  )) FROM budget_categories bc WHERE bc.fiscal_period_id = fp.id) as budget_breakdown,
  COALESCE((SELECT SUM(d.paid_amount) FROM dues d 
    JOIN units u ON u.id = d.unit_id 
    WHERE u.site_id = s.id AND d.fiscal_period_id = fp.id), 0) as total_dues_collected,
  s.total_units
FROM sites s
JOIN fiscal_periods fp ON fp.site_id = s.id
WHERE fp.status IN ('active', 'closed');

-- Create default penalty settings when site is created
CREATE OR REPLACE FUNCTION create_default_penalty_settings()
RETURNS trigger AS $$
BEGIN
  INSERT INTO penalty_settings (site_id, months_overdue_threshold, penalty_percentage)
  VALUES (NEW.id, 3, 5.00)
  ON CONFLICT (site_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_penalty_settings ON sites;
CREATE TRIGGER trigger_create_penalty_settings
  AFTER INSERT ON sites
  FOR EACH ROW EXECUTE FUNCTION create_default_penalty_settings();

-- Create default unit type when site is created
CREATE OR REPLACE FUNCTION create_default_unit_type()
RETURNS trigger AS $$
BEGIN
  INSERT INTO unit_types (site_id, name, coefficient, description)
  VALUES (NEW.id, 'Standard', 1.00, 'Default unit type')
  ON CONFLICT (site_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_unit_type ON sites;
CREATE TRIGGER trigger_create_unit_type
  AFTER INSERT ON sites
  FOR EACH ROW EXECUTE FUNCTION create_default_unit_type();
