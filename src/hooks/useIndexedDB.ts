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
  const { syncRecordToSupabase, migrateLocalRecords, fetchAllRecords } = useSupabaseSync();

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
        const database = await openDB();
        setDb(database);
        
        // Load from Supabase first, then merge with local data
        await loadFromSupabaseAndMerge(database);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };

    initDB();
  }, []); // Empty dependency array - only run once on mount

  const loadFromSupabaseAndMerge = async (database: IDBDatabase) => {
    try {
      // First load local data
      await loadNames(database);
      
      // Then fetch from Supabase and merge
      const supabaseRecords = await fetchAllRecords();
      
      if (supabaseRecords.length > 0) {
        // Convert Supabase records to local format
        const convertedRecords: NameEntry[] = supabaseRecords.map(record => ({
          id: undefined, // Let IndexedDB assign new IDs
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
        
        // Merge with existing local data (avoid duplicates)
        const transaction = database.transaction(['names'], 'readwrite');
        const store = transaction.objectStore('names');
        
        for (const record of convertedRecords) {
          // Check if record already exists locally
          const existingRecords = await new Promise<NameEntry[]>((resolve, reject) => {
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
          });
          
          const isDuplicate = existingRecords.some(existing => 
            existing.name === record.name && 
            Math.abs(existing.timestamp - record.timestamp) < 60000 // Within 1 minute
          );
          
          if (!isDuplicate) {
            store.add(record);
          }
        }
        
        // Reload names after merge
        await loadNames(database);
      }
    } catch (error) {
      console.error('Failed to load and merge Supabase data:', error);
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
        setNames(prev => [...prev, newEntry]);
        
        // Always try to sync to Supabase when online
        if (isOnline) {
          try {
            await syncRecordToSupabase(newEntry);
            // Update the record as synced
            const updateTransaction = db.transaction(['names'], 'readwrite');
            const updateStore = updateTransaction.objectStore('names');
            updateStore.put({ ...newEntry, synced: true });
          } catch (error) {
            console.error('Failed to sync to Supabase:', error);
            addToPendingSync(newEntry);
          }
        } else {
          // If offline, add to pending sync
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
    addName,
    syncPendingData,
    deleteRecord
  };
}