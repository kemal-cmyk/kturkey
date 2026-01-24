export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  language: 'TR' | 'EN' | 'RU' | 'DE';
  avatar_url: string | null;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  photo_url: string | null;
  total_units: number;
  distribution_method: 'share_ratio' | 'coefficient';
  default_currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSiteRole {
  id: string;
  user_id: string;
  site_id: string;
  role: 'admin' | 'board_member' | 'homeowner';
  created_at: string;
}

export interface FiscalPeriod {
  id: string;
  site_id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  status: 'draft' | 'active' | 'closed';
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnitType {
  id: string;
  site_id: string;
  name: string;
  coefficient: number;
  description: string | null;
  created_at: string;
}

export interface Unit {
  id: string;
  site_id: string;
  unit_type_id: string | null;
  unit_number: string;
  block: string | null;
  floor: number | null;
  share_ratio: number;
  opening_balance: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  is_rented: boolean;
  tenant_name: string | null;
  tenant_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  unit_type?: UnitType;
}

export interface CategoryTemplate {
  id: string;
  name: string;
  type: 'income' | 'expense';
  display_order: number;
  is_default: boolean;
  created_at: string;
}

export interface BudgetCategory {
  id: string;
  fiscal_period_id: string;
  category_name: string;
  planned_amount: number;
  actual_amount: number;
  display_order: number;
  created_at: string;
}

export interface Due {
  id: string;
  unit_id: string;
  fiscal_period_id: string;
  month_date: string;
  base_amount: number;
  penalty_amount: number;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  is_from_previous_period: boolean;
  previous_period_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  unit_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'bank_transfer' | 'credit_card' | 'other';
  reference_no: string | null;
  applied_to_dues: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  site_id: string;
  fiscal_period_id: string | null;
  entry_type: 'income' | 'expense' | 'transfer';
  category: string | null;
  description: string | null;
  amount: number;
  currency_code: string;
  exchange_rate: number;
  amount_reporting_try: number;
  entry_date: string;
  vendor_name: string | null;
  receipt_url: string | null;
  is_recurring: boolean;
  account_id: string | null;
  payment_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtWorkflow {
  id: string;
  unit_id: string;
  fiscal_period_id: string | null;
  stage: 1 | 2 | 3 | 4;
  total_debt_amount: number;
  oldest_unpaid_date: string | null;
  months_overdue: number;
  stage_changed_at: string;
  warning_sent_at: string | null;
  letter_generated_at: string | null;
  legal_action_at: string | null;
  legal_case_number: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  unit?: Unit;
}

export interface BalanceTransfer {
  id: string;
  unit_id: string;
  from_fiscal_period_id: string;
  to_fiscal_period_id: string;
  transfer_type: 'debt' | 'credit' | 'legal_flag';
  amount: number | null;
  legal_stage: number | null;
  description: string | null;
  created_at: string;
}

export interface PenaltySettings {
  id: string;
  site_id: string;
  months_overdue_threshold: number;
  penalty_percentage: number;
  is_compound: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  unit_id: string | null;
  site_id: string;
  category: 'plumbing' | 'cleaning' | 'electrical' | 'elevator' | 'security' | 'garden' | 'parking' | 'other';
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteFinancialSummary {
  site_id: string;
  site_name: string;
  fiscal_period_id: string;
  fiscal_period_name: string;
  period_status: string;
  total_budget: number;
  planned_expenses: number;
  actual_expenses: number;
  total_dues_generated: number;
  total_collected: number;
  collection_rate: number;
  budget_utilization: number;
  total_units: number;
  units_in_warning: number;
  units_in_legal: number;
}

export interface DebtAlert {
  workflow_id: string;
  unit_id: string;
  unit_number: string;
  block: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  site_id: string;
  site_name: string;
  stage: number;
  stage_name: string;
  total_debt_amount: number;
  months_overdue: number;
  oldest_unpaid_date: string | null;
  stage_changed_at: string;
  warning_sent_at: string | null;
  letter_generated_at: string | null;
  legal_action_at: string | null;
  legal_case_number: string | null;
}

export interface UnitBalance {
  unit_id: string;
  unit_number: string;
  block: string | null;
  opening_balance: number;
  total_maintenance_fees: number;
  current_balance: number;
  site_id: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  site_id: string;
  account_name: string;
  account_type: 'bank' | 'cash';
  account_number: string | null;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
