export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('SW registered: ', registration);
        
        // Register for background sync
        if ('sync' in window.ServiceWorkerRegistration.prototype) {
          await registration.sync.register('background-sync');
        }

        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker is available
                showUpdateNotification();
              }
            });
          }
        });

        // Handle service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'CACHE_UPDATED') {
            console.log('Cache updated:', event.data.payload);
          }
        });

      } catch (error) {
        console.log('SW registration failed: ', error);
      }
    });
  }
}

export function requestNotificationPermission() {
  // Only request permission when called explicitly by user interaction
  if ('Notification' in window && Notification.permission === 'default') {
    return Notification.requestPermission().then((permission) => {
      console.log('Notification permission:', permission);
      return permission;
    });
  }
  return Promise.resolve(Notification.permission);
}

export function showNotification(title: string, options?: NotificationOptions) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

function showUpdateNotification() {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('App Updated', {
      body: 'नया संस्करण उपलब्ध है। अपडेट करने के लिए रीफ्रेश करें। / A new version is available. Refresh to update.',
      icon: '/manifest.json',
      badge: '/manifest.json',
      tag: 'app-update',
      requireInteraction: true,
      actions: [
        {
          action: 'refresh',
          title: 'Refresh Now'
        },
        {
          action: 'dismiss',
          title: 'Later'
        }
      ]
    });

    notification.onclick = () => {
      window.location.reload();
    };
  }
}

// Preload critical resources
export function preloadCriticalResources() {
  const criticalResources = [
    '/src/main.tsx',
    '/src/App.tsx',
    '/src/index.css'
  ];

  criticalResources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource;
    link.as = resource.endsWith('.css') ? 'style' : 'script';
    document.head.appendChild(link);
  });
}

// Connection quality assessment
export function assessConnectionQuality(): 'good' | 'poor' | 'offline' {
  if (!navigator.onLine) return 'offline';
  
  const connection = (navigator as any).connection || 
                    (navigator as any).mozConnection || 
                    (navigator as any).webkitConnection;
  
  if (!connection) return 'good'; // Assume good if no info available
  
  // Poor connection indicators
  if (
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g' ||
    connection.rtt > 1000 ||
    connection.downlink < 0.5 ||
    connection.saveData
  ) {
    return 'poor';
  }
  
  return 'good';
}