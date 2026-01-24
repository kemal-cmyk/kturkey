export const THEME = {
  primaryBlue: '#002561',
  primaryBlueLight: '#003380',
  primaryBlueDark: '#001a47',
  accent: '#0066cc',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
} as const;

export const DEBT_STAGES = {
  1: { name: 'Standard', color: 'bg-gray-100 text-gray-800', description: '0-3 months overdue' },
  2: { name: 'Warning', color: 'bg-yellow-100 text-yellow-800', description: '3+ months overdue' },
  3: { name: 'Letter Sent', color: 'bg-orange-100 text-orange-800', description: 'Warning letter issued' },
  4: { name: 'Legal Action', color: 'bg-red-100 text-red-800', description: 'Icra proceedings' },
} as const;

export const TICKET_CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'elevator', label: 'Elevator' },
  { value: 'security', label: 'Security' },
  { value: 'garden', label: 'Garden' },
  { value: 'parking', label: 'Parking' },
  { value: 'other', label: 'Other' },
] as const;

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'other', label: 'Other' },
] as const;

export const LANGUAGES = [
  { value: 'TR', label: 'Turkce' },
  { value: 'EN', label: 'English' },
  { value: 'RU', label: 'Russian' },
  { value: 'DE', label: 'Deutsch' },
] as const;

export const INCOME_CATEGORIES = [
  'Maintenance Fees',
  'Extra Fees',
  'Uncollected Fees from Previous Term',
  'Prepayments from Previous Term',
  'Exchange Rate Incomes',
  'Insurance Refunds',
  'Other Incomes',
] as const;

export const EXPENSE_CATEGORIES = [
  'Staff Salary',
  'Staff Social Insurance',
  'Chartered Accountant Fee',
  'Official Expenses',
  'Communal Electric Payments',
  'Communal Water Payments',
  'Pool Chemicals',
  'Pool Maintenance',
  'Elevator Control',
  'Elevator Repairs',
  'Elevator TSE Inspection',
  'Elevator Safety Label Cost',
  'Cleaning Expenses',
  'Garden Expenses',
  'Building Maintenance & Repairs',
  'Generator Fuel',
  'Generator Maintenance',
  'Communal Area Insurance',
  'New Fixtures',
  'Management Company Fee',
  'Other Expenses',
  'Communal Internet Fee',
  'Deficit From Last Period',
] as const;
