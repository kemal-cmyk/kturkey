/*
  # Update Budget Triggers for Multi-Currency
  
  ## Problem
  Budget tracking triggers use `amount` instead of `amount_reporting_try`,
  which causes incorrect budget calculations when transactions are in foreign currencies.
  
  ## Solution
  Update budget triggers to use `amount_reporting_try` for consistent reporting
  in the site's default currency (TRY).
  
  ## Changes
  1. Update `update_budget_actual_on_ledger_insert()` to use amount_reporting_try
  2. Update `update_budget_actual_on_ledger_delete()` to use amount_reporting_try
*/

-- Update the insert trigger to use amount_reporting_try
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for non-transfer entries with fiscal period
  -- Use amount_reporting_try for multi-currency consistency
  IF NEW.entry_type != 'transfer' AND NEW.fiscal_period_id IS NOT NULL AND NEW.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount + NEW.amount_reporting_try
    WHERE fiscal_period_id = NEW.fiscal_period_id
      AND category_name = NEW.category
      AND category_type = NEW.entry_type;
  END IF;

  RETURN NEW;
END;
$$;

-- Update the delete trigger to use amount_reporting_try
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for non-transfer entries with fiscal period
  -- Use amount_reporting_try for multi-currency consistency
  IF OLD.entry_type != 'transfer' AND OLD.fiscal_period_id IS NOT NULL AND OLD.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount - OLD.amount_reporting_try
    WHERE fiscal_period_id = OLD.fiscal_period_id
      AND category_name = OLD.category
      AND category_type = OLD.entry_type;
  END IF;

  RETURN OLD;
END;
$$;