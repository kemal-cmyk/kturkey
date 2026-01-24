/*
  # KTurkey Database Schema - Part 7: Support Tickets & Database Functions
  
  ## Overview
  Creates support ticket system and essential database functions for business logic.
  
  ## New Tables
  
  ### 1. `support_tickets`
  Homeowner support/maintenance requests:
  - `id` (uuid, PK)
  - `unit_id` (uuid, FK) - Unit creating ticket
  - `site_id` (uuid, FK) - Site reference
  - `category` (text) - 'plumbing' | 'cleaning' | 'electrical' | 'elevator' | 'other'
  - `title` (text) - Brief issue title
  - `description` (text) - Detailed description
  - `status` (text) - 'open' | 'in_progress' | 'resolved' | 'closed'
  - `priority` (text) - 'low' | 'medium' | 'high' | 'urgent'
  - `assigned_to` (uuid) - Admin handling ticket
  - `resolution_notes` (text) - How issue was resolved
  - `created_by` (uuid) - User who created ticket
  
  ## Database Functions
  
  ### 1. calculate_unit_monthly_due()
  Calculates monthly due amount for a unit based on budget and distribution method.
  
  ### 2. generate_fiscal_period_dues()
  Generates all 12 months of dues when fiscal period is activated.
  
  ### 3. perform_fiscal_year_rollover()
  Executes year-end closing with balance transfers and legal flag continuity.
  
  ### 4. update_debt_workflow_stage()
  Updates debt workflow stage based on months overdue.
*/

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  category text DEFAULT 'other' CHECK (category IN ('plumbing', 'cleaning', 'electrical', 'elevator', 'security', 'garden', 'parking', 'other')),
  title text NOT NULL,
  description text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes text,
  resolved_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Admins can view all tickets for their site
CREATE POLICY "Admins can view all tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = support_tickets.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Homeowners can view tickets they created
CREATE POLICY "Homeowners can view own tickets"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Homeowners can create tickets
CREATE POLICY "Homeowners can create tickets"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = support_tickets.site_id
      AND usr.user_id = auth.uid()
    )
  );

-- Admins can update tickets
CREATE POLICY "Admins can update tickets"
  ON support_tickets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = support_tickets.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = support_tickets.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_site ON support_tickets(site_id);
CREATE INDEX IF NOT EXISTS idx_tickets_unit ON support_tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON support_tickets(created_by);

-- Function: Calculate monthly due for a unit
CREATE OR REPLACE FUNCTION calculate_unit_monthly_due(
  p_unit_id uuid,
  p_fiscal_period_id uuid
) RETURNS numeric AS $$
DECLARE
  v_site_id uuid;
  v_distribution_method text;
  v_total_budget numeric;
  v_unit_coefficient numeric;
  v_unit_share_ratio numeric;
  v_total_coefficient numeric;
  v_total_share_ratio numeric;
  v_monthly_due numeric;
BEGIN
  -- Get site info
  SELECT u.site_id, s.distribution_method
  INTO v_site_id, v_distribution_method
  FROM units u
  JOIN sites s ON s.id = u.site_id
  WHERE u.id = p_unit_id;
  
  -- Get fiscal period budget
  SELECT total_budget INTO v_total_budget
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  IF v_distribution_method = 'coefficient' THEN
    -- Get unit coefficient
    SELECT COALESCE(ut.coefficient, 1.0) INTO v_unit_coefficient
    FROM units u
    LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
    WHERE u.id = p_unit_id;
    
    -- Get total coefficients for site
    SELECT COALESCE(SUM(COALESCE(ut.coefficient, 1.0)), 1) INTO v_total_coefficient
    FROM units u
    LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
    WHERE u.site_id = v_site_id;
    
    -- Calculate monthly due
    v_monthly_due := (v_total_budget / 12) * (v_unit_coefficient / v_total_coefficient);
  ELSE
    -- Share ratio method
    SELECT share_ratio INTO v_unit_share_ratio
    FROM units WHERE id = p_unit_id;
    
    SELECT COALESCE(SUM(share_ratio), 1) INTO v_total_share_ratio
    FROM units WHERE site_id = v_site_id;
    
    v_monthly_due := (v_total_budget / 12) * (v_unit_share_ratio / v_total_share_ratio);
  END IF;
  
  RETURN ROUND(v_monthly_due, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Generate dues for all units when fiscal period is activated
CREATE OR REPLACE FUNCTION generate_fiscal_period_dues(
  p_fiscal_period_id uuid
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_start_date date;
  v_end_date date;
  v_unit record;
  v_month_date date;
  v_monthly_amount numeric;
  v_dues_count integer := 0;
BEGIN
  -- Get fiscal period info
  SELECT site_id, start_date, end_date
  INTO v_site_id, v_start_date, v_end_date
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through all units in the site
  FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id
  LOOP
    -- Calculate monthly due for this unit
    v_monthly_amount := calculate_unit_monthly_due(v_unit.id, p_fiscal_period_id);
    
    -- Generate 12 months of dues
    v_month_date := v_start_date;
    WHILE v_month_date < v_end_date LOOP
      INSERT INTO dues (unit_id, fiscal_period_id, month_date, base_amount, due_date)
      VALUES (
        v_unit.id,
        p_fiscal_period_id,
        v_month_date,
        v_monthly_amount,
        v_month_date + interval '15 days'
      )
      ON CONFLICT (unit_id, fiscal_period_id, month_date) DO NOTHING;
      
      v_dues_count := v_dues_count + 1;
      v_month_date := v_month_date + interval '1 month';
    END LOOP;
  END LOOP;
  
  -- Update fiscal period status to active
  UPDATE fiscal_periods SET status = 'active' WHERE id = p_fiscal_period_id;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Perform fiscal year rollover (CRITICAL BUSINESS LOGIC)
CREATE OR REPLACE FUNCTION perform_fiscal_year_rollover(
  p_closing_period_id uuid,
  p_new_period_id uuid
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit record;
  v_balance numeric;
  v_transfers_count integer := 0;
  v_debt_workflow record;
BEGIN
  -- Get site ID
  SELECT site_id INTO v_site_id FROM fiscal_periods WHERE id = p_closing_period_id;
  
  -- Loop through all units
  FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id
  LOOP
    -- Calculate final balance (negative = debt, positive = credit)
    SELECT 
      COALESCE(SUM(p.amount), 0) - COALESCE(SUM(d.total_amount), 0)
    INTO v_balance
    FROM units u
    LEFT JOIN dues d ON d.unit_id = u.id AND d.fiscal_period_id = p_closing_period_id
    LEFT JOIN payments p ON p.unit_id = u.id 
      AND p.payment_date BETWEEN 
        (SELECT start_date FROM fiscal_periods WHERE id = p_closing_period_id)
        AND (SELECT end_date FROM fiscal_periods WHERE id = p_closing_period_id)
    WHERE u.id = v_unit.id;
    
    -- Create balance transfer if there's outstanding balance
    IF v_balance <> 0 THEN
      INSERT INTO balance_transfers (
        unit_id, from_fiscal_period_id, to_fiscal_period_id,
        transfer_type, amount, description
      ) VALUES (
        v_unit.id, p_closing_period_id, p_new_period_id,
        CASE WHEN v_balance < 0 THEN 'debt' ELSE 'credit' END,
        ABS(v_balance),
        'Previous Period Balance Transfer'
      );
      
      -- Create a "previous period" due entry in new period
      IF v_balance < 0 THEN
        INSERT INTO dues (
          unit_id, fiscal_period_id, month_date, base_amount, due_date,
          is_from_previous_period, previous_period_id, notes
        ) VALUES (
          v_unit.id, p_new_period_id,
          (SELECT start_date FROM fiscal_periods WHERE id = p_new_period_id),
          ABS(v_balance),
          (SELECT start_date FROM fiscal_periods WHERE id = p_new_period_id),
          true, p_closing_period_id,
          'Debt from Previous Years'
        );
      END IF;
      
      v_transfers_count := v_transfers_count + 1;
    END IF;
    
    -- CRITICAL: Carry over legal status
    SELECT * INTO v_debt_workflow
    FROM debt_workflows
    WHERE unit_id = v_unit.id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;
    
    IF v_debt_workflow.id IS NOT NULL AND v_debt_workflow.stage >= 2 THEN
      -- Transfer the legal flag
      INSERT INTO balance_transfers (
        unit_id, from_fiscal_period_id, to_fiscal_period_id,
        transfer_type, legal_stage, description
      ) VALUES (
        v_unit.id, p_closing_period_id, p_new_period_id,
        'legal_flag', v_debt_workflow.stage,
        'Legal Status Continuity - Stage ' || v_debt_workflow.stage
      );
      
      -- Update debt workflow to reference new period
      UPDATE debt_workflows
      SET fiscal_period_id = p_new_period_id,
          updated_at = now()
      WHERE id = v_debt_workflow.id;
    END IF;
  END LOOP;
  
  -- Close the old fiscal period
  UPDATE fiscal_periods
  SET status = 'closed', closed_at = now()
  WHERE id = p_closing_period_id;
  
  RETURN v_transfers_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Update debt workflow stage based on overdue months
CREATE OR REPLACE FUNCTION update_debt_workflow_stages(p_site_id uuid)
RETURNS integer AS $$
DECLARE
  v_unit record;
  v_oldest_unpaid date;
  v_months_overdue integer;
  v_total_debt numeric;
  v_current_stage integer;
  v_new_stage integer;
  v_updates_count integer := 0;
BEGIN
  FOR v_unit IN SELECT id FROM units WHERE site_id = p_site_id
  LOOP
    -- Calculate oldest unpaid due and total debt
    SELECT MIN(due_date), SUM(total_amount - paid_amount)
    INTO v_oldest_unpaid, v_total_debt
    FROM dues
    WHERE unit_id = v_unit.id
    AND status IN ('pending', 'overdue', 'partial');
    
    IF v_oldest_unpaid IS NOT NULL AND v_total_debt > 0 THEN
      -- Calculate months overdue
      v_months_overdue := EXTRACT(MONTH FROM age(CURRENT_DATE, v_oldest_unpaid))
        + EXTRACT(YEAR FROM age(CURRENT_DATE, v_oldest_unpaid)) * 12;
      
      -- Determine stage based on months
      IF v_months_overdue < 3 THEN
        v_new_stage := 1;
      ELSIF v_months_overdue < 6 THEN
        v_new_stage := 2;
      ELSIF v_months_overdue < 9 THEN
        v_new_stage := 3;
      ELSE
        v_new_stage := 4;
      END IF;
      
      -- Get or create debt workflow
      SELECT stage INTO v_current_stage
      FROM debt_workflows
      WHERE unit_id = v_unit.id AND is_active = true
      ORDER BY created_at DESC LIMIT 1;
      
      IF v_current_stage IS NULL THEN
        -- Create new workflow
        INSERT INTO debt_workflows (unit_id, stage, total_debt_amount, oldest_unpaid_date, months_overdue)
        VALUES (v_unit.id, v_new_stage, v_total_debt, v_oldest_unpaid, v_months_overdue);
        v_updates_count := v_updates_count + 1;
      ELSIF v_new_stage > v_current_stage THEN
        -- Update stage (only escalate, never de-escalate automatically)
        UPDATE debt_workflows
        SET stage = v_new_stage,
            total_debt_amount = v_total_debt,
            oldest_unpaid_date = v_oldest_unpaid,
            months_overdue = v_months_overdue,
            stage_changed_at = now(),
            warning_sent_at = CASE WHEN v_new_stage >= 2 AND warning_sent_at IS NULL THEN now() ELSE warning_sent_at END,
            letter_generated_at = CASE WHEN v_new_stage >= 3 AND letter_generated_at IS NULL THEN now() ELSE letter_generated_at END,
            legal_action_at = CASE WHEN v_new_stage >= 4 AND legal_action_at IS NULL THEN now() ELSE legal_action_at END,
            updated_at = now()
        WHERE unit_id = v_unit.id AND is_active = true;
        v_updates_count := v_updates_count + 1;
      ELSE
        -- Just update the amounts
        UPDATE debt_workflows
        SET total_debt_amount = v_total_debt,
            months_overdue = v_months_overdue,
            updated_at = now()
        WHERE unit_id = v_unit.id AND is_active = true;
      END IF;
    ELSE
      -- No debt, deactivate any active workflow
      UPDATE debt_workflows
      SET is_active = false, updated_at = now()
      WHERE unit_id = v_unit.id AND is_active = true;
    END IF;
  END LOOP;
  
  RETURN v_updates_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
