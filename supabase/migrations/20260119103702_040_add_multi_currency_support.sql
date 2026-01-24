/*
  # Add Multi-Currency Support to Ledger Entries
  
  ## Overview
  Adds multi-currency support to track transactions in foreign currencies
  while maintaining TRY as the reporting currency.
  
  ## Changes to `ledger_entries` table
  
  1. New Columns:
    - `currency_code` (text) - ISO currency code (TRY, EUR, USD, GBP, etc.)
      Default: 'TRY'
    - `exchange_rate` (numeric) - Exchange rate to TRY at time of transaction
      Default: 1.0 for TRY transactions
    - `amount_reporting_try` (numeric) - Calculated amount in TRY
      Formula: amount * exchange_rate
  
  ## Logic
  - When currency is TRY: exchange_rate = 1, amount_reporting_try = amount
  - When currency is foreign: user provides exchange_rate, 
    amount_reporting_try = amount * exchange_rate
  
  ## Impact
  - All existing entries default to TRY with exchange_rate 1.0
  - Reports and summaries should use amount_reporting_try for consistency
  - No data loss - existing amount values preserved
*/

-- Add currency_code column with default TRY
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'currency_code'
  ) THEN
    ALTER TABLE ledger_entries 
      ADD COLUMN currency_code text NOT NULL DEFAULT 'TRY';
  END IF;
END $$;

-- Add exchange_rate column with default 1.0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'exchange_rate'
  ) THEN
    ALTER TABLE ledger_entries 
      ADD COLUMN exchange_rate numeric(15,6) NOT NULL DEFAULT 1.0;
  END IF;
END $$;

-- Add amount_reporting_try column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'amount_reporting_try'
  ) THEN
    ALTER TABLE ledger_entries 
      ADD COLUMN amount_reporting_try numeric(15,2);
  END IF;
END $$;

-- Update existing records to set amount_reporting_try = amount (since they're all TRY)
UPDATE ledger_entries 
SET amount_reporting_try = amount 
WHERE amount_reporting_try IS NULL;

-- Make amount_reporting_try NOT NULL after populating existing data
ALTER TABLE ledger_entries 
  ALTER COLUMN amount_reporting_try SET NOT NULL;

-- Add check constraint for valid exchange rate
DO $$
BEGIN
  ALTER TABLE ledger_entries 
    DROP CONSTRAINT IF EXISTS ledger_entries_exchange_rate_check;
  
  ALTER TABLE ledger_entries
    ADD CONSTRAINT ledger_entries_exchange_rate_check 
    CHECK (exchange_rate > 0);
END $$;

-- Add check constraint for valid amount_reporting_try
DO $$
BEGIN
  ALTER TABLE ledger_entries 
    DROP CONSTRAINT IF EXISTS ledger_entries_amount_reporting_try_check;
  
  ALTER TABLE ledger_entries
    ADD CONSTRAINT ledger_entries_amount_reporting_try_check 
    CHECK (amount_reporting_try > 0);
END $$;

-- Create index for currency filtering/reporting
CREATE INDEX IF NOT EXISTS idx_ledger_currency ON ledger_entries(currency_code);