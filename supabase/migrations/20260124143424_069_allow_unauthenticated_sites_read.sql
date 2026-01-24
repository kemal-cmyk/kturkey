/*
  # Allow Unauthenticated Access to Active Sites
  
  1. Changes
    - Add RLS policy to sites table allowing anyone (authenticated or not) to read active sites
    - This is needed for the registration page to display available complexes/sites
    - Restriction: Only active sites are visible (is_active = true)
*/

CREATE POLICY "Anyone can view active sites"
  ON sites FOR SELECT
  TO public
  USING (is_active = true);