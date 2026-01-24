/*
  # Recalculate All Budget Category Actual Amounts

  ## Problem
  Budget categories have incorrect actual_amount values because entries were deleted
  before the fix was in place. The actual_amount needs to be recalculated from
  the current ledger_entries table.

  ## Solution
  Recalculate all actual_amount values by summing expenses from ledger_entries
  for each budget category.

  ## Changes
  1. Reset all actual_amount values to 0
  2. Recalculate from current ledger_entries data
*/

-- First, reset all actual amounts to 0
UPDATE budget_categories
SET actual_amount = 0;

-- Now recalculate based on current ledger entries
UPDATE budget_categories bc
SET actual_amount = COALESCE(
  (
    SELECT SUM(le.amount)
    FROM ledger_entries le
    WHERE le.entry_type = 'expense'
      AND le.fiscal_period_id = bc.fiscal_period_id
      AND le.category = bc.category_name
  ),
  0
);
