import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface OnboardingRecord {
  id?: string;
  name: string;
  language?: string;
  latitude?: number;
  longitude?: number;
  location_accuracy?: number;
  timestamp: string;
  synced: boolean;
  created_at?: string;
  updated_at?: string;
}