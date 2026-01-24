/*
  # Fix Multi-Currency Constraints
  
  ## Issue
  The previous migration added a constraint requiring amount_reporting_try > 0,
  but this breaks negative transactions (like payments, transfers out, etc.)
  
  ## Changes
  - Remove the incorrect constraint on amount_reporting_try
  - Add default_currency column to sites table
  - Keep the exchange_rate constraint (must be > 0)
  
  ## Impact
  - Ledger entries can now properly handle negative amounts
  - Sites can specify their default/reporting currency
*/

-- Drop the incorrect constraint on amount_reporting_try
ALTER TABLE ledger_entries 
  DROP CONSTRAINT IF EXISTS ledger_entries_amount_reporting_try_check;

-- Add default_currency to sites table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'default_currency'
  ) THEN
    ALTER TABLE sites 
      ADD COLUMN default_currency text NOT NULL DEFAULT 'TRY';
  END IF;
END $$;

-- Add index for currency filtering on sites
CREATE INDEX IF NOT EXISTS idx_sites_currency ON sites(default_currency);