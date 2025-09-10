import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, CheckCircle, Upload, User, MapPin } from 'lucide-react';
import { NameEntry } from '../hooks/useIndexedDB';

interface NamesListProps {
  names: NameEntry[];
}

export function NamesList({ names }: NamesListProps) {
  const { t } = useTranslation();
  
  const openLocationInMaps = (latitude: number, longitude: number) => {
    // Create Google Maps URL with the coordinates
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    // Try to open in Google Maps app first (Android), fallback to web
    const androidMapsUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
    
    // Check if we're on Android and try to open the native app
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    if (isAndroid) {
      // Try to open in Google Maps app
      const link = document.createElement('a');
      link.href = androidMapsUrl;
      link.click();
      
      // Fallback to web version after a short delay if app doesn't open
      setTimeout(() => {
        window.open(mapsUrl, '_blank');
      }, 1000);
    } else {
      // For non-Android devices, open web version
      window.open(mapsUrl, '_blank');
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
              <div className="flex items-center gap-2">
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
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors duration-150 cursor-pointer"
                    title="Open in Maps"
                  >
                    <MapPin size={14} />
                  </button>
                  <span>{t('location.coordinates', { 
                    lat: entry.location.latitude.toFixed(6), 
                    lng: entry.location.longitude.toFixed(6) 
                  })} <span className="text-gray-400 ml-1">(±{entry.location.accuracy.toFixed(0)}m)</span></span>
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