import { useState, useEffect } from 'react';
import { useSupabaseSync } from './useSupabaseSync';

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
  const { syncRecordToSupabase, migrateLocalRecords } = useSupabaseSync();

  // Memoize the syncPendingData function to prevent recreating it on every render
  const syncPendingData = useCallback(async () => {
    if (!db) return;

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
        await loadNames(db);
      }
      
    } catch (error) {
      console.error('Failed to sync pending data:', error);
    }
  }, [db]);

  useEffect(() => {
    const initDB = async () => {
      try {
        const database = await openDB();
        setDb(database);
        await loadNames(database);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };

    initDB();
  }, []); // Empty dependency array - only run once on mount

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
      
      request.onsuccess = () => {
        const newEntry = { ...nameEntry, id: request.result as number };
        setNames(prev => [...prev, newEntry]);
        
        // If offline, add to pending sync
        if (!isOnline) {
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

  };
  return {
    names,
    addName,
    syncPendingData,
    deleteRecord
  };
}