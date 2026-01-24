/*
  # Add Currency Support to Accounts
  
  ## Problem
  Accounts need to support different currencies (TRY, EUR, USD, etc.) 
  as some bank accounts or cash accounts may hold foreign currency.
  
  ## Changes
  1. Add currency_code column to accounts table
  2. Update account balances to be currency-specific
  3. Default existing accounts to TRY
  
  ## Impact
  - Accounts can now be created in any supported currency
  - Balance tracking is currency-specific
  - Backward compatible - existing accounts default to TRY
*/

-- Add currency_code to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'TRY';

-- Update existing accounts to explicitly set TRY as currency
UPDATE accounts 
SET currency_code = 'TRY' 
WHERE currency_code IS NULL;