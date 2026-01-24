/*
  # Remove Automatic Due Calculation
  
  1. Changes
    - Drop the calculate_unit_monthly_due() function (no longer needed)
    - Replace generate_fiscal_period_dues() to only activate period without generating dues
    - Create set_unit_monthly_due() function for manual due entry per unit
    - Dues will be set manually by admins, not calculated from budget
  
  2. New Functionality
    - Budget is now for reporting and expense tracking only
    - Admins manually set monthly due amounts for each unit
    - Dues are still generated for all 12 months, but with amounts set by admin
*/

-- Drop the old automatic calculation function
DROP FUNCTION IF EXISTS calculate_unit_monthly_due(uuid, uuid);

-- Replace generate_fiscal_period_dues to only activate period
CREATE OR REPLACE FUNCTION generate_fiscal_period_dues(
  p_fiscal_period_id uuid
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Just activate the fiscal period, don't generate dues
  UPDATE fiscal_periods 
  SET status = 'active' 
  WHERE id = p_fiscal_period_id;
  
  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to manually set unit monthly dues
CREATE OR REPLACE FUNCTION set_unit_monthly_due(
  p_unit_id uuid,
  p_fiscal_period_id uuid,
  p_monthly_amount numeric
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_start_date date;
  v_end_date date;
  v_month_date date;
  v_dues_count integer := 0;
BEGIN
  -- Validate inputs
  IF p_monthly_amount < 0 THEN
    RAISE EXCEPTION 'Monthly amount cannot be negative';
  END IF;
  
  -- Get fiscal period dates
  SELECT site_id, start_date, end_date
  INTO v_site_id, v_start_date, v_end_date
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Verify unit belongs to same site
  IF NOT EXISTS (
    SELECT 1 FROM units 
    WHERE id = p_unit_id AND site_id = v_site_id
  ) THEN
    RAISE EXCEPTION 'Unit does not belong to this fiscal period site';
  END IF;
  
  -- Delete existing dues for this unit and period
  DELETE FROM dues 
  WHERE unit_id = p_unit_id 
    AND fiscal_period_id = p_fiscal_period_id;
  
  -- Generate 12 months of dues with the specified amount
  v_month_date := v_start_date;
  WHILE v_month_date < v_end_date LOOP
    INSERT INTO dues (unit_id, fiscal_period_id, month_date, base_amount, due_date)
    VALUES (
      p_unit_id,
      p_fiscal_period_id,
      v_month_date,
      p_monthly_amount,
      v_month_date + interval '15 days'
    );
    
    v_dues_count := v_dues_count + 1;
    v_month_date := v_month_date + interval '1 month';
  END LOOP;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to set dues for all units at once (bulk operation)
CREATE OR REPLACE FUNCTION set_all_units_monthly_due(
  p_fiscal_period_id uuid,
  p_monthly_amount numeric
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit RECORD;
  v_total_dues integer := 0;
  v_unit_dues integer;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through all units in the site
  FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id
  LOOP
    -- Set monthly due for this unit
    v_unit_dues := set_unit_monthly_due(v_unit.id, p_fiscal_period_id, p_monthly_amount);
    v_total_dues := v_total_dues + v_unit_dues;
  END LOOP;
  
  RETURN v_total_dues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to set different amounts per unit (for varied pricing)
CREATE OR REPLACE FUNCTION set_varied_unit_monthly_dues(
  p_fiscal_period_id uuid,
  p_unit_amounts jsonb  -- Format: [{"unit_id": "uuid", "monthly_amount": 1000}, ...]
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit_data jsonb;
  v_unit_id uuid;
  v_monthly_amount numeric;
  v_total_dues integer := 0;
  v_unit_dues integer;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through the unit amounts array
  FOR v_unit_data IN SELECT * FROM jsonb_array_elements(p_unit_amounts)
  LOOP
    v_unit_id := (v_unit_data->>'unit_id')::uuid;
    v_monthly_amount := (v_unit_data->>'monthly_amount')::numeric;
    
    -- Set monthly due for this unit
    v_unit_dues := set_unit_monthly_due(v_unit_id, p_fiscal_period_id, v_monthly_amount);
    v_total_dues := v_total_dues + v_unit_dues;
  END LOOP;
  
  RETURN v_total_dues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
