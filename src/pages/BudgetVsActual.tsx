import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { supabase } from '../lib/supabase';
import { FileText, Loader2, Download, TrendingUp, TrendingDown, Calendar, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import type { FiscalPeriod, BudgetCategory, LedgerEntry } from '../types/database';

interface ReportLine {
  category: string;
  accrued: number; // Budget / Planned
  actual: number;  // Realized
  variance: number; // Difference
  percentage: number;
}

export default function BudgetVsActual() {
  const { currentSite, currentRole } = useAuth();
  const { canAccess } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [incomeLines, setIncomeLines] = useState<ReportLine[]>([]);
  const [expenseLines, setExpenseLines] = useState<ReportLine[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);

  // Helper function for permissions
  const canView = currentRole?.role === 'admin' || (canAccess && canAccess('/budget-vs-actual'));

  useEffect(() => {
    if (currentSite && canView) {
      fetchFiscalPeriods();
    } else {
      setLoading(false);
    }
  }, [currentSite, canView]);

  useEffect(() => {
    if (selectedPeriodId && canView) {
      fetchReportData();
    }
  }, [selectedPeriodId, canView]);

  const fetchFiscalPeriods = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data: periods } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('site_id', currentSite.id)
      .order('start_date', { ascending: false });

    setFiscalPeriods(periods || []);

    const active = periods?.find(p => p.status === 'active');
    if (active) {
      setSelectedPeriodId(active.id);
    } else if (periods && periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
    }

    setLoading(false);
  };

  const fetchReportData = async () => {
    if (!selectedPeriodId) return;
    setLoading(true);

    const [categoriesRes, entriesRes, accountsRes] = await Promise.all([
      supabase
        .from('budget_categories')
        .select('*')
        .eq('fiscal_period_id', selectedPeriodId)
        .order('display_order'),
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('fiscal_period_id', selectedPeriodId),
      supabase
        .from('accounts')
        .select('initial_balance, currency_code, initial_exchange_rate')
        .eq('site_id', currentSite?.id)
        .eq('is_active', true)
    ]);

    // Calculate Opening Balance with FX Rates
    const totalOpening = (accountsRes.data || []).reduce((sum, acc) => {
      const rate = acc.currency_code === 'TRY' ? 1 : (acc.initial_exchange_rate || 1);
      return sum + (Number(acc.initial_balance) * rate);
    }, 0);
    setOpeningBalance(totalOpening);

    calculateReportLines(categoriesRes.data || [], entriesRes.data || []);
    setLoading(false);
  };

  const calculateReportLines = (categories: BudgetCategory[], entries: LedgerEntry[]) => {
    // 1. Define Strict Income Keywords
    const INCOME_KEYWORDS = ['maintenance', 'dues', 'aidat', 'extra fee', 'income', 'revenue', 'interest'];

    // 2. Get unique categories
    const allCategories = new Set<string>();
    categories.forEach(c => allCategories.add(c.category_name));
    entries.forEach(e => {
      if (e.category !== 'Transfer') allCategories.add(e.category);
    });

    const incomeLinesTemp: ReportLine[] = [];
    const expenseLinesTemp: ReportLine[] = [];

    allCategories.forEach(catName => {
      const catNameLower = catName.toLowerCase();
      
      // 3. DECIDE LANE based on Name
      const isIncomeCategory = INCOME_KEYWORDS.some(k => catNameLower.includes(k));

      // 4. Calculate Raw Totals (Converted to TRY)
      const incomeSum = entries
        .filter(e => e.category === catName && e.entry_type === 'income')
        .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

      const expenseSum = entries
        .filter(e => e.category === catName && e.entry_type === 'expense')
        .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

      const budgetItem = categories.find(c => c.category_name === catName);
      const budgetAmount = budgetItem ? Number(budgetItem.planned_amount) : 0;

      if (isIncomeCategory) {
        // === INCOME LANE ===
        // Net Actual = (Money In) - (Money Out/Refunds)
        const netActual = incomeSum - expenseSum;

        if (budgetAmount > 0 || Math.abs(netActual) > 0) {
          incomeLinesTemp.push({
            category: catName,
            accrued: budgetAmount, // This is your Target Income
            actual: netActual,     // This is what you collected
            variance: netActual - budgetAmount, // Positive = Surplus
            percentage: budgetAmount > 0 ? (netActual / budgetAmount) * 100 : 0
          });
        }
      } else {
        // === EXPENSE LANE ===
        // Net Actual = (Money Out) - (Money In/Rebates)
        const netActual = expenseSum - incomeSum;

        if (budgetAmount > 0 || Math.abs(netActual) > 0) {
          expenseLinesTemp.push({
            category: catName,
            accrued: budgetAmount, // This is your Spending Limit
            actual: netActual,     // This is what you spent
            variance: budgetAmount - netActual, // Positive = Under Budget (Good)
            percentage: budgetAmount > 0 ? (netActual / budgetAmount) * 100 : 0
          });
        }
      }
    });

    // Sort by largest budget
    incomeLinesTemp.sort((a, b) => b.accrued - a.accrued);
    expenseLinesTemp.sort((a, b) => b.accrued - a.accrued);

    setIncomeLines(incomeLinesTemp);
    setExpenseLines(expenseLinesTemp);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Totals Calculation
  const totalIncomeAccrued = incomeLines.reduce((sum, line) => sum + line.accrued, 0);
  const totalIncomeActual = incomeLines.reduce((sum, line) => sum + line.actual, 0);
  const totalIncomeVariance = totalIncomeActual - totalIncomeAccrued;

  const totalExpenseAccrued = expenseLines.reduce((sum, line) => sum + line.accrued, 0);
  const totalExpenseActual = expenseLines.reduce((sum, line) => sum + line.actual, 0);
  const totalExpenseVariance = totalExpenseAccrued - totalExpenseActual;

  const netAccrued = totalIncomeAccrued - totalExpenseAccrued;
  const netActual = totalIncomeActual - totalExpenseActual;
  const netVariance = netActual - netAccrued;

  const projectedClosing = openingBalance + netActual;

  const selectedPeriod = fiscalPeriods.find(p => p.id === selectedPeriodId);

  const handlePrint = () => {
    window.print();
  };

  if (!canView) return <div className="flex items-center justify-center min-h-[60vh]">Access Denied</div>;
  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-[#002561]" /></div>;
  if (fiscalPeriods.length === 0) return <div className="flex items-center justify-center min-h-[60vh]">No Fiscal Periods</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget vs Actual Report</h1>
          <p className="text-gray-600 mt-1">Compare accrued income & expenses with actual performance</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
        >
          <Download className="w-4 h-4" />
          Print / Export
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 print:hidden">
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Fiscal Period
          </label>
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
          >
            {fiscalPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ({format(new Date(period.start_date), 'MMM d, yyyy')} - {format(new Date(period.end_date), 'MMM d, yyyy')})
                {period.status === 'active' && ' - Active'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 print:shadow-none print:border-0">
        <div className="p-8 space-y-8">
          <div className="text-center border-b border-gray-200 pb-6">
            <h2 className="text-3xl font-bold text-[#002561] mb-2">
              Budget vs Actual Comparison Report
            </h2>
            <h3 className="text-xl font-semibold text-gray-700 mb-3">{currentSite?.name}</h3>
            {selectedPeriod && (
              <div className="flex items-center justify-center gap-2 text-gray-600">
                <Calendar className="w-4 h-4" />
                <span>
                  {format(new Date(selectedPeriod.start_date), 'MMMM d, yyyy')} - {format(new Date(selectedPeriod.end_date), 'MMMM d, yyyy')}
                </span>
              </div>
            )}
          </div>

          <div className="bg-[#002561] text-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-6 h-6 text-white/80" />
              <h3 className="text-lg font-semibold">Financial Position</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <p className="text-sm text-white/70 mb-1">Opening Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(openingBalance)}</p>
                <p className="text-xs text-white/50">Starting balance (Converted to TRY)</p>
              </div>
              <div>
                <p className="text-sm text-white/70 mb-1">Net Period Change (Actual)</p>
                <p className={`text-2xl font-bold ${netActual >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {netActual > 0 ? '+' : ''}{formatCurrency(netActual)}
                </p>
                <p className="text-xs text-white/50">Actual Income - Actual Expenses</p>
              </div>
              <div className="pt-4 md:pt-0 md:border-l md:border-white/20 md:pl-8">
                <p className="text-sm text-white/70 mb-1">Projected Closing Balance</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(projectedClosing)}
                </p>
                <p className="text-xs text-white/50">Opening + Net Actual</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Total Income</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Accrued:</span>
                  <span className="font-semibold text-blue-900">{formatCurrency(totalIncomeAccrued)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Actual:</span>
                  <span className="font-semibold text-blue-900">{formatCurrency(totalIncomeActual)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-blue-300">
                  <span className="text-blue-700">Variance:</span>
                  <span className={`font-bold ${totalIncomeVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalIncomeVariance)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <h4 className="text-sm font-medium text-orange-900 mb-2">Total Expenses</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700">Budget:</span>
                  <span className="font-semibold text-orange-900">{formatCurrency(totalExpenseAccrued)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700">Actual:</span>
                  <span className="font-semibold text-orange-900">{formatCurrency(totalExpenseActual)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-orange-300">
                  <span className="text-orange-700">Variance:</span>
                  <span className={`font-bold ${totalExpenseVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalExpenseVariance)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-300">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Net Period Performance</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Accrued Net:</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(netAccrued)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Actual Net:</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(netActual)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-400">
                  <span className="text-gray-700">Variance:</span>
                  <span className={`font-bold ${netVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(netVariance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-[#002561] mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Income Analysis: Accrued vs Actual
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Accrued (Budget)</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Actual Collected</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Variance</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeLines.map((line, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{line.category}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.accrued)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.actual)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${line.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(line.variance)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {line.accrued > 0 ? `${line.percentage.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                    {incomeLines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500">
                          No income data available for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-blue-50 font-bold">
                      <td className="py-3 px-4 text-gray-900">Total Income</td>
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalIncomeAccrued)}</td>
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalIncomeActual)}</td>
                      <td className={`py-3 px-4 text-right ${totalIncomeVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalIncomeVariance)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {totalIncomeAccrued > 0 ? `${((totalIncomeActual / totalIncomeAccrued) * 100).toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-[#002561] mb-4 flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Expense Analysis: Budget vs Actual Spent
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Budget Limit</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Actual Spent</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Variance</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLines.map((line, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{line.category}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.accrued)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.actual)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${line.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(line.variance)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {line.accrued > 0 ? `${line.percentage.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                    {expenseLines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500">
                          No expense data available for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-orange-50 font-bold">
                      <td className="py-3 px-4 text-gray-900">Total Expenses</td>
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalExpenseAccrued)}</td>
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalExpenseActual)}</td>
                      <td className={`py-3 px-4 text-right ${totalExpenseVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalExpenseVariance)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {totalExpenseAccrued > 0 ? `${((totalExpenseActual / totalExpenseAccrued) * 100).toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className="border-t-2 border-gray-300 pt-4">
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900">Net Period Position (Income - Expenses)</span>
                <div className="text-right">
                  <div className="text-sm text-gray-600">
                    Accrued Net: <span className="font-semibold text-gray-900">{formatCurrency(netAccrued)}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Actual Net: <span className="font-semibold text-gray-900">{formatCurrency(netActual)}</span>
                  </div>
                  <div className="text-lg font-bold mt-1">
                    Variance: <span className={netVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(netVariance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center text-sm text-gray-500 pt-4 border-t border-gray-200">
            Report generated on {format(new Date(), 'MMMM d, yyyy')}
          </div>
        </div>
      </div>
    </div>
  );
}