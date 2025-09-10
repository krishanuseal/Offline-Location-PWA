import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NetworkStatus } from './components/NetworkStatus';
import { NameForm } from './components/NameForm';
import { NamesList } from './components/NamesList';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { TranslationManager } from './components/TranslationManager';
import { useNetworkStatus, isSlowConnection } from './hooks/useNetworkStatus';
import { useIndexedDB } from './hooks/useIndexedDB';
import { registerServiceWorker, requestNotificationPermission } from './utils/pwaUtils';
function App() {
  const { t } = useTranslation();
  const networkInfo = useNetworkStatus();
  const { names, isLoading, isSyncing, addName, syncPendingData, deleteRecord } = useIndexedDB();

  useEffect(() => {
    registerServiceWorker();
    requestNotificationPermission();
  }, []);

  const handleNameSubmit = async (name: string, location?: { latitude: number; longitude: number; accuracy: number }) => {
    await addName(name, location);
  };

  const handleDeleteRecord = async (id: number) => {
    await deleteRecord(id);
  };
  // Optimize rendering for slow connections
  const isSlow = isSlowConnection(networkInfo);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600">{t('app.loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-all duration-500 ${
      isSlow 
        ? 'bg-gray-50' // Simpler background for slow connections
        : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
    }`}>
      <div className="container mx-auto px-4 py-8 max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">N</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('app.title')}</h1>
          <p className="text-gray-600">{t('app.subtitle')}</p>
        </div>

        {/* Network Status */}
        <div className="flex justify-center mb-6">
          <NetworkStatus networkInfo={networkInfo} />
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
            <NameForm onSubmit={handleNameSubmit} networkInfo={networkInfo} />
          </div>
          
          {names.length > 0 && (
            <div className="border-t border-gray-200 p-6">
              <NamesList names={names} onDeleteRecord={handleDeleteRecord} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            {t('app.footer')}
          </p>
        </div>
        
        {/* Translation Manager (only in development) */}
        {process.env.NODE_ENV === 'development' && <TranslationManager />}
      </div>
    </div>
  );
}

export default App;