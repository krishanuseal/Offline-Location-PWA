import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, CheckCircle, Upload, User, MapPin, Trash2 } from 'lucide-react';
import { NameEntry } from '../hooks/useIndexedDB';

interface NamesListProps {
  names: NameEntry[];
  onDeleteRecord: (id: number) => void;
}

export function NamesList({ names, onDeleteRecord }: NamesListProps) {
  const { t } = useTranslation();
  
  const openLocationInMaps = (latitude: number, longitude: number) => {
    // Create Google Maps URLs
    const webMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=15`;
    const androidMapsUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}&z=15`;
    const iosMapsUrl = `maps://maps.google.com/maps?q=${latitude},${longitude}&z=15`;
    
    // Detect device type
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMobile = isAndroid || isIOS;
    
    if (isMobile) {
      // For mobile devices, try to open native app first
      const nativeUrl = isIOS ? iosMapsUrl : androidMapsUrl;
      
      // Create a temporary link to trigger the native app
      const tempLink = document.createElement('a');
      tempLink.href = nativeUrl;
      tempLink.style.display = 'none';
      document.body.appendChild(tempLink);
      
      // Add event listeners to handle success/failure
      let appOpened = false;
      
      const cleanup = () => {
        document.body.removeChild(tempLink);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      };
      
      const onBlur = () => {
        appOpened = true;
        setTimeout(cleanup, 100);
      };
      
      const onFocus = () => {
        setTimeout(() => {
          if (!appOpened) {
            // Native app didn't open, fallback to web
            window.open(webMapsUrl, '_blank');
          }
          cleanup();
        }, 300);
      };
      
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      
      // Try to open native app
      tempLink.click();
      
      // Fallback timeout in case blur/focus events don't fire
      setTimeout(() => {
        if (!appOpened) {
          window.open(webMapsUrl, '_blank');
          cleanup();
        }
      }, 2000);
      
    } else {
      // For desktop, open web version directly
      window.open(webMapsUrl, '_blank');
    }
  };
  
  const handleDelete = (id: number, name: string) => {
    if (window.confirm(t('records.confirmDelete', { name }))) {
      onDeleteRecord(id);
    }
  };
  
  if (names.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <User className="mx-auto h-12 w-12 text-gray-300 mb-3" />
        <p>{t('records.noRecords')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('records.title')}</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {names.map((entry) => (
          <div
            key={entry.id}
            className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors duration-150"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-medium text-sm">
                  {entry.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 ml-3">
                <p className="font-medium text-gray-900 text-lg" dir="auto">{entry.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {entry.synced ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle size={16} />
                    <span className="text-xs">{t('records.synced')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-600">
                    <Upload size={16} />
                    <span className="text-xs">{t('records.pending')}</span>
                  </div>
                )}
                <button
                  onClick={() => handleDelete(entry.id!, entry.name)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                  title={t('records.deleteRecord')}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Clock size={14} />
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              
              {entry.location ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openLocationInMaps(entry.location!.latitude, entry.location!.longitude)}
                    className="text-blue-600 hover:text-blue-800 active:text-blue-900 transition-colors duration-150 cursor-pointer p-1 rounded hover:bg-blue-50 active:bg-blue-100"
                    title={t('location.openInMaps')}
                    type="button"
                  >
                    <MapPin size={14} />
                  </button>
                  <span className="text-xs">{t('location.coordinates', { 
                    lat: entry.location.latitude.toFixed(6), 
                    lng: entry.location.longitude.toFixed(6) 
                  })}</span>
                  <span className="text-gray-400 text-xs">(±{entry.location.accuracy.toFixed(0)}m)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400">
                  <MapPin size={14} />
                  <span>{t('records.locationUnavailable')}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}