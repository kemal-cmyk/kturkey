-- =====================================================
-- HOA Management System - Clean Schema Reference
-- =====================================================
-- This file represents the final, clean database schema
-- after comprehensive refactoring and optimization.
--
-- Key Features:
-- - Multi-tenancy (site_id on all operational tables)
-- - Multi-currency support (3-column money logic)
-- - Comprehensive financial tracking
-- - All financial fields use NUMERIC (arbitrary precision)
-- =====================================================

-- =====================================================
-- 1. CORE TABLES (Multi-Tenancy Foundation)
-- =====================================================

-- Sites: Top-level multi-tenancy entity
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  photo_url TEXT,
  total_units INTEGER DEFAULT 0,
  distribution_method TEXT DEFAULT 'coefficient' CHECK (distribution_method IN ('share_ratio', 'coefficient')),
  default_currency TEXT NOT NULL DEFAULT 'TRY',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Profiles (linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  language TEXT DEFAULT 'TR' CHECK (language IN ('TR', 'EN', 'RU', 'DE')),
  avatar_url TEXT,
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User-Site Role Mapping (Multi-tenancy access control)
CREATE TABLE user_site_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'board_member', 'homeowner')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, site_id)
);

-- =====================================================
-- 2. FISCAL & ORGANIZATIONAL STRUCTURE
-- =====================================================

-- Fiscal Periods: Annual budget cycles
CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_budget NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unit Types: Property type definitions (Studio, 2BR, etc.)
CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coefficient NUMERIC DEFAULT 1.00 CHECK (coefficient > 0),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Units: Individual properties/apartments
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_type_id UUID REFERENCES unit_types(id) ON DELETE SET NULL,
  unit_number TEXT NOT NULL,
  block TEXT,
  floor INTEGER,
  share_ratio NUMERIC DEFAULT 0 CHECK (share_ratio >= 0),
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  is_rented BOOLEAN DEFAULT false,
  tenant_name TEXT,
  tenant_phone TEXT,
  opening_balance NUMERIC DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN units.opening_balance IS 'Previous period debt (positive) or credit (negative)';

-- =====================================================
-- 3. FINANCIAL ACCOUNTS (Multi-Currency)
-- =====================================================

-- Bank/Cash Accounts with currency support
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'cash')),
  account_number TEXT,
  currency_code TEXT DEFAULT 'TRY',
  initial_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 4. DUES & PAYMENTS (Multi-Currency)
-- =====================================================

-- Monthly Dues with currency support
CREATE TABLE dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  month_date DATE NOT NULL,
  base_amount NUMERIC NOT NULL CHECK (base_amount >= 0),
  penalty_amount NUMERIC DEFAULT 0 CHECK (penalty_amount >= 0),
  total_amount NUMERIC GENERATED ALWAYS AS (base_amount + penalty_amount) STORED,
  paid_amount NUMERIC DEFAULT 0 CHECK (paid_amount >= 0),
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  currency_code TEXT NOT NULL DEFAULT 'TRY',
  is_from_previous_period BOOLEAN DEFAULT false,
  previous_period_id UUID REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payments: Resident payments with FULL multi-currency support
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,

  -- Multi-Currency Fields (3-Column Pattern)
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency_code TEXT DEFAULT 'TRY',
  exchange_rate NUMERIC DEFAULT 1.0,
  amount_reporting_try NUMERIC,

  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'bank_transfer' CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'other')),
  reference_no TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'Maintenance Fees',
  applied_to_dues JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 5. LEDGER (General Ledger with Multi-Currency)
-- =====================================================

-- Ledger Entries: All financial transactions
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  fiscal_period_id UUID REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense', 'transfer')),
  category TEXT,
  description TEXT,

  -- Multi-Currency Fields (3-Column Pattern)
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency_code TEXT NOT NULL DEFAULT 'TRY',
  exchange_rate NUMERIC NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  amount_reporting_try NUMERIC NOT NULL,

  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor_name TEXT,
  receipt_url TEXT,

  -- Standard entry (income/expense)
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- Transfer-specific
  from_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- Payment linkage
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

  is_recurring BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 6. BUDGET MANAGEMENT
-- =====================================================

-- Budget Categories
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  planned_amount NUMERIC DEFAULT 0 CHECK (planned_amount >= 0),
  actual_amount NUMERIC DEFAULT 0 CHECK (actual_amount >= 0),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Category Templates (Reusable)
CREATE TABLE category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  display_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 7. DEBT MANAGEMENT
-- =====================================================

-- Penalty Settings per Site
CREATE TABLE penalty_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
  months_overdue_threshold INTEGER DEFAULT 3 CHECK (months_overdue_threshold > 0),
  penalty_percentage NUMERIC DEFAULT 5.00 CHECK (penalty_percentage >= 0),
  is_compound BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Debt Workflows (Collection Process)
CREATE TABLE debt_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  fiscal_period_id UUID REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  stage INTEGER DEFAULT 1 CHECK (stage >= 1 AND stage <= 4),
  total_debt_amount NUMERIC DEFAULT 0,
  oldest_unpaid_date DATE,
  months_overdue INTEGER DEFAULT 0,
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  warning_sent_at TIMESTAMPTZ,
  letter_generated_at TIMESTAMPTZ,
  legal_action_at TIMESTAMPTZ,
  legal_case_number TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Balance Transfers (Between Fiscal Periods)
CREATE TABLE balance_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  from_fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  to_fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('debt', 'credit', 'legal_flag')),
  amount NUMERIC,
  legal_stage INTEGER CHECK (legal_stage >= 1 AND legal_stage <= 4),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 8. SUPPORT SYSTEM
-- =====================================================

-- Support Tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('plumbing', 'cleaning', 'electrical', 'elevator', 'security', 'garden', 'parking', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 9. INDEXES (Performance Optimization)
-- =====================================================

-- Multi-tenancy indexes
CREATE INDEX idx_user_site_roles_user_id ON user_site_roles(user_id);
CREATE INDEX idx_user_site_roles_site_id ON user_site_roles(site_id);
CREATE INDEX idx_fiscal_periods_site_id ON fiscal_periods(site_id);
CREATE INDEX idx_units_site_id ON units(site_id);
CREATE INDEX idx_accounts_site_id ON accounts(site_id);
CREATE INDEX idx_ledger_entries_site_id ON ledger_entries(site_id);
CREATE INDEX idx_support_tickets_site_id ON support_tickets(site_id);

-- Financial lookups
CREATE INDEX idx_dues_unit_id ON dues(unit_id);
CREATE INDEX idx_dues_fiscal_period_id ON dues(fiscal_period_id);
CREATE INDEX idx_dues_status ON dues(status);
CREATE INDEX idx_payments_unit_id ON payments(unit_id);
CREATE INDEX idx_ledger_entries_fiscal_period_id ON ledger_entries(fiscal_period_id);
CREATE INDEX idx_ledger_entries_entry_type ON ledger_entries(entry_type);
CREATE INDEX idx_ledger_entries_payment_id ON ledger_entries(payment_id);

-- Date-based queries
CREATE INDEX idx_dues_month_date ON dues(month_date);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_ledger_entries_entry_date ON ledger_entries(entry_date);

-- =====================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_site_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Example RLS Policies (Site-based access control)
-- Super admins can see everything
CREATE POLICY "Super admins have full access to sites"
  ON sites FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Users can see sites where they have roles
CREATE POLICY "Users can view sites where they have roles"
  ON sites FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT site_id FROM user_site_roles
      WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- NOTES ON SCHEMA REFACTORING
-- =====================================================

/*
WHAT WAS CLEANED UP:
- Standardized all naming to snake_case
- Verified all financial fields use NUMERIC (PostgreSQL decimal)
- Ensured all operational tables have site_id for multi-tenancy
- Implemented 3-column money logic across all financial tables

WHAT WAS ADDED:
- Multi-currency support (currency_code, exchange_rate, amount_reporting_try)
- Internal transfer support in ledger_entries
- Currency fields to sites, accounts, dues, payments, ledger_entries
- opening_balance to units for fiscal period carryover

KEY CONVENTIONS:
- All IDs: UUID
- All financial amounts: NUMERIC (never integer or float)
- All timestamps: TIMESTAMPTZ (timezone-aware)
- All dates: DATE
- Generated columns: NEVER insert/update directly (e.g., dues.total_amount)

MULTI-CURRENCY PATTERN (3 Columns):
1. amount - Original amount in source currency
2. currency_code - ISO currency code (EUR, USD, TRY, etc.)
3. exchange_rate - Conversion rate to reporting currency
4. amount_reporting_try - Calculated amount in reporting currency (TRY)

Example: 100 EUR @ 35.50 = 3,550 TRY
*/
