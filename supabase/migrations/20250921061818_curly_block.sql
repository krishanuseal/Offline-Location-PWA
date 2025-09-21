/*
  # Add DELETE policy for anonymous users

  1. Security Changes
    - Add policy to allow anonymous users to delete their own records
    - This enables the PWA to delete records from the server during sync

  2. Policy Details
    - Allows DELETE operations for anonymous (anon) role
    - No additional restrictions since this is a simple onboarding app
*/

-- Add DELETE policy for anonymous users
CREATE POLICY "Allow anonymous delete"
  ON onboarding_records
  FOR DELETE
  TO anon
  USING (true);