/*
  # Add description column to dues table

  1. Changes
    - Add description column to dues table for custom fee labels (e.g., "Roof Repair", "Special Assessment")
    - Set default value for existing dues to 'Maintenance Fee'

  2. Why
    - Allows labeling individual dues with meaningful descriptions
    - Supports special assessments and one-time charges beyond regular maintenance fees
*/

ALTER TABLE dues ADD COLUMN IF NOT EXISTS description text;

UPDATE dues SET description = 'Maintenance Fee' WHERE description IS NULL;
