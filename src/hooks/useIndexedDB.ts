import { useState, useEffect, useCallback } from 'react';
import { useSupabaseSync } from './useSupabaseSync';
import { supabase } from '../lib/supabase';

export interface NameEntry {
  id?: number;
  name: string;
  language?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  timestamp: number;
  synced: boolean;
}

export function useIndexedDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [names, setNames] = useState<NameEntry[]>([]);
  const { syncRecordToSupabase, fetchAllRecords } = useSupabaseSync();
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(0);


  useEffect(() => {
    const initDB = async () => {
      try {
        setIsLoading(true);
        const database = await openDB();
        setDb(database);
        
        // Load from Supabase when online, otherwise load local data
        if (navigator.onLine) {
          await loadFromSupabaseOnly(database);
        } else {
          await loadNames(database);
        }
      } catch (error) {
        console.error('Failed to initialize database:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initDB();
  }, []); // Empty dependency array - only run once on mount

  const loadFromSupabaseOnly = async (database: IDBDatabase) => {
    try {
      const supabaseRecords = await fetchAllRecords();
      
      // Convert and sort by timestamp (most recent first)
      const convertedRecords: NameEntry[] = supabaseRecords.map((record, index) => ({
        id: index + 1, // Use sequential IDs for display
        name: record.name,
        language: record.language || 'en',
        location: record.latitude && record.longitude ? {
          latitude: record.latitude,
          longitude: record.longitude,
          accuracy: record.location_accuracy || 0
        } : undefined,
        timestamp: new Date(record.timestamp).getTime(),
        synced: true
      })).sort((a, b) => b.timestamp - a.timestamp);
      
      // Clear local storage and replace with Supabase data
      const transaction = database.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      
      // Clear existing data
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });
      
      // Add Supabase records
      for (const record of convertedRecords) {
        await new Promise<void>((resolve, reject) => {
          const addRequest = store.add(record);
          addRequest.onsuccess = () => resolve();
          addRequest.onerror = () => reject(addRequest.error);
        });
      }
      
      // Update state with Supabase data
      setNames(convertedRecords);
      
    } catch (error) {
      console.error('Failed to load from Supabase:', error);
      await loadNames(database);
    }
  };

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('NameCollectorDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('names')) {
          db.createObjectStore('names', { keyPath: 'id', autoIncrement: true });
        }
        
        if (!db.objectStoreNames.contains('pendingSync')) {
          db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  };

  const loadNames = async (database: IDBDatabase) => {
    try {
      const transaction = database.transaction(['names'], 'readonly');
      const store = transaction.objectStore('names');
      
      return new Promise<void>((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          // Sort by timestamp (most recent first)
          const sortedNames = request.result.sort((a, b) => b.timestamp - a.timestamp);
          setNames(sortedNames);
          resolve();
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Failed to load names:', error);
    }
  };

  const addName = async (name: string, location: { latitude: number; longitude: number; accuracy: number } | undefined, isOnline: boolean): Promise<void> => {
    if (!db) return;

    const detectLanguage = (text: string): string => {
      const hindiRegex = /[\u0900-\u097F]/;
      return hindiRegex.test(text) ? 'hi' : 'en';
    };

    const nameEntry: NameEntry = {
      name: name.trim(),
      language: detectLanguage(name.trim()),
      location,
      timestamp: Date.now(),
      synced: false
    };

    try {
      if (isOnline) {
        // When online, sync directly to Supabase first
        const success = await syncRecordToSupabase(nameEntry);
        if (success) {
          // Reload all data from Supabase to ensure consistency
          await loadFromSupabaseOnly(db);
        } else {
          // If sync fails, store locally
          await storeLocally(nameEntry);
        }
      } else {
        // When offline, store locally
        await storeLocally(nameEntry);
      }
    } catch (error) {
      console.error('Failed to add name:', error);
    }
  };

  const storeLocally = async (nameEntry: NameEntry) => {
    if (!db) return;

    try {
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      const request = store.add(nameEntry);
      
      request.onsuccess = () => {
        const newEntry = { ...nameEntry, id: request.result as number };
        setNames(prev => [newEntry, ...prev.filter(n => n.id !== newEntry.id)].sort((a, b) => b.timestamp - a.timestamp));
        
        // Add to pending sync
        const syncTransaction = db.transaction(['pendingSync'], 'readwrite');
        const syncStore = syncTransaction.objectStore('pendingSync');
        syncStore.add({
          data: newEntry,
          timestamp: Date.now()
        });
      };
    } catch (error) {
      console.error('Failed to store locally:', error);
    }
  };

  const syncPendingData = useCallback(async () => {
    if (!db || isSyncing || !navigator.onLine) return;
    
    const now = Date.now();
    if (now - lastSyncTime < 5000) return; // Throttle to once every 5 seconds
    
    setIsSyncing(true);
    setLastSyncTime(now);

    try {
      // Get pending items
      const pendingItems = await new Promise<any[]>((resolve, reject) => {
        const transaction = db.transaction(['pendingSync'], 'readonly');
        const store = transaction.objectStore('pendingSync');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (pendingItems.length === 0) return;

      // Sync each pending item
      for (const item of pendingItems) {
        try {
          const success = await syncRecordToSupabase(item.data);
          if (success) {
            // Remove from pending sync
            const syncTransaction = db.transaction(['pendingSync'], 'readwrite');
            const syncStore = syncTransaction.objectStore('pendingSync');
            syncStore.delete(item.id);
          }
        } catch (error) {
          console.error('Failed to sync item:', item.id, error);
        }
      }
      
      // Reload from Supabase to get latest data
      await loadFromSupabaseOnly(db);
      
    } catch (error) {
      console.error('Failed to sync pending data:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [db, isSyncing, lastSyncTime, syncRecordToSupabase, fetchAllRecords]);

  const deleteRecord = async (id: number): Promise<void> => {
    if (!db) return;

    try {
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => {
        setNames(prev => prev.filter(name => name.id !== id));
      };
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  };

  return {
    names,
    isLoading,
    isSyncing,
    addName,
    syncPendingData,
    deleteRecord
  };
}