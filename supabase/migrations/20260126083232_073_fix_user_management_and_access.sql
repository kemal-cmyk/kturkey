/*
  # Fix User Management Access and Registration
  
  1. New Policies
    - Allow users to self-register as 'homeowner' in user_site_roles
  
  2. New Functions
    - Create secure RPC function `get_site_users` to list users/emails for Admins/SuperAdmins
    - This bypasses the need for Edge Functions for listing users
  
  3. Security
    - Function uses SECURITY DEFINER to access auth.users safely
    - Access restricted to site admins, board members, or super admins
*/

-- 1. Allow Self-Registration (Insert own role as homeowner)
DROP POLICY IF EXISTS "Users can join sites as homeowners" ON user_site_roles;
CREATE POLICY "Users can join sites as homeowners"
  ON user_site_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    role = 'homeowner'
  );

-- 2. Secure Function to List Users (Admin/Board Member/SuperAdmin Only)
DROP FUNCTION IF EXISTS get_site_users(uuid);
CREATE OR REPLACE FUNCTION get_site_users(p_site_id uuid)
RETURNS TABLE (
  user_id uuid,
  email varchar,
  full_name text,
  role text,
  is_active boolean,
  units json
) SECURITY DEFINER AS $$
BEGIN
  -- Check if executing user is a board member/admin for this site or super admin
  IF NOT EXISTS (
    SELECT 1 FROM user_site_roles 
    WHERE user_id = auth.uid() 
      AND site_id = p_site_id 
      AND role IN ('admin', 'board_member')
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    p.id as user_id,
    au.email::varchar,
    p.full_name,
    usr.role,
    usr.is_active,
    COALESCE(
      (
        SELECT json_agg(json_build_object('id', u.id, 'unit_number', u.unit_number))
        FROM units u 
        WHERE u.owner_id = p.id AND u.site_id = p_site_id
      ),
      '[]'::json
    ) as units
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  JOIN user_site_roles usr ON usr.user_id = p.id AND usr.site_id = p_site_id
  GROUP BY p.id, au.email, p.full_name, usr.role, usr.is_active;
END;
$$ LANGUAGE plpgsql;
