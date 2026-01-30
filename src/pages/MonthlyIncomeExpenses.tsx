import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Calendar, Download, Loader2, TrendingUp, TrendingDown,
  DollarSign, ChevronDown, ChevronRight,
} from 'lucide-react';
import { format, parseISO, eachMonthOfInterval, isSameMonth } from 'date-fns';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../lib/constants';
import type { FiscalPeriod } from '../types/database';

interface TransactionDetail {
  id: string;
  date: string;
  description: string;
  amount: number;
  monthIndex: number;
}

interface CategoryRow {
  category: string;
  monthlyValues: number[];
  total: number;
  transactions: TransactionDetail[];
}

export default function MonthlyIncomeExpenses() {
  const { currentSite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [months, setMonths] = useState<Date[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [incomeRows, setIncomeRows] = useState<CategoryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<CategoryRow[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState({
    income: [] as number[],
    expenses: [] as number[],
    net: [] as number[],
    closingBalance: [] as number[],
  });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentSite) {
      fetchFiscalPeriods();
    }
  }, [currentSite]);

  useEffect(() => {
    if (selectedPeriodId) {
      fetchMonthlyData();
    }
  }, [selectedPeriodId]);

  const fetchFiscalPeriods = async () => {
    if (!currentSite) return;

    const { data } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('site_id', currentSite.id)
      .order('start_date', { ascending: false });

    if (data && data.length > 0) {
      setFiscalPeriods(data);
      const activePeriod = data.find(p => p.status === 'active');
      setSelectedPeriodId(activePeriod?.id || data[0].id);
    } else {
      setLoading(false);
    }
  };

  const fetchMonthlyData = async () => {
    if (!currentSite || !selectedPeriodId) return;
    setLoading(true);

    try {
      const selectedPeriod = fiscalPeriods.find(p => p.id === selectedPeriodId);
      if (!selectedPeriod) {
         setLoading(false);
         return;
      }

      const monthsInPeriod = eachMonthOfInterval({
        start: parseISO(selectedPeriod.start_date),
        end: parseISO(selectedPeriod.end_date),
      }).slice(0, 12);
      setMonths(monthsInPeriod);

    // ✅ USE SECURE RPC
      const { data: totalInitialBalance } = await supabase
        .rpc('get_site_opening_balance', { p_site_id: currentSite.id });
      
      setOpeningBalance(totalInitialBalance || 0);
      
      setOpeningBalance(totalInitialBalance);

      const { data: ledgerEntries } = await supabase
        .from('ledger_entries')
        .select('*')
        .eq('site_id', currentSite.id)
        .gte('entry_date', selectedPeriod.start_date)
        .lte('entry_date', selectedPeriod.end_date)
        .neq('category', 'Transfer') // ✅ FILTER OUT TRANSFERS
        .order('entry_date', { ascending: true });

      const incomeCategoryMap = new Map<string, { values: number[], transactions: TransactionDetail[] }>();
      const expenseCategoryMap = new Map<string, { values: number[], transactions: TransactionDetail[] }>();

      // Safe initialization
      (INCOME_CATEGORIES || []).forEach(cat => {
        incomeCategoryMap.set(cat, { values: new Array(monthsInPeriod.length).fill(0), transactions: [] });
      });

      (EXPENSE_CATEGORIES || []).forEach(cat => {
        expenseCategoryMap.set(cat, { values: new Array(monthsInPeriod.length).fill(0), transactions: [] });
      });

      if (ledgerEntries) {
        ledgerEntries.forEach((entry) => {
          if (!entry.entry_date) return;
          const entryDate = parseISO(entry.entry_date);
          const monthIndex = monthsInPeriod.findIndex(month => isSameMonth(month, entryDate));

          if (monthIndex === -1) return;

          // ✅ FIX: Use 'amount_reporting_try' for correct currency summing
          const amountInTRY = Number(entry.amount_reporting_try || entry.amount || 0);

          const targetMap = entry.entry_type === 'income' ? incomeCategoryMap : expenseCategoryMap;
          
          if (!targetMap.has(entry.category)) {
             targetMap.set(entry.category, { values: new Array(monthsInPeriod.length).fill(0), transactions: [] });
          }

          const categoryData = targetMap.get(entry.category);
          if (categoryData) {
            categoryData.values[monthIndex] += amountInTRY;
            categoryData.transactions.push({
              id: entry.id,
              date: entry.entry_date,
              description: entry.description || 'No description',
              amount: amountInTRY,
              monthIndex,
            });
          }
        });
      }

      // --- FILTERING LOGIC ---
      const processMap = (map: Map<string, any>) => {
        return Array.from(map.entries())
          .map(([category, data]) => ({
            category,
            monthlyValues: data.values,
            total: data.values.reduce((sum: number, val: number) => sum + val, 0),
            transactions: data.transactions.sort((a: any, b: any) => a.date.localeCompare(b.date)),
          }))
          .filter(row => Math.abs(row.total) > 0.01); // Filter out zero/near-zero totals
      };

      const incomeRowsData = processMap(incomeCategoryMap);
      const expenseRowsData = processMap(expenseCategoryMap);

      // --- TOTALS CALCULATION ---
      const monthlyIncomeTotal = new Array(monthsInPeriod.length).fill(0);
      const monthlyExpenseTotal = new Array(monthsInPeriod.length).fill(0);

      incomeRowsData.forEach(row => {
        row.monthlyValues.forEach((val: number, idx: number) => {
          monthlyIncomeTotal[idx] += val;
        });
      });

      expenseRowsData.forEach(row => {
        row.monthlyValues.forEach((val: number, idx: number) => {
          monthlyExpenseTotal[idx] += val;
        });
      });

      const monthlyNet = monthlyIncomeTotal.map((inc, idx) => inc - monthlyExpenseTotal[idx]);
      const monthlyClosingBalance: number[] = [];
      let runningBalance = totalInitialBalance;

      for (let i = 0; i < monthlyNet.length; i++) {
        runningBalance += monthlyNet[i];
        monthlyClosingBalance.push(runningBalance);
      }

      setIncomeRows(incomeRowsData);
      setExpenseRows(expenseRowsData);
      setMonthlyTotals({
        income: monthlyIncomeTotal,
        expenses: monthlyExpenseTotal,
        net: monthlyNet,
        closingBalance: monthlyClosingBalance,
      });

    } catch (err) {
      console.error("Error fetching report:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const totalIncome = incomeRows.reduce((sum, row) => sum + row.total, 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + row.total, 0);
  const netBalance = totalIncome - totalExpenses;
  const closingBalance = monthlyTotals.closingBalance.length > 0
    ? monthlyTotals.closingBalance[monthlyTotals.closingBalance.length - 1]
    : openingBalance;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  if (fiscalPeriods.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Fiscal Periods</h2>
          <p className="text-gray-600">Create a fiscal period to view monthly reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly Income & Expenses Report</h1>
          <p className="text-gray-600">Category-wise monthly breakdown with balances</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
          >
            {fiscalPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Opening Balance</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(openingBalance)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Income</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-red-100 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${closingBalance >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
              <DollarSign className={`w-5 h-5 ${closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Closing Balance</p>
              <p className={`text-xl font-bold ${closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(closingBalance)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {months.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Monthly Breakdown by Category</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left sticky left-0 bg-gray-50 z-10 border-r border-gray-300">
                  </th>
                  {months.map((month, idx) => (
                    <th key={idx} className="px-3 py-3 border-r border-gray-200 text-center font-medium text-gray-700">
                        {format(month, 'MMM yy')}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-100">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-blue-50">
                  <td colSpan={months.length + 2} className="px-4 py-2 font-semibold text-gray-900">
                    Opening Balance
                  </td>
                </tr>
                <tr className="bg-blue-50">
                  <td className="px-4 py-3 text-gray-700 sticky left-0 bg-blue-50 border-r border-gray-300">
                    Balance Brought Forward
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900 border-r border-gray-200">
                    {formatCurrency(openingBalance)}
                  </td>
                  {months.slice(1).map((_, idx) => (
                    <td key={idx} className="px-3 py-3 border-r border-gray-200"></td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold text-gray-900 bg-gray-100">
                    {formatCurrency(openingBalance)}
                  </td>
                </tr>

                <tr className="bg-gray-200">
                  <td className="px-4 py-2 sticky left-0 bg-gray-200 border-r border-gray-300"></td>
                  {months.map((month, idx) => (
                    <td key={idx} className="px-3 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-200">
                      {format(month, 'MMM yy')}
                    </td>
                  ))}
                  <td className="px-4 py-2 bg-gray-100"></td>
                </tr>

                {/* INCOME SECTION */}
                <tr className="bg-green-50">
                  <td colSpan={months.length + 2} className="px-4 py-2 font-semibold text-gray-900 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-2 text-green-600" />
                    Income
                  </td>
                </tr>
                {incomeRows.length === 0 ? (
                  <tr><td colSpan={months.length + 2} className="px-4 py-3 text-gray-500 text-center italic">No income recorded</td></tr>
                ) : (
                  incomeRows.map((row) => {
                    const isExpanded = expandedCategories.has(row.category);
                    const hasTransactions = row.transactions.length > 0;
                    return (
                      <React.Fragment key={row.category}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-700 sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-300">
                            <button
                              onClick={() => toggleCategory(row.category)}
                              className="flex items-center space-x-2 w-full text-left"
                              disabled={!hasTransactions}
                            >
                              {hasTransactions && (
                                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                              )}
                              {!hasTransactions && <span className="w-4" />}
                              <span>{row.category}</span>
                            </button>
                          </td>
                          {row.monthlyValues.map((value, idx) => (
                            <td key={idx} className="px-3 py-3 text-right text-gray-900 border-r border-gray-200">
                              {value > 0 ? formatCurrency(value) : '-'}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-semibold text-green-600 bg-gray-50">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                        {isExpanded && hasTransactions && (
                          <tr>
                            <td colSpan={months.length + 2} className="px-0 py-0 bg-gray-50">
                              <div className="px-8 py-3">
                                <table className="w-full text-xs">
                                  <thead className="bg-white">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Date</th>
                                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Description</th>
                                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Month</th>
                                      <th className="px-3 py-2 text-right text-gray-600 font-medium">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {row.transactions.map((txn) => (
                                      <tr key={txn.id} className="bg-white hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-700">{format(parseISO(txn.date), 'dd MMM yyyy')}</td>
                                        <td className="px-3 py-2 text-gray-700">{txn.description}</td>
                                        <td className="px-3 py-2 text-gray-700">{months[txn.monthIndex] ? format(months[txn.monthIndex], 'MMM yyyy') : '-'}</td>
                                        <td className="px-3 py-2 text-right text-gray-900 font-medium">{formatCurrency(txn.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}

                <tr className="bg-green-100 font-semibold">
                  <td className="px-4 py-3 text-gray-900 sticky left-0 bg-green-100 border-r border-gray-300">
                    Total Income
                  </td>
                  {monthlyTotals.income.map((value, idx) => (
                    <td key={idx} className="px-3 py-3 text-right text-green-700 border-r border-gray-200">
                      {value > 0 ? formatCurrency(value) : '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-200">
                    {formatCurrency(totalIncome)}
                  </td>
                </tr>

                <tr className="bg-gray-200">
                  <td className="px-4 py-2 sticky left-0 bg-gray-200 border-r border-gray-300"></td>
                  {months.map((month, idx) => (
                    <td key={idx} className="px-3 py-2 text-center text-xs font-medium text-gray-700 border-r border-gray-200">
                      {format(month, 'MMM yy')}
                    </td>
                  ))}
                  <td className="px-4 py-2 bg-gray-100"></td>
                </tr>

                {/* EXPENSE SECTION */}
                <tr className="bg-red-50">
                  <td colSpan={months.length + 2} className="px-4 py-2 font-semibold text-gray-900 flex items-center">
                    <TrendingDown className="w-4 h-4 mr-2 text-red-600" />
                    Expenses
                  </td>
                </tr>
                {expenseRows.length === 0 ? (
                  <tr><td colSpan={months.length + 2} className="px-4 py-3 text-gray-500 text-center italic">No expenses recorded</td></tr>
                ) : (
                  expenseRows.map((row) => {
                    const isExpanded = expandedCategories.has(row.category);
                    const hasTransactions = row.transactions.length > 0;
                    return (
                      <React.Fragment key={row.category}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-700 sticky left-0 bg-white hover:bg-gray-50 border-r border-gray-300">
                            <button
                              onClick={() => toggleCategory(row.category)}
                              className="flex items-center space-x-2 w-full text-left"
                              disabled={!hasTransactions}
                            >
                              {hasTransactions && (
                                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                              )}
                              {!hasTransactions && <span className="w-4" />}
                              <span>{row.category}</span>
                            </button>
                          </td>
                          {row.monthlyValues.map((value, idx) => (
                            <td key={idx} className="px-3 py-3 text-right text-gray-900 border-r border-gray-200">
                              {value > 0 ? formatCurrency(value) : '-'}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-semibold text-red-600 bg-gray-50">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                        {isExpanded && hasTransactions && (
                          <tr>
                            <td colSpan={months.length + 2} className="px-0 py-0 bg-gray-50">
                              <div className="px-8 py-3">
                                <table className="w-full text-xs">
                                  <thead className="bg-white">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Date</th>
                                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Description</th>
                                      <th className="px-3 py-2 text-left text-gray-600 font-medium">Month</th>
                                      <th className="px-3 py-2 text-right text-gray-600 font-medium">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {row.transactions.map((txn) => (
                                      <tr key={txn.id} className="bg-white hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-700">{format(parseISO(txn.date), 'dd MMM yyyy')}</td>
                                        <td className="px-3 py-2 text-gray-700">{txn.description}</td>
                                        <td className="px-3 py-2 text-gray-700">{months[txn.monthIndex] ? format(months[txn.monthIndex], 'MMM yyyy') : '-'}</td>
                                        <td className="px-3 py-2 text-right text-gray-900 font-medium">{formatCurrency(txn.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}

                <tr className="bg-red-100 font-semibold">
                  <td className="px-4 py-3 text-gray-900 sticky left-0 bg-red-100 border-r border-gray-300">
                    Total Expenses
                  </td>
                  {monthlyTotals.expenses.map((value, idx) => (
                    <td key={idx} className="px-3 py-3 text-right text-red-700 border-r border-gray-200">
                      {value > 0 ? formatCurrency(value) : '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold text-red-700 bg-red-200">
                    {formatCurrency(totalExpenses)}
                  </td>
                </tr>

                {/* NET & CLOSING */}
                <tr className="bg-blue-100 font-semibold">
                  <td className="px-4 py-3 text-gray-900 sticky left-0 bg-blue-100 border-r border-gray-300">
                    Net (Income - Expenses)
                  </td>
                  {monthlyTotals.net.map((value, idx) => (
                    <td key={idx} className={`px-3 py-3 text-right border-r border-gray-200 ${value >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {formatCurrency(value)}
                    </td>
                  ))}
                  <td className={`px-4 py-3 text-right font-bold bg-blue-200 ${netBalance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {formatCurrency(netBalance)}
                  </td>
                </tr>

                <tr className="bg-gray-100 font-bold">
                  <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100 border-r border-gray-300">
                    Monthly Closing Balance
                  </td>
                  {monthlyTotals.closingBalance.map((value, idx) => (
                    <td key={idx} className={`px-3 py-3 text-right border-r border-gray-200 ${value >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
                      {formatCurrency(value)}
                    </td>
                  ))}
                  <td className={`px-4 py-3 text-right font-bold bg-gray-200 ${closingBalance >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
                    {formatCurrency(closingBalance)}
                  </td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>
      )}

      {months.length === 0 && !loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
          <p className="text-gray-600">No transactions recorded for this fiscal period yet.</p>
        </div>
      )}
    </div>
  );
}