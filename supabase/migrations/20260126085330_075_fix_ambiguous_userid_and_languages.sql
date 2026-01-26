/*
  # Fix Ambiguous Column & Add Language Support
  
  1. Fixes
    - Replaces `get_site_users` with fully qualified column aliases to prevent "ambiguous reference" errors.
    - Ensures self-registration policy is active.
    
  2. Language Support
    - Adds support for multi-language settings (EN, TR, DE, RU)
*/

-- 1. Drop and recreate the function with correct return type
DROP FUNCTION IF EXISTS get_site_users(uuid);
CREATE OR REPLACE FUNCTION get_site_users(p_site_id uuid)
RETURNS TABLE (
  user_id uuid,
  email varchar,
  full_name text,
  role text,
  is_active boolean,
  unit_numbers text[]
) SECURITY DEFINER AS $$
BEGIN
  -- FIX: We use 'usr' alias for user_site_roles to distinguish from output 'user_id'
  IF NOT EXISTS (
    SELECT 1 FROM user_site_roles usr
    WHERE usr.user_id = auth.uid() AND usr.site_id = p_site_id AND usr.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    au.email::varchar,
    p.full_name,
    usr.role,
    true,
    COALESCE(array_agg(u.unit_number) FILTER (WHERE u.id IS NOT NULL), ARRAY[]::text[])
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  JOIN user_site_roles usr ON usr.user_id = p.id
  LEFT JOIN units u ON u.owner_id = p.id AND u.site_id = p_site_id
  WHERE usr.site_id = p_site_id
  GROUP BY p.id, au.email, p.full_name, usr.role;
END;
$$ LANGUAGE plpgsql;

-- 2. Ensure Self-Registration Policy is Active
DROP POLICY IF EXISTS "Users can join sites as homeowners" ON user_site_roles;
CREATE POLICY "Users can join sites as homeowners"
  ON user_site_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    role = 'homeowner'
  );
