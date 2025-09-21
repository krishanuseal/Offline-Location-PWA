import { useState, useEffect, useCallback } from 'react';
import { supabase, OnboardingRecord } from '../lib/supabase';

export interface NameEntry {
  id?: number;
  supabaseId?: string;
  name: string;
  language?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  timestamp: number;
  synced: boolean;
  deleted?: boolean;
  deletedAt?: number;
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
        
        // Always load local names first
        await loadLocalNames(database);
        
        // Then fetch and merge remote records if online
        if (navigator.onLine) {
          await fetchAndMergeRemoteRecords(database);
        } else {
          console.log('Offline - showing local records only');
        }
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
    const handleOnline = async () => {
      if (db && !isSyncing) {
        await fetchAndMergeRemoteRecords(db);
        await syncPendingData();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [db, isSyncing]);

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('NameCollectorDB', 2);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Handle version upgrades
        const oldVersion = event.oldVersion;
        
        if (oldVersion < 1) {
          // Version 1: Create initial store
          if (!db.objectStoreNames.contains('names')) {
            const store = db.createObjectStore('names', { keyPath: 'id', autoIncrement: true });
            store.createIndex('supabaseId', 'supabaseId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        }
        
        if (oldVersion < 2) {
          // Version 2: Add deletion tracking (no schema changes needed for existing records)
          console.log('Upgraded to version 2: Added deletion tracking support');
        }
      };
    });
  };

  const loadLocalNames = async (database: IDBDatabase) => {
    try {
      const transaction = database.transaction(['names'], 'readonly');
      const store = transaction.objectStore('names');
      
      return new Promise<void>((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          // Filter out deleted records and sort by timestamp DESC (most recent first)
          const activeRecords = request.result.filter((record: NameEntry) => !record.deleted);
          const sortedNames = activeRecords.sort((a, b) => b.timestamp - a.timestamp);
          console.log('Loaded', sortedNames.length, 'records from IndexedDB');
          setNames(sortedNames);
          resolve();
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load local names:', error);
    }
  };

  const fetchAndMergeRemoteRecords = async (database: IDBDatabase) => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    
    try {
      const { data: remoteRecords, error } = await supabase
        .from('onboarding_records')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Supabase query error:', error);
        return;
      }

      console.log('Remote records fetched:', remoteRecords?.length || 0);
      
      if (!remoteRecords || remoteRecords.length === 0) {
        console.log('No remote records found');
        return;
      }

      // Get existing local records
      const transaction = database.transaction(['names'], 'readwrite');
      const store = transaction.objectStore('names');
      const localRecords = await new Promise<NameEntry[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      console.log('Local records found:', localRecords.length);

      // Create a map of existing local records by supabaseId
      const localRecordMap = new Map<string, NameEntry>();
      localRecords.forEach(record => {
        if (record.supabaseId) {
          localRecordMap.set(record.supabaseId, record);
        }
      });

      // Process remote records and add missing ones to IndexedDB
      let newRecordsAdded = 0;
      const recordsToAdd: NameEntry[] = [];
      
      // Get locally deleted records to check against
      const deletedRecords = localRecords.filter(record => record.deleted && record.supabaseId);
      const deletedSupabaseIds = new Set(deletedRecords.map(record => record.supabaseId!));
      
      for (const remoteRecord of remoteRecords) {
        // Skip if we already have this record locally (not deleted)
        if (localRecordMap.has(remoteRecord.id) && !deletedSupabaseIds.has(remoteRecord.id)) {
          continue;
        }
        
        // Skip if this record was deleted locally
        if (deletedSupabaseIds.has(remoteRecord.id)) {
          console.log('Skipping remote record that was deleted locally:', remoteRecord.id);
          continue;
        }
        
        // Convert remote record to local format
        const localRecord: NameEntry = {
          supabaseId: remoteRecord.id,
          name: remoteRecord.name,
          language: remoteRecord.language || 'en',
          location: remoteRecord.latitude && remoteRecord.longitude ? {
            latitude: parseFloat(remoteRecord.latitude),
            longitude: parseFloat(remoteRecord.longitude),
            accuracy: parseFloat(remoteRecord.location_accuracy || '0')
          } : undefined,
          timestamp: new Date(remoteRecord.timestamp).getTime(),
          synced: true
        };

        recordsToAdd.push(localRecord);
      }

      // Batch add all new records
      if (recordsToAdd.length > 0) {
        const addTransaction = database.transaction(['names'], 'readwrite');
        const addStore = addTransaction.objectStore('names');
        
        for (const record of recordsToAdd) {
          try {
            await new Promise<void>((resolve, reject) => {
              const addRequest = addStore.add(record);
              addRequest.onsuccess = () => {
                newRecordsAdded++;
                resolve();
              };
              addRequest.onerror = () => reject(addRequest.error);
            });
          } catch (error) {
            console.error('Error adding remote record:', error);
          }
        }
        
        console.log('Added', newRecordsAdded, 'new records from Supabase');
      }
      
      // Reload all records from IndexedDB to update the state
      await loadLocalNames(database);

    } catch (error) {
      console.error('Failed to fetch and merge remote records:', error);
    } finally {
      setIsSyncing(false);
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
      
      const newEntry = await new Promise<NameEntry>((resolve, reject) => {
        const request = store.add(nameEntry);
        
        request.onsuccess = () => {
          const entryWithId = { ...nameEntry, id: request.result as number };
          resolve(entryWithId);
        };
        
        request.onerror = () => reject(request.error);
      });

      // Add to beginning of array (most recent first)
      setNames(prev => [newEntry, ...prev]);

      // Try to sync immediately if online
      if (navigator.onLine) {
        await syncSingleRecord(newEntry);
      }
    } catch (error) {
      console.error('Failed to add name:', error);
    }
  };

  const syncSingleRecord = async (record: NameEntry) => {
    if (!navigator.onLine || !db || record.synced) return;

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

      const { data, error } = await supabase
        .from('onboarding_records')
        .insert([supabaseRecord])
        .select()
        .single();

      if (!error && data && record.id) {
        // Mark as synced in local database and store supabaseId
        const transaction = db.transaction(['names'], 'readwrite');
        const store = transaction.objectStore('names');
        const updatedRecord = { 
          ...record, 
          synced: true, 
          supabaseId: data.id 
        };
        
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
      // Step 1: Handle deletions - delete records from server that were deleted locally
      const allLocalRecords = await new Promise<NameEntry[]>((resolve, reject) => {
        const transaction = db.transaction(['names'], 'readonly');
        const store = transaction.objectStore('names');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      const deletedRecords = allLocalRecords.filter(record => record.deleted && record.supabaseId);
      
      if (deletedRecords.length > 0) {
        console.log(`Deleting ${deletedRecords.length} records from server...`);
        
        for (const deletedRecord of deletedRecords) {
          try {
            const { error } = await supabase
              .from('onboarding_records')
              .delete()
              .eq('id', deletedRecord.supabaseId);
            
            if (!error) {
              // Remove the deleted record from local storage completely
              const deleteTransaction = db.transaction(['names'], 'readwrite');
              const deleteStore = deleteTransaction.objectStore('names');
              await new Promise<void>((resolve, reject) => {
                const deleteRequest = deleteStore.delete(deletedRecord.id!);
                deleteRequest.onsuccess = () => resolve();
                deleteRequest.onerror = () => reject(deleteRequest.error);
              });
              console.log('Deleted record from server and local storage:', deletedRecord.supabaseId);
            } else {
              console.error('Failed to delete record from server:', error);
            }
          } catch (error) {
            console.error('Error deleting record:', error);
          }
        }
      }
      
      // Step 2: Push unsynced local records to server
      const transaction = db.transaction(['names'], 'readonly');
      const store = transaction.objectStore('names');
      
      const unsyncedRecords = await new Promise<NameEntry[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const unsynced = request.result.filter(record => !record.synced && !record.deleted);
          resolve(unsynced);
        };
        request.onerror = () => reject(request.error);
      });

      console.log(`Pushing ${unsyncedRecords.length} unsynced records to server...`);
      
      // Push each unsynced record to server
      for (const record of unsyncedRecords) {
        await syncSingleRecord(record);
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Step 3: Pull any new records from server
      console.log('Pulling new records from server...');
      await fetchAndMergeRemoteRecords(db);

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
      
      // First, get the record to check if it has a supabaseId
      const getRequest = store.get(id);
      
      return new Promise<void>((resolve, reject) => {
        getRequest.onsuccess = () => {
          const record = getRequest.result as NameEntry;
          
          if (!record) {
            resolve();
            return;
          }
          
          if (record.supabaseId && record.synced) {
            // Mark as deleted instead of actually deleting (for synced records)
            const updatedRecord = {
              ...record,
              deleted: true,
              deletedAt: Date.now()
            };
            
            const updateRequest = store.put(updatedRecord);
            updateRequest.onsuccess = () => {
              // Remove from UI immediately
              setNames(prev => prev.filter(name => name.id !== id));
              resolve();
            };
            updateRequest.onerror = () => reject(updateRequest.error);
          } else {
            // Actually delete unsynced records
            const deleteRequest = store.delete(id);
            deleteRequest.onsuccess = () => {
              setNames(prev => prev.filter(name => name.id !== id));
              resolve();
            };
            deleteRequest.onerror = () => reject(deleteRequest.error);
          }
        };
        
        getRequest.onerror = () => reject(getRequest.error);
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