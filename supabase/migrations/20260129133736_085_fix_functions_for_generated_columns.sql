/*
  # Fix Functions for Generated Columns
  
  The issue was that total_amount is a generated column (calculated automatically).
  We cannot INSERT or UPDATE it directly. This migration fixes both functions to only
  work with base_amount, letting the database calculate total_amount automatically.
  
  Changes:
  - generate_fiscal_period_dues: Remove total_amount from INSERT, only insert base_amount
  - set_all_units_monthly_due: Remove total_amount from UPDATE, only update base_amount
*/

DROP FUNCTION IF EXISTS generate_fiscal_period_dues(uuid);
DROP FUNCTION IF EXISTS set_all_units_monthly_due(uuid, numeric, text);

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
    SELECT site_id, start_date, end_date INTO v_site_id, v_start_date, v_end_date
    FROM fiscal_periods WHERE id = p_fiscal_period_id;

    v_month_date := v_start_date;
    WHILE v_month_date <= v_end_date LOOP
        
        FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id LOOP
            INSERT INTO dues (
                site_id, 
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
                v_site_id, 
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

CREATE OR REPLACE FUNCTION set_all_units_monthly_due(
    p_fiscal_period_id uuid,
    p_monthly_amount numeric,
    p_currency_code text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE dues
    SET 
        base_amount = p_monthly_amount,
        currency_code = p_currency_code
    WHERE fiscal_period_id = p_fiscal_period_id
    AND status = 'pending'; 
END;
$$;
