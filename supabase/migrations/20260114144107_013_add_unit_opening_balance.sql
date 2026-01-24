/*
  # Add Opening Balance to Units

  ## Overview
  Adds tracking for debt/credit amounts from previous periods for each unit.
  This is essential for:
  - Financial summary calculations
  - Monthly dues & outstanding balance reports
  - Carrying forward balances between fiscal periods

  ## Changes
  
  1. New Column
    - `opening_balance` (numeric) - Previous period's debt (positive) or credit (negative)
      - Positive value = Unit owes money (debt)
      - Negative value = Unit has credit
      - Default: 0.00

  ## Notes
  - This field should be set when transitioning between fiscal periods
  - Admins can manually adjust this during unit setup or period transitions
  - The value represents the balance brought forward from previous periods
*/

-- Add opening_balance column to units table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'units' AND column_name = 'opening_balance'
  ) THEN
    ALTER TABLE units ADD COLUMN opening_balance numeric(10,2) DEFAULT 0.00;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN units.opening_balance IS 'Previous period debt (positive) or credit (negative). Used for financial summaries and outstanding balance calculations.';