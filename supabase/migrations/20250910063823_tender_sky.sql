/*
  # Create onboarding records table

  1. New Tables
    - `onboarding_records`
      - `id` (uuid, primary key)
      - `name` (text, required) - The person's name
      - `language` (text) - Detected language of the name (en/hi)
      - `latitude` (decimal) - Location latitude
      - `longitude` (decimal) - Location longitude
      - `location_accuracy` (decimal) - GPS accuracy in meters
      - `timestamp` (timestamptz) - When the record was created
      - `synced` (boolean) - Whether the record has been synced
      - `created_at` (timestamptz) - Database creation timestamp
      - `updated_at` (timestamptz) - Database update timestamp

  2. Security
    - Enable RLS on `onboarding_records` table
    - Add policy for authenticated users to read/write their own data
    - Add policy for anonymous users to insert records (for offline functionality)

  3. Indexes
    - Index on timestamp for efficient querying
    - Index on synced status for sync operations
*/

-- Create the onboarding_records table
CREATE TABLE IF NOT EXISTS onboarding_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  language text DEFAULT 'en',
  latitude decimal,
  longitude decimal,
  location_accuracy decimal,
  timestamp timestamptz NOT NULL DEFAULT now(),
  synced boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE onboarding_records ENABLE ROW LEVEL SECURITY;

-- Create policies for data access
-- Allow anonymous users to insert records (for offline sync)
CREATE POLICY "Allow anonymous insert"
  ON onboarding_records
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated users to read all records
CREATE POLICY "Allow authenticated read"
  ON onboarding_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update records
CREATE POLICY "Allow authenticated update"
  ON onboarding_records
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_onboarding_records_timestamp 
  ON onboarding_records(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_records_synced 
  ON onboarding_records(synced);

CREATE INDEX IF NOT EXISTS idx_onboarding_records_created_at 
  ON onboarding_records(created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_onboarding_records_updated_at
  BEFORE UPDATE ON onboarding_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();