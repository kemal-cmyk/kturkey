/*
  # Add Currency Support to Dues and Update Functions
  
  ## Overview
  Adds multi-currency support to dues table so that each site can have its own 
  default currency for monthly dues. Reports always use TRY for consistency.
  
  ## Changes
  
  1. **dues table**
    - Add `currency_code` column (defaults to site's default_currency)
    - This allows maintenance fees to be recorded in the site's chosen currency
  
  2. **Update RPC functions** 
    - Modify `generate_fiscal_period_dues` to use site's default_currency
    - Ensure all new dues records get proper currency from site settings
  
  ## Important Notes
  - Site-level currency is for unit dues and local transactions
  - Reports (Budget vs Actual, Monthly Income/Expenses) always use TRY reporting amounts
  - Exchange rates are handled at payment/ledger entry level
*/

-- Add currency_code to dues table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dues' AND column_name = 'currency_code'
  ) THEN
    ALTER TABLE dues 
      ADD COLUMN currency_code text NOT NULL DEFAULT 'TRY';
  END IF;
END $$;

-- Update existing dues to use the site's default currency
UPDATE dues
SET currency_code = (
  SELECT COALESCE(s.default_currency, 'TRY')
  FROM units u
  INNER JOIN sites s ON s.id = u.site_id
  WHERE u.id = dues.unit_id
)
WHERE currency_code = 'TRY';

-- Drop the old function first
DROP FUNCTION IF EXISTS generate_fiscal_period_dues(uuid);

-- Recreate generate_fiscal_period_dues function with currency support
CREATE OR REPLACE FUNCTION generate_fiscal_period_dues(p_fiscal_period_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_site_id uuid;
  v_total_budget numeric;
  v_distribution_method text;
  v_start_date date;
  v_end_date date;
  v_unit_count int;
  v_currency_code text;
  v_unit record;
  v_monthly_amount numeric;
  v_current_date date;
  v_total_coefficient numeric;
  v_total_share_ratio numeric;
BEGIN
  -- Get fiscal period details and site currency
  SELECT 
    fp.site_id, 
    fp.total_budget, 
    s.distribution_method, 
    fp.start_date, 
    fp.end_date,
    COALESCE(s.default_currency, 'TRY')
  INTO 
    v_site_id, 
    v_total_budget, 
    v_distribution_method, 
    v_start_date, 
    v_end_date,
    v_currency_code
  FROM fiscal_periods fp
  INNER JOIN sites s ON s.id = fp.site_id
  WHERE fp.id = p_fiscal_period_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Fiscal period not found';
  END IF;

  -- Count active units
  SELECT COUNT(*) INTO v_unit_count
  FROM units
  WHERE site_id = v_site_id;

  IF v_unit_count = 0 THEN
    RETURN;
  END IF;

  -- Calculate distribution factors
  IF v_distribution_method = 'coefficient' THEN
    SELECT COALESCE(SUM(ut.coefficient), v_unit_count)
    INTO v_total_coefficient
    FROM units u
    LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
    WHERE u.site_id = v_site_id;
  ELSIF v_distribution_method = 'share_ratio' THEN
    SELECT COALESCE(SUM(share_ratio), v_unit_count)
    INTO v_total_share_ratio
    FROM units
    WHERE site_id = v_site_id;
  END IF;

  -- Generate dues for each unit for each month
  FOR v_unit IN 
    SELECT u.id as unit_id,
           COALESCE(ut.coefficient, 1.0) as coefficient,
           u.share_ratio
    FROM units u
    LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
    WHERE u.site_id = v_site_id
  LOOP
    v_current_date := v_start_date;
    
    WHILE v_current_date <= v_end_date LOOP
      -- Calculate monthly amount based on distribution method
      IF v_distribution_method = 'coefficient' THEN
        v_monthly_amount := (v_total_budget / 12.0) * 
                           (v_unit.coefficient / NULLIF(v_total_coefficient, 0));
      ELSIF v_distribution_method = 'share_ratio' THEN
        v_monthly_amount := (v_total_budget / 12.0) * 
                           (v_unit.share_ratio / NULLIF(v_total_share_ratio, 0));
      ELSE
        v_monthly_amount := v_total_budget / 12.0 / NULLIF(v_unit_count, 0);
      END IF;

      -- Insert due record with site currency
      INSERT INTO dues (
        unit_id,
        fiscal_period_id,
        month_date,
        base_amount,
        total_amount,
        due_date,
        status,
        currency_code
      ) VALUES (
        v_unit.unit_id,
        p_fiscal_period_id,
        v_current_date,
        v_monthly_amount,
        v_monthly_amount,
        v_current_date + INTERVAL '10 days',
        'pending',
        v_currency_code
      )
      ON CONFLICT DO NOTHING;

      v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;
  END LOOP;
END;
$$;

-- Create index for currency filtering
CREATE INDEX IF NOT EXISTS idx_dues_currency ON dues(currency_code);