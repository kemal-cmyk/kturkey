/*
  # Create App Translations Table for Dynamic Multi-Language Support

  1. New Tables
    - `app_translations`
      - `key` (text, primary key) - Translation key identifier
      - `en` (text) - English translation
      - `tr` (text) - Turkish translation
      - `ru` (text) - Russian translation
      - `de` (text) - German translation
      - `nl` (text) - Dutch translation
      - `fa` (text) - Persian/Farsi translation (RTL support)
      - `no` (text) - Norwegian translation
      - `sv` (text) - Swedish translation
      - `fi` (text) - Finnish translation
      - `da` (text) - Danish translation
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `app_translations` table
    - All authenticated users can read translations
    - Only super admins can insert, update, or delete translations

  3. Initial Data
    - Seed with existing translation keys from the application
*/

-- Create app_translations table
CREATE TABLE IF NOT EXISTS app_translations (
  key text PRIMARY KEY,
  en text DEFAULT '',
  tr text DEFAULT '',
  ru text DEFAULT '',
  de text DEFAULT '',
  nl text DEFAULT '',
  fa text DEFAULT '',
  no text DEFAULT '',
  sv text DEFAULT '',
  fi text DEFAULT '',
  da text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE app_translations ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read translations
CREATE POLICY "Anyone can read translations"
  ON app_translations
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only super admins can insert translations
CREATE POLICY "Super admins can insert translations"
  ON app_translations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only super admins can update translations
CREATE POLICY "Super admins can update translations"
  ON app_translations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only super admins can delete translations
CREATE POLICY "Super admins can delete translations"
  ON app_translations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_app_translations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_translations_updated_at
  BEFORE UPDATE ON app_translations
  FOR EACH ROW
  EXECUTE FUNCTION update_app_translations_updated_at();

-- Seed initial translations
INSERT INTO app_translations (key, en, tr, ru, de, nl, fa, no, sv, fi, da) VALUES
  ('dashboard', 'Dashboard', 'Panel', 'Панель', 'Instrumententafel', 'Dashboard', 'داشبورد', 'Dashboard', 'Instrumentbräda', 'Hallintapaneeli', 'Dashboard'),
  ('units', 'Units', 'Birimler', 'Единицы', 'Einheiten', 'Eenheden', 'واحدها', 'Enheter', 'Enheter', 'Yksiköt', 'Enheder'),
  ('residents', 'Residents', 'Sakinler', 'Жители', 'Bewohner', 'Bewoners', 'ساکنین', 'Beboere', 'Boende', 'Asukkaat', 'Beboere'),
  ('budget', 'Budget', 'Bütçe', 'Бюджет', 'Budget', 'Budget', 'بودجه', 'Budsjett', 'Budget', 'Budjetti', 'Budget'),
  ('reports', 'Reports', 'Raporlar', 'Отчеты', 'Berichte', 'Rapporten', 'گزارش‌ها', 'Rapporter', 'Rapporter', 'Raportit', 'Rapporter'),
  ('tickets', 'Support Tickets', 'Destek Biletleri', 'Билеты поддержки', 'Support-Tickets', 'Ondersteuningstickets', 'تیکت‌های پشتیبانی', 'Støttebilletter', 'Supportärenden', 'Tukiliput', 'Supportbilletter'),
  ('financial', 'Financial', 'Finansal', 'Финансы', 'Finanzen', 'Financieel', 'مالی', 'Økonomi', 'Ekonomi', 'Talous', 'Finansiel'),
  ('settings', 'Settings', 'Ayarlar', 'Настройки', 'Einstellungen', 'Instellingen', 'تنظیمات', 'Innstillinger', 'Inställningar', 'Asetukset', 'Indstillinger'),
  ('logout', 'Sign Out', 'Çıkış Yap', 'Выйти', 'Abmelden', 'Uitloggen', 'خروج', 'Logg ut', 'Logga ut', 'Kirjaudu ulos', 'Log ud'),
  ('welcome', 'Welcome', 'Hoşgeldiniz', 'Добро пожаловать', 'Willkommen', 'Welkom', 'خوش آمدید', 'Velkommen', 'Välkommen', 'Tervetuloa', 'Velkommen'),
  ('selectSite', 'Select Site', 'Site Seçin', 'Выберите объект', 'Standort wählen', 'Selecteer locatie', 'انتخاب سایت', 'Velg sted', 'Välj plats', 'Valitse kohde', 'Vælg sted'),
  ('language', 'Language', 'Dil', 'Язык', 'Sprache', 'Taal', 'زبان', 'Språk', 'Språk', 'Kieli', 'Sprog'),
  ('languageSettings', 'Language Settings', 'Dil Ayarları', 'Настройки языка', 'Spracheinstellungen', 'Taalinstellingen', 'تنظیمات زبان', 'Språkinnstillinger', 'Språkinställningar', 'Kieliasetukset', 'Sprogindstillinger'),
  ('selectLanguage', 'Select Your Language', 'Dilinizi Seçin', 'Выберите свой язык', 'Wählen Sie Ihre Sprache', 'Selecteer uw taal', 'زبان خود را انتخاب کنید', 'Velg ditt språk', 'Välj ditt språk', 'Valitse kielesi', 'Vælg dit sprog'),
  ('english', 'English', 'İngilizce', 'Английский', 'Englisch', 'Engels', 'انگلیسی', 'Engelsk', 'Engelska', 'Englanti', 'Engelsk'),
  ('turkish', 'Turkish', 'Türkçe', 'Турецкий', 'Türkisch', 'Turks', 'ترکی', 'Tyrkisk', 'Turkiska', 'Turkki', 'Tyrkisk'),
  ('german', 'German', 'Almanca', 'Немецкий', 'Deutsch', 'Duits', 'آلمانی', 'Tysk', 'Tyska', 'Saksa', 'Tysk'),
  ('russian', 'Russian', 'Rusça', 'Русский', 'Russisch', 'Russisch', 'روسی', 'Russisk', 'Ryska', 'Venäjä', 'Russisk'),
  ('dutch', 'Dutch', 'Flemenkçe', 'Голландский', 'Niederländisch', 'Nederlands', 'هلندی', 'Nederlandsk', 'Holländska', 'Hollanti', 'Hollandsk'),
  ('persian', 'Persian', 'Farsça', 'Персидский', 'Persisch', 'Perzisch', 'فارسی', 'Persisk', 'Persiska', 'Persia', 'Persisk'),
  ('norwegian', 'Norwegian', 'Norveççe', 'Норвежский', 'Norwegisch', 'Noors', 'نروژی', 'Norsk', 'Norska', 'Norja', 'Norsk'),
  ('swedish', 'Swedish', 'İsveççe', 'Шведский', 'Schwedisch', 'Zweeds', 'سوئدی', 'Svensk', 'Svenska', 'Ruotsi', 'Svensk'),
  ('finnish', 'Finnish', 'Fince', 'Финский', 'Finnisch', 'Fins', 'فنلاندی', 'Finsk', 'Finska', 'Suomi', 'Finsk'),
  ('danish', 'Danish', 'Danca', 'Датский', 'Dänisch', 'Deens', 'دانمارکی', 'Dansk', 'Danska', 'Tanska', 'Dansk'),
  ('userManagement', 'User Management', 'Kullanıcı Yönetimi', 'Управление пользователями', 'Benutzerverwaltung', 'Gebruikersbeheer', 'مدیریت کاربران', 'Brukeradministrasjon', 'Användarhantering', 'Käyttäjähallinta', 'Brugerstyring'),
  ('myAccount', 'My Account', 'Hesabım', 'Мой аккаунт', 'Mein Konto', 'Mijn account', 'حساب من', 'Min konto', 'Mitt konto', 'Tilini', 'Min konto'),
  ('fiscalPeriods', 'Fiscal Periods', 'Mali Dönemler', 'Финансовые периоды', 'Geschäftszeiträume', 'Fiscale perioden', 'دوره‌های مالی', 'Regnskapsperioder', 'Räkenskapsperioder', 'Tilikaudet', 'Regnskabsperioder'),
  ('debtTracking', 'Debt Tracking', 'Borç Takibi', 'Отслеживание задолженности', 'Schuldenvergleich', 'Schuldbeheer', 'پیگیری بدهی', 'Gjeldssporing', 'Skuldspårning', 'Velkaseuranta', 'Gældssporing'),
  ('ledger', 'Ledger', 'Defter', 'Журнал', 'Kontoauszug', 'Grootboek', 'دفتر کل', 'Hovedbok', 'Huvudbok', 'Pääkirja', 'Hovedbog'),
  ('monthlyIncomeExpenses', 'Monthly Income & Expenses', 'Aylık Gelir ve Giderler', 'Ежемесячные доходы и расходы', 'Monatliche Einnahmen und Ausgaben', 'Maandelijkse inkomsten en uitgaven', 'درآمد و هزینه ماهانه', 'Månedlige inntekter og utgifter', 'Månatliga intäkter och utgifter', 'Kuukausitulot ja -menot', 'Månedlige indtægter og udgifter'),
  ('budgetVsActual', 'Budget vs Actual', 'Bütçe vs Gerçek', 'Бюджет vs Реально', 'Budget vs. Actual', 'Budget vs werkelijk', 'بودجه در مقابل واقعی', 'Budsjett vs faktisk', 'Budget vs faktiskt', 'Budjetti vs toteutunut', 'Budget vs faktisk'),
  ('importLedger', 'Import Ledger', 'Defteri İçe Aktar', 'Импорт журнала', 'Kontoauszug importieren', 'Grootboek importeren', 'وارد کردن دفتر کل', 'Importer hovedbok', 'Importera huvudbok', 'Tuo pääkirja', 'Importer hovedbog'),
  ('onboarding', 'Onboarding', 'Onboarding', 'Начало работы', 'Onboarding', 'Onboarding', 'راه‌اندازی اولیه', 'Onboarding', 'Onboarding', 'Käyttöönotto', 'Onboarding'),
  ('siteWizard', 'Site Wizard', 'Site Sihirbazı', 'Мастер сайтов', 'Standort-Assistent', 'Site-wizard', 'راهنمای سایت', 'Nettstedsveiviser', 'Platsguide', 'Kohteen ohjattu toiminto', 'Stedguide'),
  ('language_changed_success', 'Language updated successfully', 'Dil başarıyla güncellendi', 'Язык успешно обновлен', 'Sprache erfolgreich aktualisiert', 'Taal succesvol bijgewerkt', 'زبان با موفقیت به‌روزرسانی شد', 'Språk oppdatert', 'Språk uppdaterat', 'Kieli päivitetty', 'Sprog opdateret')
ON CONFLICT (key) DO NOTHING;
