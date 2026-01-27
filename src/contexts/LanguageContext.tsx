import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { translations as staticTranslations, Language as TranslationLanguage } from '../lib/translations';

export type Language = 'en' | 'tr' | 'ru' | 'de' | 'nl' | 'fa' | 'no' | 'sv' | 'fi' | 'da';

const SUPPORTED_LANGUAGES: Language[] = ['en', 'tr', 'ru', 'de', 'nl', 'fa', 'no', 'sv', 'fi', 'da'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  updateLanguageInDB: (lang: Language) => Promise<void>;
  reloadTranslations: () => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');
  const [dbTranslations, setDbTranslations] = useState<Record<string, Record<Language, string>>>({});
  const [translationsLoaded, setTranslationsLoaded] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem('app_language') as Language;
    if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang)) {
      setLanguageState(savedLang);
    }
  }, []);

  useEffect(() => {
    loadTranslationsFromDB();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserLanguage();
    }
  }, [user]);

  const loadTranslationsFromDB = async () => {
    try {
      const { data, error } = await supabase
        .from('app_translations')
        .select('*');

      if (error) {
        console.error('Failed to load translations from database:', error);
        setTranslationsLoaded(true);
        return;
      }

      if (data) {
        const translationsMap: Record<string, Record<Language, string>> = {};
        data.forEach((row: any) => {
          translationsMap[row.key] = {
            en: row.en || '',
            tr: row.tr || '',
            ru: row.ru || '',
            de: row.de || '',
            nl: row.nl || '',
            fa: row.fa || '',
            no: row.no || '',
            sv: row.sv || '',
            fi: row.fi || '',
            da: row.da || '',
          };
        });
        setDbTranslations(translationsMap);
      }
      setTranslationsLoaded(true);
    } catch (err) {
      console.error('Error loading translations:', err);
      setTranslationsLoaded(true);
    }
  };

  const reloadTranslations = async () => {
    await loadTranslationsFromDB();
  };

  const loadUserLanguage = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', user.id)
      .maybeSingle();

    if (data?.language && SUPPORTED_LANGUAGES.includes(data.language as Language)) {
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
    if (translationsLoaded && dbTranslations[key] && dbTranslations[key][language]) {
      return dbTranslations[key][language];
    }

    const staticLangData = staticTranslations[language];
    if (staticLangData && staticLangData[key]) {
      return staticLangData[key];
    }

    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, updateLanguageInDB, reloadTranslations }}>
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
