const CACHE_NAME = 'digital-onboarding-v2';
const STATIC_CACHE = 'static-v2';
const DYNAMIC_CACHE = 'dynamic-v2';

// Critical resources that must be cached for offline functionality
const CRITICAL_RESOURCES = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css',
  '/manifest.json'
];

// Additional resources to cache opportunistically
const OPTIONAL_RESOURCES = [
  '/src/components/NameForm.tsx',
  '/src/components/NamesList.tsx',
  '/src/components/NetworkStatus.tsx',
  '/src/hooks/useIndexedDB.ts',
  '/src/hooks/useNetworkStatus.ts',
  '/src/hooks/useGeolocation.ts',
  '/src/utils/pwaUtils.ts'
];

// Install event - aggressively cache critical resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache critical resources first
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Caching critical resources...');
        return cache.addAll(CRITICAL_RESOURCES);
      }),
      // Cache optional resources (don't fail if some fail)
      caches.open(DYNAMIC_CACHE).then((cache) => {
        console.log('Caching optional resources...');
        return Promise.allSettled(
          OPTIONAL_RESOURCES.map(url => cache.add(url))
        );
      })
    ]).then(() => {
      console.log('All resources cached successfully');
      // Force activation of new service worker
      return self.skipWaiting();
    }).catch((error) => {
      console.error('Failed to cache resources:', error);
      // Still skip waiting even if some caching fails
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (![STATIC_CACHE, DYNAMIC_CACHE].includes(cacheName)) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log('Service Worker activated and ready');
    })
  );
});

// Enhanced fetch strategy with multiple fallback levels
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);
  
  try {
    // Strategy 1: Cache First for critical resources (app shell)
    if (CRITICAL_RESOURCES.some(resource => url.pathname === resource || url.pathname.endsWith(resource))) {
      return await cacheFirst(request);
    }
    
    // Strategy 2: Network First with fast timeout for dynamic content
    if (url.pathname.startsWith('/api/') || url.pathname.includes('sync')) {
      return await networkFirstWithTimeout(request, 3000);
    }
    
    // Strategy 3: Stale While Revalidate for other resources
    return await staleWhileRevalidate(request);
    
  } catch (error) {
    console.error('Fetch failed:', error);
    
    // Ultimate fallback: try to serve from any cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If it's a navigation request and we have no cache, serve the app shell
    if (request.mode === 'navigate') {
      const appShell = await caches.match('/');
      if (appShell) {
        return appShell;
      }
    }
    
    // Last resort: return a basic offline page
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Offline - Digital Onboarding</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .icon { font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">📱</div>
            <h1>You're Offline</h1>
            <p>Digital Onboarding is temporarily unavailable. Please check your connection and try again.</p>
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3B82F6; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>
          </div>
        </body>
      </html>`,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  }
}

// Cache First Strategy - for critical app shell resources
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    throw error;
  }
}

// Network First with Timeout - for API calls
async function networkFirstWithTimeout(request, timeout = 3000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const networkResponse = await fetch(request, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed or timed out, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Stale While Revalidate - serve cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  // Start network request in background
  const networkResponsePromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => {
    // Network failed, but we might have cache
    return null;
  });
  
  // Return cached response immediately if available
  if (cachedResponse) {
    // Update cache in background
    networkResponsePromise;
    return cachedResponse;
  }
  
  // No cache available, wait for network
  const networkResponse = await networkResponsePromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  throw new Error('No cached response and network failed');
}

// Background sync for when connectivity returns
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(syncPendingData());
  }
});

// Enhanced sync function with retry logic
async function syncPendingData() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingSync'], 'readwrite');
    const store = transaction.objectStore('pendingSync');
    const pendingData = await getAllFromStore(store);
    
    console.log(`Syncing ${pendingData.length} pending items...`);
    
    for (const item of pendingData) {
      try {
        // Simulate API call with retry logic
        const success = await syncItemWithRetry(item.data, 3);
        
        if (success) {
          // Mark as synced in names store
          const namesTransaction = db.transaction(['names'], 'readwrite');
          const namesStore = namesTransaction.objectStore('names');
          const nameData = { ...item.data, synced: true };
          await putInStore(namesStore, nameData);
          
          // Remove from pending sync
          await deleteFromStore(store, item.id);
          console.log('Successfully synced item:', item.id);
          
          // Notify user of successful sync
          if ('Notification' in self && Notification.permission === 'granted') {
            self.registration.showNotification('Data Synced', {
              body: `Onboarding data has been synced`,
              icon: '/manifest.json',
              badge: '/manifest.json',
              tag: 'sync-success'
            });
          }
        }
      } catch (error) {
        console.error('Failed to sync item:', item.id, error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

async function syncItemWithRetry(data, maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Replace with your actual API endpoint
      const response = await fetch('/api/sync-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        return true;
      }
      
      if (attempt === maxRetries) {
        throw new Error(`Sync failed after ${maxRetries} attempts`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  return false;
}

// Helper functions for IndexedDB operations
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NameCollectorDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('names')) {
        db.createObjectStore('names', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pendingSync')) {
        db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function putInStore(store, data) {
  return new Promise((resolve, reject) => {
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteFromStore(store, id) {
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}