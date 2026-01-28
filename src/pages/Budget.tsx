import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Wallet, Plus, Loader2, Edit2, Check, X, TrendingUp,
  TrendingDown, AlertTriangle, Receipt, PieChart, ArrowRight,
  Sparkles, Target, DollarSign, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  PieChart as RechartsPie, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { FiscalPeriod, BudgetCategory, LedgerEntry } from '../types/database';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/constants';

interface Account {
  id: string;
  account_name: string;
  account_type: 'bank' | 'cash';
}

export default function Budget() {
  const { currentSite, currentRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<FiscalPeriod | null>(null);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [addingExpense, setAddingExpense] = useState<BudgetCategory | null>(null);

  const isAdmin = currentRole?.role === 'admin';

  useEffect(() => {
    if (currentSite) {
      fetchData();
    }
  }, [currentSite]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data: period } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('site_id', currentSite.id)
      .eq('status', 'active')
      .maybeSingle();

    setActivePeriod(period);

    if (period) {
      const { data: categories } = await supabase
        .from('budget_categories')
        .select('*')
        .eq('fiscal_period_id', period.id)
        .order('display_order');

      setBudgetCategories(categories || []);

      // ✅ FIX: Fetch ALL ledger entries for this period to calculate smart actuals
      const { data: ledgerData } = await supabase
        .from('ledger_entries')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('fiscal_period_id', period.id);

      setLedgerEntries(ledgerData || []);
    }

    const { data: accountsData } = await supabase
      .from('accounts')
      .select('id, account_name, account_type')
      .eq('site_id', currentSite.id)
      .eq('is_active', true);

    setAccounts(accountsData || []);
    setLoading(false);
  };

  // ✅ HELPER: Clean strings for matching (Consistent with other pages)
  const normalizeCategory = (str: string) => {
    return str.toLowerCase()
      .replace('communual', 'communal') // Fix common typo
      .replace(/payments?|payment/g, '') // Remove 'payment' words
      // KEEP 'fee' because 'Maintenance Fee' needs it
      .replace(/\s+/g, ' ')
      .trim();
  };

  // ✅ HELPER: Determine Income vs Expense
  const checkIsIncome = (name: string) => {
    const lower = name.toLowerCase().trim();
    const incomeKeywords = ['dues', 'aidat', 'revenue', 'interest', 'deposit', 'income'];
    if (incomeKeywords.some(k => lower.includes(k))) return true;
    if (lower.includes('maintenance') && lower.includes('fee')) return true;
    return false;
  };

  // ✅ HELPER: Calculate Actuals using Smart Matching
  const getSmartActual = (budgetCatName: string) => {
    const normBudget = normalizeCategory(budgetCatName);
    const isIncome = checkIsIncome(budgetCatName);

    return ledgerEntries
      .filter(e => {
        if (e.category === 'Transfer') return false;
        const normEntry = normalizeCategory(e.category);
        return normEntry === normBudget || normEntry.includes(normBudget) || normBudget.includes(normEntry);
      })
      .reduce((sum, e) => {
        const val = Number(e.amount_reporting_try || e.amount);
        // For Income: Add Income (+), Subtract Expense/Refunds (-)
        if (isIncome) return sum + (e.entry_type === 'income' ? val : -val);
        // For Expense: Add Expense (+), Subtract Income/Rebates (-)
        return sum + (e.entry_type === 'expense' ? val : -val);
      }, 0);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Filter Categories based on Smart Logic
  const incomeCategories = budgetCategories.filter(cat => checkIsIncome(cat.category_name));
  const expenseCategories = budgetCategories.filter(cat => !checkIsIncome(cat.category_name));

  // Calculate Totals using Smart Actuals
  const totalPlannedIncome = incomeCategories.reduce((sum, cat) => sum + Number(cat.planned_amount), 0);
  const totalActualIncome = incomeCategories.reduce((sum, cat) => sum + getSmartActual(cat.category_name), 0);

  const totalPlannedExpense = expenseCategories.reduce((sum, cat) => sum + Number(cat.planned_amount), 0);
  const totalActualExpense = expenseCategories.reduce((sum, cat) => sum + getSmartActual(cat.category_name), 0);

  const totalRemaining = totalPlannedExpense - totalActualExpense;
  const overallUtilization = totalPlannedExpense > 0 ? (totalActualExpense / totalPlannedExpense) * 100 : 0;

  const COLORS = ['#002561', '#0066cc', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#6366f1'];

  const pieData = expenseCategories
    .map((cat, idx) => ({
      name: cat.category_name,
      value: getSmartActual(cat.category_name),
      color: COLORS[idx % COLORS.length],
    }))
    .filter(d => d.value > 0);

  const barData = expenseCategories.map((cat, idx) => ({
    name: cat.category_name.length > 12 ? cat.category_name.slice(0, 12) + '...' : cat.category_name,
    fullName: cat.category_name,
    planned: Number(cat.planned_amount),
    spent: getSmartActual(cat.category_name),
    color: COLORS[idx % COLORS.length],
  }));

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  if (!activePeriod) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Financial Period</h2>
          <p className="text-gray-600 mb-6">Create a financial period first to start planning your budget.</p>
          {isAdmin && (
            <a
              href="/fiscal-periods"
              className="inline-flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
            >
              Go to Financial Periods
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget Planning</h1>
          <p className="text-gray-600">{activePeriod.name}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Budget Wizard
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expected Income</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPlannedIncome)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Collected: {formatCurrency(totalActualIncome)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <Target className="w-5 h-5 text-[#002561]" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expense Budget</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPlannedExpense)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Spent: {formatCurrency(totalActualExpense)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${totalRemaining >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <DollarSign className={`w-5 h-5 ${totalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Remaining Budget</p>
              <p className={`text-xl font-bold ${totalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalRemaining)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${overallUtilization > 100 ? 'bg-red-100' : overallUtilization > 80 ? 'bg-amber-100' : 'bg-green-100'}`}>
              <PieChart className={`w-5 h-5 ${overallUtilization > 100 ? 'text-red-600' : overallUtilization > 80 ? 'text-amber-600' : 'text-green-600'}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expense Utilization</p>
              <p className={`text-xl font-bold ${overallUtilization > 100 ? 'text-red-600' : overallUtilization > 80 ? 'text-amber-600' : 'text-green-600'}`}>
                {overallUtilization.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Budget Categories</h3>
              {isAdmin && (
                <button
                  onClick={() => setShowWizard(true)}
                  className="text-sm text-[#002561] hover:underline font-medium"
                >
                  + Add Category
                </button>
              )}
            </div>
          </div>

          {budgetCategories.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No budget categories set up yet</p>
              {isAdmin && (
                <button
                  onClick={() => setShowWizard(true)}
                  className="inline-flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Budget Wizard
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {budgetCategories.map((cat, idx) => {
                const actual = getSmartActual(cat.category_name);
                const utilization = cat.planned_amount > 0
                  ? (actual / cat.planned_amount) * 100
                  : 0;
                const isOverBudget = utilization > 100;
                const isWarning = utilization > 80 && utilization <= 100;

                return (
                  <div key={cat.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                        <span className="font-medium text-gray-900">{cat.category_name}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {formatCurrency(actual)} / {formatCurrency(cat.planned_amount)}
                          </p>
                          <p className={`text-xs ${isOverBudget ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-500'}`}>
                            {utilization.toFixed(1)}% used
                          </p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => setAddingExpense(cat)}
                              className="p-1.5 bg-[#002561] text-white rounded hover:bg-[#003380] transition-colors"
                              title="Add expense"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingCategory(cat)}
                              className="p-1.5 text-gray-400 hover:text-[#002561] hover:bg-gray-100 rounded transition-colors"
                              title="Edit budget"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOverBudget ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-[#002561]'
                        }`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                    {isOverBudget && (
                      <div className="flex items-center mt-2 text-xs text-red-600">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Over budget by {formatCurrency(actual - cat.planned_amount)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {pieData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Expense Distribution</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2 max-h-32 overflow-y-auto">
                {pieData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-gray-600 truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {expenseCategories.filter(c => {
             const actual = getSmartActual(c.category_name);
             const util = c.planned_amount > 0 ? (actual / c.planned_amount) * 100 : 0;
             return util > 80;
          }).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-900">Expense Budget Alerts</h4>
                  <ul className="mt-2 space-y-1 text-sm text-amber-700">
                    {expenseCategories.filter(c => {
                       const actual = getSmartActual(c.category_name);
                       const util = c.planned_amount > 0 ? (actual / c.planned_amount) * 100 : 0;
                       return util > 80;
                    }).map(cat => {
                      const actual = getSmartActual(cat.category_name);
                      const util = cat.planned_amount > 0 ? (actual / cat.planned_amount) * 100 : 0;
                      return (
                        <li key={cat.id}>
                          {cat.category_name}: {util.toFixed(0)}% used
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {barData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Expense Budget vs Actual Comparison</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name === 'planned' ? 'Planned' : 'Spent']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                />
                <Legend />
                <Bar dataKey="planned" name="Planned" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="Spent" fill="#002561" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showWizard && activePeriod && currentSite && (
        <BudgetWizard
          periodId={activePeriod.id}
          siteId={currentSite.id}
          existingCategories={budgetCategories}
          totalBudget={activePeriod.total_budget}
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false);
            fetchData();
          }}
        />
      )}

      {editingCategory && (
        <EditBudgetModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onUpdated={() => {
            setEditingCategory(null);
            fetchData();
          }}
        />
      )}

      {addingExpense && activePeriod && currentSite && user && (
        <AddExpenseModal
          category={addingExpense}
          period={activePeriod}
          siteId={currentSite.id}
          userId={user.id}
          accounts={accounts}
          onClose={() => setAddingExpense(null)}
          onAdded={() => {
            setAddingExpense(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ... SUB-COMPONENTS ...
// (These are unchanged, but included for completeness so you can copy the whole file safely)

interface BudgetWizardProps {
  periodId: string;
  siteId: string;
  existingCategories: BudgetCategory[];
  totalBudget: number;
  onClose: () => void;
  onComplete: () => void;
}

function BudgetWizard({
  periodId,
  siteId,
  existingCategories,
  totalBudget,
  onClose,
  onComplete,
}: BudgetWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    existingCategories.length > 0
      ? existingCategories.map(c => c.category_name)
      : EXPENSE_CATEGORIES.slice(0, 6) as unknown as string[]
  );
  const [customCategory, setCustomCategory] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    existingCategories.forEach(cat => {
      initial[cat.category_name] = cat.planned_amount;
    });
    return initial;
  });

  const expenseAllocations = Object.entries(allocations)
    .filter(([cat]) => !INCOME_CATEGORIES.includes(cat as typeof INCOME_CATEGORIES[number]))
    .reduce((sum, [, val]) => sum + (val || 0), 0);
  const remaining = totalBudget - expenseAllocations;

  const addCustomCategory = () => {
    if (customCategory.trim() && !selectedCategories.includes(customCategory.trim())) {
      setSelectedCategories([...selectedCategories, customCategory.trim()]);
      setCustomCategory('');
    }
  };

  const distributeEvenly = () => {
    const expenseCategories = selectedCategories.filter(cat =>
      !INCOME_CATEGORIES.includes(cat as typeof INCOME_CATEGORIES[number])
    );
    if (expenseCategories.length === 0) return;
    const perCategory = Math.floor(totalBudget / expenseCategories.length);
    const newAllocations: Record<string, number> = { ...allocations };
    expenseCategories.forEach(cat => {
      newAllocations[cat] = perCategory;
    });
    setAllocations(newAllocations);
  };

  const handleSave = async () => {
    setLoading(true);

    for (const existing of existingCategories) {
      if (!selectedCategories.includes(existing.category_name)) {
        await supabase
          .from('budget_categories')
          .delete()
          .eq('id', existing.id);
      }
    }

    for (let i = 0; i < selectedCategories.length; i++) {
      const catName = selectedCategories[i];
      const existing = existingCategories.find(c => c.category_name === catName);

      if (existing) {
        await supabase
          .from('budget_categories')
          .update({
            planned_amount: allocations[catName] || 0,
            display_order: i,
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('budget_categories')
          .insert({
            fiscal_period_id: periodId,
            category_name: catName,
            planned_amount: allocations[catName] || 0,
            actual_amount: 0,
            display_order: i,
          });
      }
    }

    setLoading(false);
    onComplete();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Budget Wizard</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-[#002561] text-white' : 'bg-gray-200 text-gray-500'}`}>
              1
            </div>
            <div className={`flex-1 h-1 rounded ${step >= 2 ? 'bg-[#002561]' : 'bg-gray-200'}`} />
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-[#002561] text-white' : 'bg-gray-200 text-gray-500'}`}>
              2
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Select Categories</span>
            <span>Allocate Budget</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <h4 className="font-medium text-gray-900">Income Categories</h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {INCOME_CATEGORIES.map(cat => (
                    <label
                      key={cat}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCategories.includes(cat)
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCategories([...selectedCategories, cat]);
                          } else {
                            setSelectedCategories(selectedCategories.filter(c => c !== cat));
                            const newAllocations = { ...allocations };
                            delete newAllocations[cat];
                            setAllocations(newAllocations);
                          }
                        }}
                        className="w-4 h-4 text-green-600 rounded"
                      />
                      <span className="ml-2 text-sm">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                  <h4 className="font-medium text-gray-900">Expense Categories</h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {EXPENSE_CATEGORIES.map(cat => (
                    <label
                      key={cat}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCategories.includes(cat)
                          ? 'border-[#002561] bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCategories([...selectedCategories, cat]);
                          } else {
                            setSelectedCategories(selectedCategories.filter(c => c !== cat));
                            const newAllocations = { ...allocations };
                            delete newAllocations[cat];
                            setAllocations(newAllocations);
                          }
                        }}
                        className="w-4 h-4 text-[#002561] rounded"
                      />
                      <span className="ml-2 text-sm">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              {selectedCategories.filter(c =>
                !EXPENSE_CATEGORIES.includes(c as typeof EXPENSE_CATEGORIES[number]) &&
                !INCOME_CATEGORIES.includes(c as typeof INCOME_CATEGORIES[number])
              ).length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Custom categories</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCategories
                      .filter(c =>
                        !EXPENSE_CATEGORIES.includes(c as typeof EXPENSE_CATEGORIES[number]) &&
                        !INCOME_CATEGORIES.includes(c as typeof INCOME_CATEGORIES[number])
                      )
                      .map(cat => (
                        <span
                          key={cat}
                          className="inline-flex items-center px-3 py-1 bg-blue-100 text-[#002561] rounded-full text-sm"
                        >
                          {cat}
                          <button
                            onClick={() => {
                              setSelectedCategories(selectedCategories.filter(c => c !== cat));
                              const newAllocations = { ...allocations };
                              delete newAllocations[cat];
                              setAllocations(newAllocations);
                            }}
                            className="ml-2 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Add custom category</h4>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomCategory()}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                    placeholder="Enter category name..."
                  />
                  <button
                    onClick={addCustomCategory}
                    disabled={!customCategory.trim()}
                    className="px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Expense Budget (for allocation)</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(totalBudget)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Remaining to Allocate</p>
                    <p className={`text-xl font-bold ${remaining < 0 ? 'text-red-600' : remaining === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                      {formatCurrency(remaining)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 italic">Income categories are tracked separately and don't affect budget allocation</p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={distributeEvenly}
                  className="text-sm text-[#002561] hover:underline font-medium"
                >
                  Distribute Expense Budget Evenly
                </button>
              </div>

              <div className="space-y-6">
                {selectedCategories.filter(cat => INCOME_CATEGORIES.includes(cat as typeof INCOME_CATEGORIES[number])).length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <h4 className="font-medium text-gray-900">Income Categories</h4>
                      </div>
                      <span className="text-xs text-gray-500 italic">(Tracked, not allocated)</span>
                    </div>
                    <div className="space-y-3">
                      {selectedCategories
                        .filter(cat => INCOME_CATEGORIES.includes(cat as typeof INCOME_CATEGORIES[number]))
                        .map(cat => (
                          <div key={cat} className="flex items-center space-x-4">
                            <span className="w-40 text-sm font-medium text-gray-700 truncate">{cat}</span>
                            <div className="flex-1">
                              <input
                                type="number"
                                value={allocations[cat] || ''}
                                onChange={(e) => setAllocations({ ...allocations, [cat]: Number(e.target.value) })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                placeholder="Expected amount"
                              />
                            </div>
                            <span className="w-24 text-sm text-green-600 text-right font-medium">
                              Expected
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {selectedCategories.filter(cat => EXPENSE_CATEGORIES.includes(cat as typeof EXPENSE_CATEGORIES[number])).length > 0 && (
                  <div>
                    <div className="flex items-center space-x-2 mb-3">
                      <TrendingDown className="w-5 h-5 text-red-600" />
                      <h4 className="font-medium text-gray-900">Expense Categories</h4>
                    </div>
                    <div className="space-y-3">
                      {selectedCategories
                        .filter(cat => EXPENSE_CATEGORIES.includes(cat as typeof EXPENSE_CATEGORIES[number]))
                        .map(cat => (
                          <div key={cat} className="flex items-center space-x-4">
                            <span className="w-40 text-sm font-medium text-gray-700 truncate">{cat}</span>
                            <div className="flex-1">
                              <input
                                type="number"
                                value={allocations[cat] || ''}
                                onChange={(e) => setAllocations({ ...allocations, [cat]: Number(e.target.value) })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                                placeholder="0"
                              />
                            </div>
                            <span className="w-24 text-sm text-gray-500 text-right">
                              {totalBudget > 0 ? ((allocations[cat] || 0) / totalBudget * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {selectedCategories.filter(cat =>
                  !INCOME_CATEGORIES.includes(cat as typeof INCOME_CATEGORIES[number]) &&
                  !EXPENSE_CATEGORIES.includes(cat as typeof EXPENSE_CATEGORIES[number])
                ).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Custom Categories</h4>
                    <div className="space-y-3">
                      {selectedCategories
                        .filter(cat =>
                          !INCOME_CATEGORIES.includes(cat as typeof INCOME_CATEGORIES[number]) &&
                          !EXPENSE_CATEGORIES.includes(cat as typeof EXPENSE_CATEGORIES[number])
                        )
                        .map(cat => (
                          <div key={cat} className="flex items-center space-x-4">
                            <span className="w-40 text-sm font-medium text-gray-700 truncate">{cat}</span>
                            <div className="flex-1">
                              <input
                                type="number"
                                value={allocations[cat] || ''}
                                onChange={(e) => setAllocations({ ...allocations, [cat]: Number(e.target.value) })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
                                placeholder="0"
                              />
                            </div>
                            <span className="w-24 text-sm text-gray-500 text-right">
                              {totalBudget > 0 ? ((allocations[cat] || 0) / totalBudget * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {remaining < 0 && (
                <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  You have allocated more than the total budget
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-between">
          {step === 1 ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={selectedCategories.length === 0}
                className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Check className="w-4 h-4 mr-2" />
                Save Budget
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditBudgetModalProps {
  category: BudgetCategory;
  onClose: () => void;
  onUpdated: () => void;
}

function EditBudgetModal({ category, onClose, onUpdated }: EditBudgetModalProps) {
  const [loading, setLoading] = useState(false);
  const [plannedAmount, setPlannedAmount] = useState(category.planned_amount);

  const handleUpdate = async () => {
    setLoading(true);

    await supabase
      .from('budget_categories')
      .update({ planned_amount: plannedAmount })
      .eq('id', category.id);

    setLoading(false);
    onUpdated();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const utilization = plannedAmount > 0 ? (category.actual_amount / plannedAmount) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Edit Budget</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category
            </label>
            <p className="text-gray-900 font-medium">{category.category_name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Planned Budget (TRY)
            </label>
            <input
              type="number"
              value={plannedAmount || ''}
              onChange={(e) => setPlannedAmount(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              autoFocus
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Already Spent</span>
              <span className="font-medium text-gray-900">{formatCurrency(category.actual_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">New Utilization</span>
              <span className={`font-medium ${utilization > 100 ? 'text-red-600' : 'text-gray-900'}`}>
                {utilization.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${utilization > 100 ? 'bg-red-500' : 'bg-[#002561]'}`}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Update Budget
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddExpenseModalProps {
  category: BudgetCategory;
  period: FiscalPeriod;
  siteId: string;
  userId: string;
  accounts: Account[];
  onClose: () => void;
  onAdded: () => void;
}

function AddExpenseModal({
  category,
  period,
  siteId,
  userId,
  accounts,
  onClose,
  onAdded,
}: AddExpenseModalProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountId, setAccountId] = useState('');

  const handleAdd = async () => {
    if (!amount || !accountId) return;
    setLoading(true);

    const amountValue = Number(amount);
    await supabase.from('ledger_entries').insert({
      site_id: siteId,
      fiscal_period_id: period.id,
      entry_type: 'expense',
      category: category.category_name,
      description: description || null,
      amount: amountValue,
      currency_code: 'TRY',
      exchange_rate: 1.0,
      amount_reporting_try: amountValue,
      entry_date: entryDate,
      account_id: accountId,
      created_by: userId,
    });

    setLoading(false);
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Add Expense</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {category.category_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Account *
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent ${
                !accountId ? 'border-amber-400' : 'border-gray-300'
              }`}
            >
              <option value="">Select account</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_type === 'bank' ? 'Bank' : 'Cash'}: {acc.account_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Amount (TRY) *
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              placeholder="0"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              placeholder="Optional description..."
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading || !amount || !accountId}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add Expense
          </button>
        </div>
      </div>
    </div>
  );
}