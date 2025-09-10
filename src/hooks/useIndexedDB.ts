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

  // Memoize the syncPendingData function to prevent recreating it on every render
  const syncPendingData = useCallback(async (force = false) => {
    if (!db) return;

    // Prevent multiple simultaneous sync operations
    if (syncPendingData._syncing && !force) return;
    syncPendingData._syncing = true;

    try {
      // Get pending items
      const pendingItems = await new Promise<any[]>((resolve, reject) => {
        const transaction = db.transaction(['pendingSync'], 'readonly');
        const store = transaction.objectStore('pendingSync');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Process each pending item
      for (const item of pendingItems) {
        try {
          console.log('Syncing:', item.data);
          
          // Mark as synced in names store
          await new Promise<void>((resolve, reject) => {
            const namesTransaction = db.transaction(['names'], 'readwrite');
            const namesStore = namesTransaction.objectStore('names');
            const nameData = { ...item.data, synced: true };
            const putRequest = namesStore.put(nameData);
            
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
          });
          
          // Remove from pending sync
          await new Promise<void>((resolve, reject) => {
            const syncTransaction = db.transaction(['pendingSync'], 'readwrite');
            const syncStore = syncTransaction.objectStore('pendingSync');
            const deleteRequest = syncStore.delete(item.id);
            
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
          });
          
        } catch (error) {
          console.error('Failed to sync item:', item.id, error);
        }
      }
      
      // Reload names to reflect sync status
      if (db) {
        const transaction = db.transaction(['names'], 'readonly');
        const store = transaction.objectStore('names');
        
        const request = store.getAll();
        request.onsuccess = () => {
          setNames(request.result);
        };
      }
      
    } catch (error) {
      console.error('Failed to sync pending data:', error);
    } finally {
      syncPendingData._syncing = false;
    }
  }, [db]);

  useEffect(() => {
    const initDB = async () => {
      try {
        setIsLoading(true);
        const database = await openDB();
        setDb(database);
        
        // Always load from Supabase first when online
        if (navigator.onLine) {
          await loadFromSupabase(database);
        } else {
          // Only load local data when offline
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

  const loadFromSupabase = async (database: IDBDatabase) => {
    try {
      // Fetch all records from Supabase
      const supabaseRecords = await fetchAllRecords();
      
      // Convert Supabase records to local format
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
      }));
      
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
      // Fallback to local data only
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
          setNames(request.result);
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

    // Detect language of the input text
    const detectLanguage = (text: string): string => {
      // Simple language detection based on Unicode ranges
      const hindiRegex = /[\u0900-\u097F]/;
      return hindiRegex.test(text) ? 'hi' : 'en';
    };
    const nameEntry: NameEntry = {
      name: name.trim(),
      language: detectLanguage(name.trim()),
      location,
      timestamp: Date.now(),
      synced: isOnline
    };

    try {
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      const request = store.add(nameEntry);
      
      request.onsuccess = async () => {
        const newEntry = { ...nameEntry, id: request.result as number };
        
        // Always sync to Supabase when online
        if (isOnline) {
          try {
            await syncRecordToSupabase(newEntry);
            // Reload from Supabase to get the latest data
            await loadFromSupabase(db);
          } catch (error) {
            console.error('Failed to sync to Supabase:', error);
            // Add to local state if sync fails
            setNames(prev => [...prev, newEntry]);
            addToPendingSync(newEntry);
          }
        } else {
          // If offline, add to local state and pending sync
          setNames(prev => [...prev, newEntry]);
          addToPendingSync(newEntry);
        }
      };
    } catch (error) {
      console.error('Failed to add name:', error);
    }
  };

  const addToPendingSync = async (nameEntry: NameEntry) => {
    if (!db) return;

    try {
      const transaction = db.transaction(['pendingSync'], 'readwrite');
      const store = transaction.objectStore('pendingSync');
      store.add({
        data: nameEntry,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to add to pending sync:', error);
    }
  };

  const deleteRecord = async (id: number): Promise<void> => {
    if (!db) return;

    try {
      // Find the record to get its details for Supabase deletion
      const recordToDelete = names.find(name => name.id === id);
      
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => {
        setNames(prev => prev.filter(name => name.id !== id));
        
        // TODO: Also delete from Supabase if online
        // This would require adding a delete function to useSupabaseSync
      };
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  };
  return {
    names,
    isLoading,
    addName,
    syncPendingData,
    deleteRecord
  };
}