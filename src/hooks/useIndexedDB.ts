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
  const [migrationCompleted, setMigrationCompleted] = useState(false);

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
  }, []);

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
      const request = store.getAll();
      
      request.onsuccess = () => {
        setNames(request.result);
      };
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

  const syncPendingData = async () => {
    if (!db) return;

    try {
      const transaction = db.transaction(['pendingSync'], 'readwrite');
      const store = transaction.objectStore('pendingSync');
      const request = store.getAll();
      
      request.onsuccess = async () => {
        const pendingItems = request.result;
        
        for (const item of pendingItems) {
          try {
            // Simulate API call (replace with actual endpoint)
            console.log('Syncing:', item.data);
            
            // Mark as synced in names store
            const namesTransaction = db.transaction(['names'], 'readwrite');
            const namesStore = namesTransaction.objectStore('names');
            const nameData = { ...item.data, synced: true };
            namesStore.put(nameData);
            
            // Remove from pending sync
            store.delete(item.id);
          } catch (error) {
            console.error('Failed to sync item:', item.id, error);
          }
        }
        
        // Reload names to reflect sync status
        await loadNames(db);
      };
    } catch (error) {
      console.error('Failed to sync pending data:', error);
    }
  };

  const deleteRecord = async (id: number): Promise<void> => {
    if (!db) return;

    try {
      // Find the record to get its details for Supabase deletion
      const record = names.find(name => name.id === id);
      
      // Delete from IndexedDB
      const transaction = db.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      const request = store.delete(id);
      
      request.onsuccess = async () => {
        // Update local state
        setNames(prev => prev.filter(name => name.id !== id));
        
        // If the record was synced, also delete from Supabase
        if (record?.synced) {
          try {
            // Note: This requires the record to have been synced with a server ID
            // For now, we'll just log this - in a full implementation, you'd need
            // to track the server ID when syncing
            console.log('Record deleted locally. Server cleanup may be needed for:', record);
          } catch (error) {
            console.error('Failed to delete from server:', error);
          }
        }
        
        // Also remove from pending sync if it exists there
        try {
          const pendingTransaction = db.transaction(['pendingSync'], 'readwrite');
          const pendingStore = pendingTransaction.objectStore('pendingSync');
          const pendingRequest = pendingStore.getAll();
          
          pendingRequest.onsuccess = () => {
            const pendingItems = pendingRequest.result;
            const itemToDelete = pendingItems.find(item => 
              item.data.timestamp === record?.timestamp && 
              item.data.name === record?.name
            );
            
            if (itemToDelete) {
              pendingStore.delete(itemToDelete.id);
            }
          };
        } catch (error) {
          console.error('Failed to clean up pending sync:', error);
        }
      };
      
      request.onerror = () => {
        console.error('Failed to delete record:', request.error);
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