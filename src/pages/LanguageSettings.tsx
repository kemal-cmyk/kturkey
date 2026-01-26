import { useState } from 'react';
import { useLanguage, Language } from '../contexts/LanguageContext';
import { Globe, Check, Loader2 } from 'lucide-react';

const languages: { code: Language; name: string; nativeName: string; flag: string }[] = [
  { code: 'TR', name: 'Turkish', nativeName: 'Turkce', flag: 'TR' },
  { code: 'EN', name: 'English', nativeName: 'English', flag: 'GB' },
  { code: 'RU', name: 'Russian', nativeName: 'Russkiy', flag: 'RU' },
  { code: 'DE', name: 'German', nativeName: 'Deutsch', flag: 'DE' },
];

export default function LanguageSettings() {
  const { language, updateLanguageInDB, t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleLanguageChange = async (newLang: Language) => {
    if (newLang === language) return;

    setLoading(true);
    setSuccess(false);

    try {
      await updateLanguageInDB(newLang);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <Globe className="w-8 h-8 text-[#002561]" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('languageSettings')}</h1>
              <p className="text-gray-600 mt-1">{t('selectLanguage')}</p>
            </div>
          </div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
            <Check className="w-5 h-5 text-green-600" />
            <p className="text-green-800">{t('languageUpdated')}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('selectLanguage')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {languages.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  disabled={loading}
                  className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                    language === lang.code
                      ? 'border-[#002561] bg-blue-50 ring-2 ring-[#002561]/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {language === lang.code && (
                    <div className="absolute top-3 right-3">
                      <div className="w-6 h-6 bg-[#002561] rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-2xl font-bold text-gray-600">
                      {lang.flag}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{lang.nativeName}</div>
                      <div className="text-sm text-gray-500">{lang.name}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#002561]" />
              <span className="text-gray-600">{t('loading')}...</span>
            </div>
          )}
        </div>

        <div className="mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">About Language Support</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            The application supports Turkish, English, Russian, and German languages.
            Your language preference is saved to your profile and will be remembered
            across sessions. Some content may not be fully translated in all languages.
          </p>
        </div>
      </div>
    </div>
  );
}
