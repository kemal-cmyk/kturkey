import { useState, useEffect } from 'react';
import { useLanguage, Language } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getLanguageName } from '../lib/translations';
import { Globe, Check, Loader2, Plus, Save, Trash2, AlertCircle, Search } from 'lucide-react';

interface TranslationRow {
  key: string;
  en: string;
  tr: string;
  ru: string;
  de: string;
  nl: string;
  fa: string;
  no: string;
  sv: string;
  fi: string;
  da: string;
}

const LANGUAGES: { code: Language; name: string; flag: string; isRTL?: boolean }[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'fa', name: 'فارسی', flag: '🇮🇷', isRTL: true },
  { code: 'no', name: 'Norsk', flag: '🇳🇴' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
];

export default function LanguageSettings() {
  const { language, updateLanguageInDB, reloadTranslations } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [translations, setTranslations] = useState<TranslationRow[]>([]);
  const [editingRows, setEditingRows] = useState<Record<string, TranslationRow>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTranslations();
  }, []);

  const loadTranslations = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('app_translations')
        .select('*')
        .order('key');

      if (fetchError) throw fetchError;

      setTranslations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load translations');
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = async (newLang: Language) => {
    if (newLang === language) return;

    setLoading(true);
    try {
      await updateLanguageInDB(newLang);
      setSuccess('Interface language updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update language');
    } finally {
      setLoading(false);
    }
  };

  const handleEditChange = (key: string, lang: Language, value: string) => {
    setEditingRows(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || translations.find(t => t.key === key)!),
        [lang]: value,
      },
    }));
  };

  const handleSaveRow = async (key: string) => {
    const row = editingRows[key];
    if (!row) return;

    setSavingKeys(prev => new Set(prev).add(key));
    setError('');

    try {
      const { error: saveError } = await supabase
        .from('app_translations')
        .upsert({
          key: row.key,
          en: row.en,
          tr: row.tr,
          ru: row.ru,
          de: row.de,
          nl: row.nl,
          fa: row.fa,
          no: row.no,
          sv: row.sv,
          fi: row.fi,
          da: row.da,
        });

      if (saveError) throw saveError;

      setTranslations(prev =>
        prev.map(t => (t.key === key ? row : t))
      );

      const newEditing = { ...editingRows };
      delete newEditing[key];
      setEditingRows(newEditing);

      await reloadTranslations();

      setSuccess(`Translation for "${key}" saved successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save translation');
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleAddNew = async () => {
    if (!newKey.trim()) {
      setError('Translation key is required');
      return;
    }

    if (translations.some(t => t.key === newKey)) {
      setError('This key already exists');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newRow: TranslationRow = {
        key: newKey,
        en: '',
        tr: '',
        ru: '',
        de: '',
        nl: '',
        fa: '',
        no: '',
        sv: '',
        fi: '',
        da: '',
      };

      const { error: insertError } = await supabase
        .from('app_translations')
        .insert(newRow);

      if (insertError) throw insertError;

      setTranslations(prev => [...prev, newRow].sort((a, b) => a.key.localeCompare(b.key)));
      setNewKey('');
      setShowAddModal(false);

      await reloadTranslations();

      setSuccess(`New translation key "${newKey}" added successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add translation');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = async (key: string) => {
    if (!confirm(`Are you sure you want to delete the translation key "${key}"?`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('app_translations')
        .delete()
        .eq('key', key);

      if (deleteError) throw deleteError;

      setTranslations(prev => prev.filter(t => t.key !== key));

      const newEditing = { ...editingRows };
      delete newEditing[key];
      setEditingRows(newEditing);

      await reloadTranslations();

      setSuccess(`Translation key "${key}" deleted successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete translation');
    } finally {
      setLoading(false);
    }
  };

  const filteredTranslations = translations.filter(t =>
    t.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    Object.values(t).some(val =>
      typeof val === 'string' && val.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Globe className="w-8 h-8 text-[#002561]" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Language Settings</h1>
                <p className="text-gray-600 mt-1">Manage interface language and translations</p>
              </div>
            </div>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
            <Check className="w-5 h-5 text-green-600" />
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Interface Language</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  disabled={loading}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    language === lang.code
                      ? 'border-[#002561] bg-blue-50 ring-2 ring-[#002561]/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {language === lang.code && (
                    <div className="absolute top-2 right-2">
                      <div className="w-5 h-5 bg-[#002561] rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  <div className="text-2xl mb-2">{lang.flag}</div>
                  <div className={`text-sm font-medium text-gray-900 ${lang.isRTL ? 'text-right' : ''}`}>
                    {lang.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Translation Wizard</h2>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Key</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search translations..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading && translations.length === 0 ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#002561] mx-auto mb-4" />
                  <p className="text-gray-600">Loading translations...</p>
                </div>
              ) : filteredTranslations.length === 0 ? (
                <div className="p-12 text-center">
                  <Globe className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">
                    {searchQuery ? 'No translations match your search' : 'No translations found'}
                  </p>
                </div>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                        Key
                      </th>
                      {LANGUAGES.map(lang => (
                        <th
                          key={lang.code}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]"
                        >
                          <div className="flex items-center space-x-2">
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10 border-l border-gray-200">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTranslations.map(translation => {
                      const isEditing = !!editingRows[translation.key];
                      const currentRow = isEditing ? editingRows[translation.key] : translation;
                      const isSaving = savingKeys.has(translation.key);

                      return (
                        <tr key={translation.key} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-200">
                            {translation.key}
                          </td>
                          {LANGUAGES.map(lang => (
                            <td key={lang.code} className="px-4 py-3">
                              <input
                                type="text"
                                value={currentRow[lang.code]}
                                onChange={e => handleEditChange(translation.key, lang.code, e.target.value)}
                                className={`w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#002561] focus:border-transparent ${
                                  lang.isRTL ? 'text-right' : ''
                                }`}
                                dir={lang.isRTL ? 'rtl' : 'ltr'}
                              />
                            </td>
                          ))}
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm sticky right-0 bg-white hover:bg-gray-50 border-l border-gray-200">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleSaveRow(translation.key)}
                                disabled={!isEditing || isSaving}
                                className="p-2 text-[#002561] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Save changes"
                              >
                                {isSaving ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteRow(translation.key)}
                                disabled={isSaving}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete translation"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
              Showing {filteredTranslations.length} of {translations.length} translation keys
            </div>
          </div>
        )}

        {!isSuperAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Admin Access Required</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Only super administrators can manage translations. You can still change your interface language above.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add New Translation Key</h2>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Translation Key
              </label>
              <input
                type="text"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="e.g., new_feature_title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Use lowercase letters, numbers, and underscores only
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewKey('');
                  setError('');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNew}
                disabled={loading || !newKey.trim()}
                className="px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003875] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add Key</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
