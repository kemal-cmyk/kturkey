/*
  # Fix Generate Dues Function - Remove Non-Existent site_id Column
  
  ## Problem
  The `generate_fiscal_period_dues` function was trying to INSERT a `site_id` column
  into the `dues` table, but that column doesn't exist. This caused the function to fail.
  
  ## Root Cause
  The `dues` table structure is:
  - id, unit_id, fiscal_period_id, month_date, due_date, base_amount, currency_code, status, description
  
  The previous version incorrectly included `site_id` in the INSERT statement.
  
  ## Solution
  1. Drop all affected functions
  2. Recreate `generate_fiscal_period_dues` WITHOUT the site_id column reference
  3. Recreate the "Set Dues" functions that depend on it
  
  ## Impact
  - "Set Dues" button will now work correctly for newly imported units
  - No more column reference errors
  - Dues records will be properly generated for all units in a fiscal period
*/

-- 1. DROP FUNCTIONS TO RESET
DROP FUNCTION IF EXISTS generate_fiscal_period_dues(uuid);
DROP FUNCTION IF EXISTS set_all_units_monthly_due(uuid, numeric, text);
DROP FUNCTION IF EXISTS set_varied_unit_monthly_dues(uuid, jsonb, text);

-- 2. RECREATE "GENERATE DUES" (Fixed: Removed site_id from INSERT)
CREATE OR REPLACE FUNCTION generate_fiscal_period_dues(p_fiscal_period_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_site_id uuid;
    v_start_date date;
    v_end_date date;
    v_month_date date;
    v_unit record;
BEGIN
    -- Get period details
    SELECT site_id, start_date, end_date INTO v_site_id, v_start_date, v_end_date
    FROM fiscal_periods WHERE id = p_fiscal_period_id;

    -- Loop through every month
    v_month_date := v_start_date;
    WHILE v_month_date <= v_end_date LOOP
        
        -- Loop through every unit in the site
        FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id LOOP
            
            -- Insert pending due record (if missing)
            -- FIX: Removed 'site_id' from this INSERT list
            INSERT INTO dues (
                unit_id, 
                fiscal_period_id, 
                month_date, 
                due_date, 
                base_amount, 
                currency_code, 
                status, 
                description
            )
            SELECT 
                v_unit.id, 
                p_fiscal_period_id, 
                v_month_date, 
                v_month_date, 
                0, 
                'TRY', 
                'pending', 
                'Monthly Maintenance Fee'
            WHERE NOT EXISTS (
                SELECT 1 FROM dues 
                WHERE unit_id = v_unit.id 
                AND fiscal_period_id = p_fiscal_period_id
                AND month_date = v_month_date
            );
        END LOOP;
        
        v_month_date := v_month_date + interval '1 month';
    END LOOP;
END;
$$;

-- 3. RECREATE "UNIFORM DUES" (Smart Version)
CREATE OR REPLACE FUNCTION set_all_units_monthly_due(
    p_fiscal_period_id uuid,
    p_monthly_amount numeric,
    p_currency_code text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Generate missing records first
    PERFORM generate_fiscal_period_dues(p_fiscal_period_id);

    -- Update amounts
    UPDATE dues
    SET 
        base_amount = p_monthly_amount,
        currency_code = p_currency_code
    WHERE fiscal_period_id = p_fiscal_period_id;
END;
$$;

-- 4. RECREATE "INDIVIDUAL DUES" (Smart Version)
CREATE OR REPLACE FUNCTION set_varied_unit_monthly_dues(
    p_fiscal_period_id uuid,
    p_unit_amounts jsonb,
    p_currency_code text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    item jsonb;
BEGIN
    -- Generate missing records first
    PERFORM generate_fiscal_period_dues(p_fiscal_period_id);

    -- Loop and update specific units
    FOR item IN SELECT * FROM jsonb_array_elements(p_unit_amounts)
    LOOP
        UPDATE dues
        SET 
            base_amount = (item->>'monthly_amount')::numeric,
            currency_code = p_currency_code
        WHERE fiscal_period_id = p_fiscal_period_id
        AND unit_id = (item->>'unit_id')::uuid;
    END LOOP;
END;
$$;
