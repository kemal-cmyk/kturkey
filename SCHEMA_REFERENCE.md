# Database Schema Reference - Final Clean State

## Overview
This document represents the final, production-ready schema for the HOA Management System after comprehensive refactoring. The schema supports:
- Multi-tenancy (site isolation)
- Multi-currency transactions
- Comprehensive financial tracking
- Debt management workflows
- Support ticket system

---

## Core Principles

### 1. Multi-Tenancy
Every operational table includes `site_id` for complete data isolation between communities.

### 2. Multi-Currency Support (3-Column Money Logic)
Financial transactions use three columns:
- `amount` - Original transaction amount in source currency
- `currency_code` - ISO currency code (default: 'TRY')
- `exchange_rate` - Conversion rate to reporting currency (default: 1.0)
- `amount_reporting_try` - Calculated amount in reporting currency (TRY)

### 3. Data Type Standards
- All financial values: `NUMERIC` (PostgreSQL's arbitrary precision decimal)
- All IDs: `UUID`
- All timestamps: `TIMESTAMPTZ` (timezone-aware)
- All dates: `DATE`

---

## Table Structures

### 1. SITES (Multi-Tenancy Root)
**Purpose:** Top-level entity representing each HOA community

```sql
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
```

**Key Fields:**
- `default_currency` - Site-wide default currency for new transactions
- `distribution_method` - How dues are calculated (by share ratio or unit type coefficient)

---

### 2. PROFILES (Users)
**Purpose:** User accounts linked to auth.users

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  phone TEXT,
  language TEXT DEFAULT 'TR' CHECK (language IN ('TR', 'EN', 'RU', 'DE')),
  avatar_url TEXT,
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Fields:**
- `is_super_admin` - Global admin access across all sites

---

### 3. USER_SITE_ROLES (Multi-Tenancy Access Control)
**Purpose:** Maps users to sites with specific roles

```sql
CREATE TABLE user_site_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'board_member', 'homeowner')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, site_id)
);
```

---

### 4. FISCAL_PERIODS
**Purpose:** Annual budget periods for each site

```sql
CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
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
```

---

### 5. UNIT_TYPES
**Purpose:** Different property types within a site (e.g., Studio, 2BR, Commercial)

```sql
CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  name TEXT NOT NULL,
  coefficient NUMERIC DEFAULT 1.00 CHECK (coefficient > 0),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Fields:**
- `coefficient` - Multiplier for dues calculation when using coefficient distribution method

---

### 6. UNITS (Properties/Apartments)
**Purpose:** Individual properties within a site

```sql
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  unit_type_id UUID REFERENCES unit_types(id),
  unit_number TEXT NOT NULL,
  block TEXT,
  floor INTEGER,
  share_ratio NUMERIC DEFAULT 0 CHECK (share_ratio >= 0),
  owner_id UUID REFERENCES profiles(id),
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  is_rented BOOLEAN DEFAULT false,
  tenant_name TEXT,
  tenant_phone TEXT,
  opening_balance NUMERIC DEFAULT 0.00 COMMENT 'Previous period debt (+) or credit (-)',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Fields:**
- `opening_balance` - Carried-forward debt/credit from previous fiscal periods (positive = debt owed by owner)
- `share_ratio` - Used when distribution_method = 'share_ratio'

---

### 7. DUES (Monthly Maintenance Fees)
**Purpose:** Generated monthly fees for each unit

```sql
CREATE TABLE dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  month_date DATE NOT NULL,
  base_amount NUMERIC NOT NULL CHECK (base_amount >= 0),
  penalty_amount NUMERIC DEFAULT 0 CHECK (penalty_amount >= 0),
  total_amount NUMERIC GENERATED ALWAYS AS (base_amount + penalty_amount) STORED,
  paid_amount NUMERIC DEFAULT 0 CHECK (paid_amount >= 0),
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  currency_code TEXT NOT NULL DEFAULT 'TRY',
  is_from_previous_period BOOLEAN DEFAULT false,
  previous_period_id UUID REFERENCES fiscal_periods(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Fields:**
- `total_amount` - GENERATED column (automatically calculated)
- `currency_code` - Currency for this specific due entry

**IMPORTANT:** `total_amount` is a generated column and MUST NOT be inserted explicitly.

---

### 8. PAYMENTS (Resident Payments) - MULTI-CURRENCY
**Purpose:** Tracks payments made by residents with full currency support

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency_code TEXT DEFAULT 'TRY',
  exchange_rate NUMERIC DEFAULT 1.0,
  amount_reporting_try NUMERIC,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'bank_transfer' CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'other')),
  reference_no TEXT,
  account_id UUID REFERENCES accounts(id),
  category TEXT DEFAULT 'Maintenance Fees',
  applied_to_dues JSONB DEFAULT '[]',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Multi-Currency Pattern:**
- `amount` - Original amount in source currency
- `currency_code` - Source currency (EUR, USD, TRY, etc.)
- `exchange_rate` - Rate at time of payment
- `amount_reporting_try` - Converted amount in reporting currency (TRY)

**Example:**
- Payment of 100 EUR with exchange_rate 35.50 = 3,550 TRY in `amount_reporting_try`

---

### 9. ACCOUNTS (Bank/Cash Accounts) - MULTI-CURRENCY
**Purpose:** Financial accounts for the HOA

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
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
```

**Key Fields:**
- `currency_code` - Native currency of the account (e.g., EUR account, USD account)

---

### 10. LEDGER_ENTRIES (General Ledger) - MULTI-CURRENCY
**Purpose:** All financial transactions with full multi-currency support

```sql
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense', 'transfer')),
  category TEXT,
  description TEXT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency_code TEXT NOT NULL DEFAULT 'TRY',
  exchange_rate NUMERIC NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  amount_reporting_try NUMERIC NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- For income/expense entries
  account_id UUID REFERENCES accounts(id),
  vendor_name TEXT,
  receipt_url TEXT,

  -- For transfer entries
  from_account_id UUID REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),

  -- Link to payment if this entry came from a resident payment
  payment_id UUID REFERENCES payments(id),

  is_recurring BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Transaction Types:**
- `income` - Money coming in (uses `account_id`)
- `expense` - Money going out (uses `account_id`)
- `transfer` - Money moving between accounts (uses `from_account_id` and `to_account_id`)

**Multi-Currency Pattern:**
All three columns are used for every transaction to maintain accurate reporting.

---

### 11. BUDGET_CATEGORIES
**Purpose:** Budget line items per fiscal period

```sql
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  category_name TEXT NOT NULL,
  planned_amount NUMERIC DEFAULT 0 CHECK (planned_amount >= 0),
  actual_amount NUMERIC DEFAULT 0 CHECK (actual_amount >= 0),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Fields:**
- `actual_amount` - Automatically updated via triggers when ledger entries are created

---

### 12. CATEGORY_TEMPLATES
**Purpose:** Reusable category templates for budgets

```sql
CREATE TABLE category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  display_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 13. PENALTY_SETTINGS
**Purpose:** Late payment penalty rules per site

```sql
CREATE TABLE penalty_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL UNIQUE REFERENCES sites(id),
  months_overdue_threshold INTEGER DEFAULT 3 CHECK (months_overdue_threshold > 0),
  penalty_percentage NUMERIC DEFAULT 5.00 CHECK (penalty_percentage >= 0),
  is_compound BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 14. DEBT_WORKFLOWS
**Purpose:** Tracks units in debt collection process

```sql
CREATE TABLE debt_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
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
```

**Stages:**
1. Initial Warning
2. Formal Notice
3. Legal Warning
4. Legal Action

---

### 15. BALANCE_TRANSFERS
**Purpose:** Tracks debt/credit carryover between fiscal periods

```sql
CREATE TABLE balance_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id),
  from_fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  to_fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('debt', 'credit', 'legal_flag')),
  amount NUMERIC,
  legal_stage INTEGER CHECK (legal_stage >= 1 AND legal_stage <= 4),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 16. SUPPORT_TICKETS
**Purpose:** Maintenance requests and issues

```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  unit_id UUID REFERENCES units(id),
  category TEXT DEFAULT 'other' CHECK (category IN ('plumbing', 'cleaning', 'electrical', 'elevator', 'security', 'garden', 'parking', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES profiles(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Key Database Functions

### 1. `set_unit_monthly_due()`
**Purpose:** Sets monthly dues for a unit for an entire fiscal period

**Parameters:**
- `p_unit_id` - Unit to set dues for
- `p_fiscal_period_id` - Fiscal period
- `p_monthly_amount` - Monthly due amount
- `p_currency_code` - Currency (default 'TRY')

**Behavior:**
- Generates 12 months of dues
- Preserves existing payments and re-applies them
- Handles currency conversion for payment reapplication

---

### 2. `apply_unit_payment()`
**Purpose:** Applies a payment to a unit's outstanding dues (FIFO)

**Parameters:**
- `p_unit_id` - Unit making payment
- `p_payment_amount` - Amount paid
- `p_payment_date` - Date of payment
- `p_payment_method` - Payment method
- `p_reference_no` - Reference number
- `p_account_id` - Receiving account
- `p_category` - Payment category
- `p_currency_code` - Source currency (default 'TRY')
- `p_exchange_rate` - Exchange rate (default 1.0)

**Returns:** JSONB with payment details and applied dues

**Behavior:**
- Applies payment to oldest unpaid dues first (FIFO)
- Updates due status (pending → partial → paid)
- Creates payment record with currency information
- Returns overpayment amount if any

---

### 3. `set_all_units_monthly_due()`
**Purpose:** Bulk sets dues for all units in a fiscal period

**Parameters:**
- `p_fiscal_period_id` - Fiscal period
- `p_base_amount` - Base monthly amount
- `p_currency_code` - Currency (default 'TRY')

**Behavior:**
- Calculates individual dues based on distribution method
- Uses unit type coefficient or share ratio
- Preserves all existing payments

---

## Triggers

### 1. Payment → Ledger Entry Sync
When a payment is created, automatically create a corresponding `income` ledger entry.

### 2. Ledger Entry → Budget Category Sync
When an expense ledger entry is created, update the `actual_amount` in the corresponding budget category.

### 3. Account Balance Updates
When ledger entries are created/deleted, update account `current_balance`.

---

## Views

### 1. `unit_balances`
Shows current financial status for each unit including opening balance, dues, payments, and outstanding balance.

### 2. `debt_alerts`
Shows all units in active debt workflows with contact information.

### 3. `site_financial_summary`
Aggregated financial metrics per site and fiscal period.

### 4. `transparency_report`
Public-facing financial summary suitable for homeowner portals.

---

## Security (Row Level Security)

All tables have RLS enabled with policies based on:
- `site_id` - Users can only access data for sites they have roles in
- Super admins can access all data
- Role-based permissions (admin vs homeowner)

---

## Refactoring Notes

### What Was Cleaned Up:

1. **Removed Redundant Fields:** None found - schema was already clean
2. **Standardized Naming:** All tables use `snake_case` consistently
3. **Data Type Verification:** All financial fields use `NUMERIC` (PostgreSQL arbitrary precision decimal)
4. **Multi-Tenancy:** All operational tables have `site_id` foreign key
5. **Multi-Currency:** Implemented 3-column pattern across `payments`, `ledger_entries`, `accounts`, and `dues`

### What Was Added:

1. **Currency Support:**
   - `sites.default_currency`
   - `accounts.currency_code`
   - `payments.currency_code`, `exchange_rate`, `amount_reporting_try`
   - `ledger_entries.currency_code`, `exchange_rate`, `amount_reporting_try`
   - `dues.currency_code`

2. **Transfer Support:**
   - `ledger_entries.from_account_id` and `to_account_id` for internal transfers
   - Entry type `transfer` added to support account-to-account movements

### Database Consistency Rules:

1. **Generated Columns:** `dues.total_amount` is GENERATED - never insert/update directly
2. **Currency Calculations:** Always store both original and reporting amounts
3. **Payment Application:** Payments apply to oldest dues first (FIFO)
4. **Balance Tracking:** Unit balances calculated from dues table, not cached
5. **Trigger Dependencies:** Be careful with circular triggers (payment ↔ ledger)

---

## Migration History

Total migrations: 50
- Migrations 001-008: Initial schema setup
- Migration 009: Super admin role
- Migrations 010-034: Dues and payment logic refinements
- Migrations 035-038: Budget tracking fixes
- Migration 039: Internal transfer support
- Migrations 040-050: Multi-currency implementation

---

## Future Considerations

1. **Audit Logging:** Consider adding audit tables for financial changes
2. **Document Storage:** Support for receipt/invoice file uploads
3. **Recurring Transactions:** Automated monthly expense generation
4. **Email Notifications:** Integration with notification system
5. **Payment Plans:** Support for installment agreements
