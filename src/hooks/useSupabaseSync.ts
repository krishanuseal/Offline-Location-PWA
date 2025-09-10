import { useState, useEffect, useCallback } from 'react';
import { supabase, OnboardingRecord } from '../lib/supabase';
import { NameEntry } from './useIndexedDB';

export function useSupabaseSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync a single record to Supabase
  const syncRecordToSupabase = useCallback(async (record: NameEntry): Promise<boolean> => {
    try {
      const supabaseRecord: Omit<OnboardingRecord, 'id' | 'created_at' | 'updated_at'> = {
        name: record.name,
        language: record.language || 'en',
        latitude: record.location?.latitude,
        longitude: record.location?.longitude,
        location_accuracy: record.location?.accuracy,
        timestamp: new Date(record.timestamp).toISOString(),
        synced: true
      };

      const { error } = await supabase
        .from('onboarding_records')
        .insert([supabaseRecord]);

      if (error) {
        console.error('Supabase sync error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to sync record:', error);
      return false;
    }
  }, []);

  // Sync all unsynced records from IndexedDB to Supabase
  const syncAllRecords = async (unsyncedRecords: NameEntry[]): Promise<void> => {
    if (!isOnline || unsyncedRecords.length === 0) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const syncPromises = unsyncedRecords.map(record => syncRecordToSupabase(record));
      const results = await Promise.allSettled(syncPromises);
      
      const failedCount = results.filter(result => 
        result.status === 'rejected' || 
        (result.status === 'fulfilled' && !result.value)
      ).length;

      if (failedCount > 0) {
        setSyncError(`Failed to sync ${failedCount} out of ${unsyncedRecords.length} records`);
      }

      console.log(`Synced ${unsyncedRecords.length - failedCount} records to Supabase`);
    } catch (error) {
      console.error('Bulk sync failed:', error);
      setSyncError('Failed to sync records to server');
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch all records from Supabase
  const fetchAllRecords = async (): Promise<OnboardingRecord[]> => {
    try {
      const { data, error } = await supabase
        .from('onboarding_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch records from Supabase:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch records:', error);
      return [];
    }
  };

  // Migrate existing IndexedDB records to Supabase
  const migrateLocalRecords = async (localRecords: NameEntry[]): Promise<void> => {
    if (!isOnline || localRecords.length === 0) return;

    console.log(`Starting migration of ${localRecords.length} local records to Supabase...`);
    
    setIsSyncing(true);
    setSyncError(null);

    try {
      // Convert local records to Supabase format
      const supabaseRecords = localRecords.map(record => ({
        name: record.name,
        language: record.language || 'en',
        latitude: record.location?.latitude,
        longitude: record.location?.longitude,
        location_accuracy: record.location?.accuracy,
        timestamp: new Date(record.timestamp).toISOString(),
        synced: true
      }));

      // Insert in batches to avoid overwhelming the database
      const batchSize = 50;
      let successCount = 0;
      
      for (let i = 0; i < supabaseRecords.length; i += batchSize) {
        const batch = supabaseRecords.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('onboarding_records')
          .insert(batch);

        if (error) {
          console.error(`Failed to migrate batch ${i / batchSize + 1}:`, error);
        } else {
          successCount += batch.length;
        }
      }

      console.log(`Successfully migrated ${successCount} out of ${localRecords.length} records`);
      
      if (successCount < localRecords.length) {
        setSyncError(`Migrated ${successCount} out of ${localRecords.length} records. Some records failed to migrate.`);
      }
    } catch (error) {
      console.error('Migration failed:', error);
      setSyncError('Failed to migrate local records to server');
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    isOnline,
    isSyncing,
    syncError,
    syncRecordToSupabase,
    syncAllRecords,
    fetchAllRecords,
    migrateLocalRecords
  };
}