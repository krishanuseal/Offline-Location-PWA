import { useState, useEffect, useCallback } from 'react';
import { supabase, OnboardingRecord } from '../lib/supabase';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initialize database
  useEffect(() => {
    const initDB = async () => {
      try {
        const database = await openDB();
        setDb(database);
        await loadNames(database);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initDB();
  }, []);

  // Sync when network comes back
  useEffect(() => {
    const handleOnline = () => {
      if (db && !isSyncing) {
        syncPendingData();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [db, isSyncing]);

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
          // Sort by timestamp DESC (most recent first)
          const sortedNames = request.result.sort((a, b) => b.timestamp - a.timestamp);
          setNames(sortedNames);
          resolve();
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load names:', error);
    }
  };

  const addName = async (name: string, location?: { latitude: number; longitude: number; accuracy: number }): Promise<void> => {
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
      // Always save to local IndexedDB first
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      
      return new Promise<void>((resolve, reject) => {
        const request = store.add(nameEntry);
        
        request.onsuccess = () => {
          const newEntry = { ...nameEntry, id: request.result as number };
          // Add to beginning of array (most recent first)
          setNames(prev => [newEntry, ...prev]);
          
          // Try to sync immediately if online
          if (navigator.onLine && !isSyncing) {
            syncSingleRecord(newEntry);
          }
          
          resolve();
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to add name:', error);
    }
  };

  const syncSingleRecord = async (record: NameEntry) => {
    if (!navigator.onLine || !db) return;

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

      if (!error && record.id) {
        // Mark as synced in local database
        const transaction = db.transaction(['names'], 'readwrite');
        const store = transaction.objectStore('names');
        const updatedRecord = { ...record, synced: true };
        
        store.put(updatedRecord);
        
        // Update state
        setNames(prev => prev.map(item => 
          item.id === record.id ? updatedRecord : item
        ));
      }
    } catch (error) {
      console.error('Failed to sync record:', error);
    }
  };

  const syncPendingData = useCallback(async () => {
    if (!db || isSyncing || !navigator.onLine) return;
    
    setIsSyncing(true);

    try {
      // Get all unsynced records
      const transaction = db.transaction(['names'], 'readonly');
      const store = transaction.objectStore('names');
      
      const unsyncedRecords = await new Promise<NameEntry[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const unsynced = request.result.filter(record => !record.synced);
          resolve(unsynced);
        };
        request.onerror = () => reject(request.error);
      });

      // Sync each unsynced record
      for (const record of unsyncedRecords) {
        await syncSingleRecord(record);
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error('Failed to sync pending data:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [db, isSyncing]);

  const deleteRecord = async (id: number): Promise<void> => {
    if (!db) return;

    try {
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        
        request.onsuccess = () => {
          setNames(prev => prev.filter(name => name.id !== id));
          resolve();
        };
        
        request.onerror = () => reject(request.error);
      });
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