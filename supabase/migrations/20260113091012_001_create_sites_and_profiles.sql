/*
  # KTurkey Database Schema - Part 1: Core Tables
  
  ## Overview
  This migration creates the foundational tables for the multi-tenant 
  property management system.
  
  ## New Tables
  
  ### 1. `profiles`
  Extends Supabase auth.users with additional user information:
  - `id` (uuid, PK) - References auth.users
  - `full_name` (text) - User's display name
  - `phone` (text) - Contact number
  - `language` (text) - Preferred language (TR/EN/RU/DE)
  - `avatar_url` (text) - Profile picture
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  
  ### 2. `sites`
  Multi-tenant site/complex definitions:
  - `id` (uuid, PK) - Unique identifier
  - `name` (text) - Site/complex name
  - `address` (text) - Physical address
  - `city` (text) - City location
  - `photo_url` (text) - Site image
  - `total_units` (int) - Number of units
  - `distribution_method` (text) - 'share_ratio' or 'coefficient'
  - `created_at` / `updated_at` - Timestamps
  
  ## Security
  - RLS enabled on all tables
  - Profiles: Users can only access their own profile
  - Sites: Access controlled via user_site_roles (created in next migration)
*/

-- Create profiles table extending auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  language text DEFAULT 'TR' CHECK (language IN ('TR', 'EN', 'RU', 'DE')),
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create sites table for multi-tenancy
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  photo_url text,
  total_units integer DEFAULT 0,
  distribution_method text DEFAULT 'coefficient' CHECK (distribution_method IN ('share_ratio', 'coefficient')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active);
