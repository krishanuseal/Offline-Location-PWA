import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, Signal, AlertTriangle } from 'lucide-react';
import { NetworkInfo, isSlowConnection } from '../hooks/useNetworkStatus';

interface NetworkStatusProps {
  networkInfo: NetworkInfo;
}

export function NetworkStatus({ networkInfo }: NetworkStatusProps) {
  const { t } = useTranslation();
  const isSlow = isSlowConnection(networkInfo);
  
  const getStatusConfig = () => {
    if (!networkInfo.isOnline) {
      return {
        icon: WifiOff,
        text: t('network.offline'),
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
        borderColor: 'border-red-200'
      };
    }
    
    if (isSlow) {
      return {
        icon: AlertTriangle,
        text: t('network.slow', { type: networkInfo.effectiveType }),
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-800',
        borderColor: 'border-amber-200'
      };
    }
    
    return {
      icon: networkInfo.effectiveType === '4g' ? Wifi : Signal,
      text: t('network.online', { type: networkInfo.effectiveType }),
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-200'
    };
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  return (
    <div className="space-y-2">
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all duration-300
        ${config.bgColor} ${config.textColor} border ${config.borderColor}
      `}>
        <IconComponent size={16} />
        <span>{config.text}</span>
      </div>
      
      {/* Detailed connection info for debugging */}
      {networkInfo.isOnline && (
        <div className="text-xs text-gray-500 text-center">
          {networkInfo.downlink > 0 && (
            <span>↓{networkInfo.downlink}Mbps </span>
          )}
          {networkInfo.rtt > 0 && (
            <span>RTT:{networkInfo.rtt}ms</span>
          )}
          {networkInfo.saveData && (
            <span className="ml-2 text-amber-600">💾 {t('network.dataSaver')}</span>
          )}
        </div>
      )}
    </div>
  );
}