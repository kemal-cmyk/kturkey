/*
  # KTurkey Database Schema - Part 3: Units & Unit Types
  
  ## Overview
  Creates unit management with configurable distribution coefficients.
  
  ## New Tables
  
  ### 1. `unit_types`
  Configurable unit types per site with coefficients:
  - `id` (uuid, PK)
  - `site_id` (uuid, FK) - References sites
  - `name` (text) - Type name (e.g., "Standard", "Duplex", "Penthouse")
  - `coefficient` (numeric) - Distribution weight (e.g., 1.0, 1.5, 2.0)
  - `description` (text) - Optional description
  
  ### 2. `units`
  Individual apartments/units with ownership:
  - `id` (uuid, PK)
  - `site_id` (uuid, FK) - References sites
  - `unit_type_id` (uuid, FK) - References unit_types
  - `unit_number` (text) - Unit identifier (e.g., "A-101")
  - `block` (text) - Building block name
  - `floor` (int) - Floor number
  - `share_ratio` (numeric) - Arsa Payı for share-based distribution
  - `owner_id` (uuid, FK) - Current owner (references profiles)
  - `owner_name` (text) - Owner name (for display when no user account)
  - `owner_phone` (text) - Owner contact
  - `owner_email` (text) - Owner email
  
  ## Security
  - RLS based on site membership and unit ownership
  - Admins/Board: Can view all units in their site
  - Homeowners: Can only view their own unit
*/

-- Create unit_types table
CREATE TABLE IF NOT EXISTS unit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  coefficient numeric(5,2) DEFAULT 1.00 CHECK (coefficient > 0),
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(site_id, name)
);

ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view unit types of their sites"
  ON unit_types FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = unit_types.site_id
      AND user_site_roles.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert unit types"
  ON unit_types FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = unit_types.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update unit types"
  ON unit_types FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = unit_types.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = unit_types.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete unit types"
  ON unit_types FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = unit_types.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Create units table
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_type_id uuid REFERENCES unit_types(id) ON DELETE SET NULL,
  unit_number text NOT NULL,
  block text,
  floor integer,
  share_ratio numeric(10,6) DEFAULT 0 CHECK (share_ratio >= 0),
  owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  owner_name text,
  owner_phone text,
  owner_email text,
  is_rented boolean DEFAULT false,
  tenant_name text,
  tenant_phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id, unit_number)
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Admins and board members can view all units
CREATE POLICY "Admins and board can view all units"
  ON units FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role IN ('admin', 'board_member')
    )
  );

-- Homeowners can view their own unit
CREATE POLICY "Homeowners can view own unit"
  ON units FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Admins can insert units"
  ON units FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update units"
  ON units FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete units"
  ON units FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unit_types_site ON unit_types(site_id);
CREATE INDEX IF NOT EXISTS idx_units_site ON units(site_id);
CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner_id);
CREATE INDEX IF NOT EXISTS idx_units_type ON units(unit_type_id);

-- Trigger to update site total_units count
CREATE OR REPLACE FUNCTION update_site_unit_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sites SET total_units = total_units + 1 WHERE id = NEW.site_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sites SET total_units = total_units - 1 WHERE id = OLD.site_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_site_unit_count ON units;
CREATE TRIGGER trigger_update_site_unit_count
  AFTER INSERT OR DELETE ON units
  FOR EACH ROW EXECUTE FUNCTION update_site_unit_count();
