import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { translations as translationsData, Language as TranslationLanguage } from '../lib/translations';

export type Language = 'en' | 'tr' | 'de' | 'ru';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  updateLanguageInDB: (lang: Language) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('app_language') as Language;
    if (savedLang && ['en', 'tr', 'de', 'ru'].includes(savedLang)) {
      setLanguageState(savedLang);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadUserLanguage();
    }
  }, [user]);

  const loadUserLanguage = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', user.id)
      .maybeSingle();

    if (data?.language && ['en', 'tr', 'de', 'ru'].includes(data.language)) {
      const lang = data.language as Language;
      setLanguageState(lang);
      localStorage.setItem('app_language', lang);
    }
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const updateLanguageInDB = async (lang: Language) => {
    if (!user) return;

    await supabase
      .from('profiles')
      .update({ language: lang })
      .eq('id', user.id);

    setLanguage(lang);
  };

  const t = (key: string): string => {
    const langData = translationsData[language];
    if (!langData) return key;
    return langData[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, updateLanguageInDB }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
