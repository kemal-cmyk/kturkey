/*
  # Allow Self-Registration for Homeowners
  
  1. Changes
    - Add RLS policy to user_site_roles allowing users to link themselves to a site
    - Restriction: Can only assign 'homeowner' role
    - Restriction: Can only assign to their own user_id
    
  2. Security
    - Users cannot escalate privileges (board_member role blocked)
    - Users cannot assign roles to other users
*/

CREATE POLICY "Users can join sites as homeowners"
  ON user_site_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    role = 'homeowner'
  );