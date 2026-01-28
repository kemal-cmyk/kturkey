import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { supabase } from '../lib/supabase';
import { FileText, Loader2, Download, TrendingUp, TrendingDown, Calendar, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import type { FiscalPeriod, BudgetCategory, LedgerEntry } from '../types/database';

interface ReportLine {
  category: string;
  planned: number;
  actual: number;
  difference: number;
  percentage: number;
}

export default function BudgetVsActual() {
  const { currentSite, currentRole } = useAuth();
  const { canAccess } = usePermissions(); 

  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<FiscalPeriod | null>(null);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [incomeLines, setIncomeLines] = useState<ReportLine[]>([]);
  const [expenseLines, setExpenseLines] = useState<ReportLine[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);

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
      setActivePeriod(active);
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

    setBudgetCategories(categoriesRes.data || []);
    setLedgerEntries(entriesRes.data || []);

    const totalOpening = (accountsRes.data || []).reduce((sum, acc) => {
        const rate = acc.currency_code === 'TRY' ? 1 : (acc.initial_exchange_rate || 1);
        return sum + (Number(acc.initial_balance) * rate);
    }, 0);
    setOpeningBalance(totalOpening);

    calculateReportLines(categoriesRes.data || [], entriesRes.data || []);
    setLoading(false);
  };

  // ✅ FIXED LOGIC: Strict Income vs Expense Separation
  const calculateReportLines = (categories: BudgetCategory[], entries: LedgerEntry[]) => {
    // 1. Identify all unique categories used in Budget OR Ledger
    const allCategories = new Set<string>();
    categories.forEach(c => allCategories.add(c.category_name));
    entries.forEach(e => {
        if (e.category !== 'Transfer') allCategories.add(e.category);
    });

    const incomeLinesTemp: ReportLine[] = [];
    const expenseLinesTemp: ReportLine[] = [];

    // 2. Define Strict Income Keywords (The Logic you requested)
    const STRICT_INCOME_KEYWORDS = ['Maintenance', 'Fee', 'Dues', 'Aidat', 'Income', 'Interest'];

    allCategories.forEach(catName => {
        // Calculate Totals (Converted to TRY)
        const incomeSum = entries
            .filter(e => e.category === catName && e.entry_type === 'income')
            .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

        const expenseSum = entries
            .filter(e => e.category === catName && e.entry_type === 'expense')
            .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

        const budgetItem = categories.find(c => c.category_name === catName);
        const plannedAmount = budgetItem ? Number(budgetItem.planned_amount) : 0;

        // 3. Determine if this category is strictly Income
        const isStrictlyIncome = STRICT_INCOME_KEYWORDS.some(k => catName.includes(k));

        if (isStrictlyIncome) {
             // ---> ADD TO INCOME TABLE
             // Even if there are expenses (refunds), we net them against income here
             const netActualIncome = incomeSum - expenseSum; 
             
             // Only add if relevant (has budget OR has actuals)
             if (plannedAmount > 0 || Math.abs(netActualIncome) > 0) {
                 incomeLinesTemp.push({
                    category: catName,
                    planned: plannedAmount, // "Accrual" Target
                    actual: netActualIncome, // Actual Collected (minus refunds)
                    difference: netActualIncome - plannedAmount,
                    percentage: plannedAmount > 0 ? (netActualIncome / plannedAmount) * 100 : 0
                 });
             }
        } else {
            // ---> ADD TO EXPENSE TABLE
            // Standard Expense Logic
            const netActualExpense = expenseSum - incomeSum; // Net expenses (minus any refunds/rebates)

            if (plannedAmount > 0 || Math.abs(netActualExpense) > 0) {
                expenseLinesTemp.push({
                    category: catName,
                    planned: plannedAmount, // Spending Budget
                    actual: netActualExpense, // Actual Spent
                    difference: plannedAmount - netActualExpense, // Remaining Budget
                    percentage: plannedAmount > 0 ? (netActualExpense / plannedAmount) * 100 : 0
                });
            }
        }
    });

    // 4. Sort by Actual Amount (Highest first)
    incomeLinesTemp.sort((a, b) => b.actual - a.actual);
    expenseLinesTemp.sort((a, b) => b.actual - a.actual);

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

  const totalIncomePlanned = incomeLines.reduce((sum, line) => sum + line.planned, 0);
  const totalIncomeActual = incomeLines.reduce((sum, line) => sum + line.actual, 0);
  const totalIncomeDifference = totalIncomeActual - totalIncomePlanned;

  const totalExpensePlanned = expenseLines.reduce((sum, line) => sum + line.planned, 0);
  const totalExpenseActual = expenseLines.reduce((sum, line) => sum + line.actual, 0);
  const totalExpenseDifference = totalExpensePlanned - totalExpenseActual;

  const netPlanned = totalIncomePlanned - totalExpensePlanned;
  const netActual = totalIncomeActual - totalExpenseActual;
  const netDifference = netActual - netPlanned;

  const projectedClosingActual = openingBalance + netActual;

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
          <p className="text-gray-600 mt-1">Compare planned budget with actual performance</p>
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
              <h3 className="text-lg font-semibold">Projected Cash Position</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <p className="text-sm text-white/70 mb-1">Opening Cash Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(openingBalance)}</p>
                <p className="text-xs text-white/50">Initial Accounts State (Converted to TRY)</p>
              </div>
              <div>
                <p className="text-sm text-white/70 mb-1">Net Period Change</p>
                <p className={`text-2xl font-bold ${netActual >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {netActual > 0 ? '+' : ''}{formatCurrency(netActual)}
                </p>
                <p className="text-xs text-white/50">Income - Expenses (Converted to TRY)</p>
              </div>
              <div className="pt-4 md:pt-0 md:border-l md:border-white/20 md:pl-8">
                <p className="text-sm text-white/70 mb-1">Estimated Closing Balance</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(projectedClosingActual)}
                </p>
                <p className="text-xs text-white/50">Opening + Net Change</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Total Income</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Planned:</span>
                  <span className="font-semibold text-blue-900">{formatCurrency(totalIncomePlanned)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Actual:</span>
                  <span className="font-semibold text-blue-900">{formatCurrency(totalIncomeActual)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-blue-300">
                  <span className="text-blue-700">Difference:</span>
                  <span className={`font-bold ${totalIncomeDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalIncomeDifference)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <h4 className="text-sm font-medium text-orange-900 mb-2">Total Expenses</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700">Budget:</span>
                  <span className="font-semibold text-orange-900">{formatCurrency(totalExpensePlanned)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700">Actual:</span>
                  <span className="font-semibold text-orange-900">{formatCurrency(totalExpenseActual)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-orange-300">
                  <span className="text-orange-700">Remaining:</span>
                  <span className={`font-bold ${totalExpenseDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalExpenseDifference)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-300">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Net Period Performance</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Planned:</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(netPlanned)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Actual:</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(netActual)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-400">
                  <span className="text-gray-700">Variance:</span>
                  <span className={`font-bold ${netDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(netDifference)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-[#002561] mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Income Analysis
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Planned</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Actual</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Difference</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeLines.map((line, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{line.category}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.planned)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.actual)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${line.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(line.difference)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {line.planned > 0 ? `${line.percentage.toFixed(1)}%` : '-'}
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
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalIncomePlanned)}</td>
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalIncomeActual)}</td>
                      <td className={`py-3 px-4 text-right ${totalIncomeDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalIncomeDifference)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {totalIncomePlanned > 0 ? `${((totalIncomeActual / totalIncomePlanned) * 100).toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-[#002561] mb-4 flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Expense Analysis
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Budget</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Actual</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Remaining</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLines.map((line, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{line.category}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.planned)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(line.actual)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${line.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(line.difference)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {line.planned > 0 ? `${line.percentage.toFixed(1)}%` : '-'}
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
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalExpensePlanned)}</td>
                      <td className="py-3 px-4 text-right text-gray-900">{formatCurrency(totalExpenseActual)}</td>
                      <td className={`py-3 px-4 text-right ${totalExpenseDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalExpenseDifference)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">
                        {totalExpensePlanned > 0 ? `${((totalExpenseActual / totalExpensePlanned) * 100).toFixed(1)}%` : '-'}
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
                    Planned: <span className="font-semibold text-gray-900">{formatCurrency(netPlanned)}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Actual: <span className="font-semibold text-gray-900">{formatCurrency(netActual)}</span>
                  </div>
                  <div className="text-lg font-bold mt-1">
                    Variance: <span className={netDifference >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(netDifference)}
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