import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Send, Check, MapPin, Clock } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import { NetworkInfo, isSlowConnection } from '../hooks/useNetworkStatus';

interface NameFormProps {
  onSubmit: (name: string, location?: { latitude: number; longitude: number; accuracy: number }) => void;
  networkInfo: NetworkInfo;
}

export function NameForm({ onSubmit, networkInfo }: NameFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { location, isLoading: isLoadingLocation, error: locationError, getCurrentLocation } = useGeolocation();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const isSlow = isSlowConnection(networkInfo);

  // Update current time every minute instead of every second to reduce CPU usage
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000); // Update every minute instead of every second
    
    // Update immediately on mount
    setCurrentDateTime(new Date());
    
    return () => clearInterval(timer);
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    
    try {
      let locationData;
      try {
        locationData = await getCurrentLocation();
      } catch (error) {
        console.warn('Could not get location:', error);
        // Continue without location data
      }
      
      await onSubmit(name.trim(), locationData);
      setShowSuccess(true);
      setName('');
      
      setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to submit name:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Current Date and Time Display */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <Clock size={16} />
          <span className="font-medium">{t('session.current')}</span>
        </div>
        <p className="text-lg font-mono text-gray-800">
          {currentDateTime.toLocaleString()}
        </p>
      </div>

      {/* Location Status */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <MapPin size={16} />
          <span className="font-medium">{t('location.status')}</span>
        </div>
        {isLoadingLocation ? (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">{t('location.getting')}</span>
          </div>
        ) : location ? (
          <div className="text-sm text-green-600">
            <p>✓ {t('location.captured')}</p>
            <p className="text-xs text-gray-500 mt-1">
              {t('location.coordinates', { 
                lat: location.latitude.toFixed(6), 
                lng: location.longitude.toFixed(6) 
              })}
            </p>
          </div>
        ) : locationError ? (
          <p className="text-sm text-amber-600">⚠ {locationError}</p>
        ) : (
          <p className="text-sm text-gray-500">{t('location.willCapture')}</p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('form.nameLabel')}</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('form.namePlaceholder')}
            className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
            required
            disabled={isSubmitting}
            dir="auto"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!name.trim() || isSubmitting}
        className={`
          w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all duration-200
          ${showSuccess 
            ? 'bg-green-600 text-white' 
            : !name.trim() || isSubmitting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow-md'
          }
        `}
      >
        {showSuccess ? (
          <>
            <Check size={18} />
            <span>{t('form.saved')}</span>
          </>
        ) : isSubmitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>{t('form.saving')}</span>
          </>
        ) : (
          <>
            <Send size={18} />
            <span>
              {!networkInfo.isOnline 
                ? t('form.submitButtonOffline')
                : networkInfo.isOnline && isSlow 
                  ? t('form.submitButtonSlow')
                  : t('form.submitButton')
              }
            </span>
          </>
        )}
      </button>

      {!networkInfo.isOnline ? (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('form.offlineMessage')}
        </p>
      ) : isSlow && (
        <p className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          {t('form.slowConnectionMessage')}
        </p>
      )}
    </form>
  );
}