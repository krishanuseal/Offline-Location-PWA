/*
  # Fix RLS policies for onboarding_records table

  1. Security Updates
    - Update INSERT policy to allow anonymous users to insert records
    - Update SELECT policy to allow anonymous users to read records
    - Keep existing UPDATE policy for authenticated users

  This allows the PWA to work for anonymous users while maintaining security.
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anonymous insert" ON onboarding_records;
DROP POLICY IF EXISTS "Allow authenticated read" ON onboarding_records;
DROP POLICY IF EXISTS "Allow authenticated update" ON onboarding_records;

-- Create new policies that allow anonymous access for INSERT and SELECT
CREATE POLICY "Allow anonymous insert and read"
  ON onboarding_records
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous select"
  ON onboarding_records
  FOR SELECT
  TO anon
  USING (true);

-- Keep authenticated users able to update records
CREATE POLICY "Allow authenticated update"
  ON onboarding_records
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);