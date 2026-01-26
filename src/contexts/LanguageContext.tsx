import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export type Language = 'TR' | 'EN' | 'RU' | 'DE';

interface Translations {
  [key: string]: {
    TR: string;
    EN: string;
    RU: string;
    DE: string;
  };
}

const translations: Translations = {
  dashboard: { TR: 'Panel', EN: 'Dashboard', RU: 'Панель', DE: 'Dashboard' },
  units: { TR: 'Daireler', EN: 'Units', RU: 'Квартиры', DE: 'Einheiten' },
  residents: { TR: 'Sakinler', EN: 'Residents', RU: 'Жители', DE: 'Bewohner' },
  budget: { TR: 'Butce', EN: 'Budget', RU: 'Бюджет', DE: 'Budget' },
  ledger: { TR: 'Muhasebe', EN: 'Ledger', RU: 'Журнал', DE: 'Hauptbuch' },
  reports: { TR: 'Raporlar', EN: 'Reports', RU: 'Отчеты', DE: 'Berichte' },
  settings: { TR: 'Ayarlar', EN: 'Settings', RU: 'Настройки', DE: 'Einstellungen' },
  tickets: { TR: 'Talepler', EN: 'Tickets', RU: 'Заявки', DE: 'Tickets' },
  debtTracking: { TR: 'Borc Takibi', EN: 'Debt Tracking', RU: 'Отслеживание долгов', DE: 'Schulden' },
  fiscalPeriods: { TR: 'Mali Donemler', EN: 'Fiscal Periods', RU: 'Периоды', DE: 'Perioden' },
  userManagement: { TR: 'Kullanici Yonetimi', EN: 'User Management', RU: 'Пользователи', DE: 'Benutzerverwaltung' },
  myAccount: { TR: 'Hesabim', EN: 'My Account', RU: 'Мой аккаунт', DE: 'Mein Konto' },
  logout: { TR: 'Cikis', EN: 'Logout', RU: 'Выход', DE: 'Abmelden' },
  login: { TR: 'Giris', EN: 'Login', RU: 'Вход', DE: 'Anmelden' },
  register: { TR: 'Kayit', EN: 'Register', RU: 'Регистрация', DE: 'Registrieren' },
  language: { TR: 'Dil', EN: 'Language', RU: 'Язык', DE: 'Sprache' },
  save: { TR: 'Kaydet', EN: 'Save', RU: 'Сохранить', DE: 'Speichern' },
  cancel: { TR: 'Iptal', EN: 'Cancel', RU: 'Отмена', DE: 'Abbrechen' },
  loading: { TR: 'Yukleniyor', EN: 'Loading', RU: 'Загрузка', DE: 'Laden' },
  success: { TR: 'Basarili', EN: 'Success', RU: 'Успешно', DE: 'Erfolg' },
  error: { TR: 'Hata', EN: 'Error', RU: 'Ошибка', DE: 'Fehler' },
  totalUnits: { TR: 'Toplam Daire', EN: 'Total Units', RU: 'Всего квартир', DE: 'Einheiten' },
  totalDebt: { TR: 'Toplam Borc', EN: 'Total Debt', RU: 'Общий долг', DE: 'Gesamtschuld' },
  monthlyIncome: { TR: 'Aylik Gelir', EN: 'Monthly Income', RU: 'Месячный доход', DE: 'Monatseinkommen' },
  monthlyExpense: { TR: 'Aylik Gider', EN: 'Monthly Expense', RU: 'Месячные расходы', DE: 'Monatliche Ausgaben' },
  selectSite: { TR: 'Site Sec', EN: 'Select Site', RU: 'Выбрать объект', DE: 'Standort wahlen' },
  noSites: { TR: 'Site bulunamadi', EN: 'No sites found', RU: 'Объекты не найдены', DE: 'Keine Standorte' },
  welcome: { TR: 'Hos Geldiniz', EN: 'Welcome', RU: 'Добро пожаловать', DE: 'Willkommen' },
  languageSettings: { TR: 'Dil Ayarlari', EN: 'Language Settings', RU: 'Настройки языка', DE: 'Spracheinstellungen' },
  selectLanguage: { TR: 'Dil Secin', EN: 'Select Language', RU: 'Выберите язык', DE: 'Sprache wahlen' },
  languageUpdated: { TR: 'Dil guncellendi', EN: 'Language updated', RU: 'Язык обновлен', DE: 'Sprache aktualisiert' },
  budgetVsActual: { TR: 'Butce vs Gercek', EN: 'Budget vs Actual', RU: 'Бюджет и факт', DE: 'Budget vs Ist' },
  monthlyIncomeExpenses: { TR: 'Aylik Gelir/Gider', EN: 'Monthly Income/Expenses', RU: 'Доходы/Расходы', DE: 'Einnahmen/Ausgaben' },
  import: { TR: 'Iceri Aktar', EN: 'Import', RU: 'Импорт', DE: 'Importieren' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  updateLanguageInDB: (lang: Language) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>('EN');

  useEffect(() => {
    const savedLang = localStorage.getItem('app_language') as Language;
    if (savedLang && ['TR', 'EN', 'RU', 'DE'].includes(savedLang)) {
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

    if (data?.language && ['TR', 'EN', 'RU', 'DE'].includes(data.language)) {
      setLanguageState(data.language as Language);
      localStorage.setItem('app_language', data.language);
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
    const translation = translations[key];
    if (!translation) return key;
    return translation[language] || translation.EN || key;
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
