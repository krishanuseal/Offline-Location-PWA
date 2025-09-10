import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit3, Save, X, Plus, Trash2 } from 'lucide-react';

interface TranslationEntry {
  key: string;
  english: string;
  hindi: string;
}

export function TranslationManager() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newTranslations, setNewTranslations] = useState<{ [key: string]: string }>({});
  const [newKey, setNewKey] = useState('');
  const [newEnglish, setNewEnglish] = useState('');
  const [newHindi, setNewHindi] = useState('');

  // Get all translation keys from the current resources
  const getAllTranslationKeys = (): TranslationEntry[] => {
    const englishResources = i18n.getResourceBundle('en', 'translation') || {};
    const hindiResources = i18n.getResourceBundle('hi', 'translation') || {};
    
    const flattenObject = (obj: any, prefix = ''): { [key: string]: string } => {
      const flattened: { [key: string]: string } = {};
      for (const key in obj) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          Object.assign(flattened, flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
      return flattened;
    };

    const flatEnglish = flattenObject(englishResources);
    const flatHindi = flattenObject(hindiResources);
    
    const allKeys = new Set([...Object.keys(flatEnglish), ...Object.keys(flatHindi)]);
    
    return Array.from(allKeys).map(key => ({
      key,
      english: flatEnglish[key] || '',
      hindi: flatHindi[key] || ''
    })).sort((a, b) => a.key.localeCompare(b.key));
  };

  const translations = getAllTranslationKeys();

  const handleSaveTranslation = (key: string) => {
    if (newTranslations[key]) {
      // Update the Hindi translation in the i18n resources
      i18n.addResource('hi', 'translation', key, newTranslations[key]);
      
      // Save to localStorage for persistence
      const savedTranslations = JSON.parse(localStorage.getItem('customTranslations') || '{}');
      savedTranslations[key] = newTranslations[key];
      localStorage.setItem('customTranslations', JSON.stringify(savedTranslations));
      
      setEditingKey(null);
      setNewTranslations(prev => ({ ...prev, [key]: '' }));
    }
  };

  const handleAddNewTranslation = () => {
    if (newKey && newEnglish && newHindi) {
      // Add to both languages
      i18n.addResource('en', 'translation', newKey, newEnglish);
      i18n.addResource('hi', 'translation', newKey, newHindi);
      
      // Save to localStorage
      const savedTranslations = JSON.parse(localStorage.getItem('customTranslations') || '{}');
      savedTranslations[newKey] = { en: newEnglish, hi: newHindi };
      localStorage.setItem('customTranslations', JSON.stringify(savedTranslations));
      
      setNewKey('');
      setNewEnglish('');
      setNewHindi('');
    }
  };

  // Load custom translations on component mount
  React.useEffect(() => {
    const savedTranslations = JSON.parse(localStorage.getItem('customTranslations') || '{}');
    Object.entries(savedTranslations).forEach(([key, value]) => {
      if (typeof value === 'string') {
        i18n.addResource('hi', 'translation', key, value);
      } else if (typeof value === 'object' && value !== null) {
        const translations = value as { en?: string; hi?: string };
        if (translations.en) i18n.addResource('en', 'translation', key, translations.en);
        if (translations.hi) i18n.addResource('hi', 'translation', key, translations.hi);
      }
    });
  }, [i18n]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors duration-200 z-50"
        title="Manage Translations"
      >
        <Edit3 size={20} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Translation Manager</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Add New Translation</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Translation key (e.g., form.newField)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="English text"
              value={newEnglish}
              onChange={(e) => setNewEnglish(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Hindi text (हिंदी टेक्स्ट)"
                value={newHindi}
                onChange={(e) => setNewHindi(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                dir="auto"
              />
              <button
                onClick={handleAddNewTranslation}
                disabled={!newKey || !newEnglish || !newHindi}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-y-auto max-h-96">
          <div className="p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Existing Translations</h3>
            <div className="space-y-3">
              {translations.map((translation) => (
                <div key={translation.key} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {translation.key}
                    </code>
                    <button
                      onClick={() => setEditingKey(editingKey === translation.key ? null : translation.key)}
                      className="text-gray-400 hover:text-blue-600 transition-colors duration-200"
                    >
                      <Edit3 size={16} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">English</label>
                      <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded border">
                        {translation.english}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Hindi (हिंदी)</label>
                      {editingKey === translation.key ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newTranslations[translation.key] || translation.hindi}
                            onChange={(e) => setNewTranslations(prev => ({ 
                              ...prev, 
                              [translation.key]: e.target.value 
                            }))}
                            className="flex-1 text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            dir="auto"
                            placeholder="Enter Hindi translation"
                          />
                          <button
                            onClick={() => handleSaveTranslation(translation.key)}
                            className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-200"
                          >
                            <Save size={14} />
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded border" dir="auto">
                          {translation.hindi || <span className="text-gray-400 italic">No Hindi translation</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}