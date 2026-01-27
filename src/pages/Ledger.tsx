import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import {
  Receipt, Search, Filter, Download, Loader2,
  TrendingUp, TrendingDown, ChevronDown, Calendar,
  Building2, Wallet, Save, X, Trash2, Plus, Edit2, Check, Upload,
} from 'lucide-react';
import { format } from 'date-fns';
import type { LedgerEntry, FiscalPeriod, BudgetCategory } from '../types/database';

interface Account {
  id: string;
  site_id: string;
  account_name: string;
  account_type: 'bank' | 'cash';
  account_number: string | null;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  currency_code: string;
}

export default function Ledger() {
  const navigate = useNavigate();
  const { currentSite, currentRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [units, setUnits] = useState<Array<{ id: string; unit_number: string; block: string | null; owner_name: string | null }>>([]);

  const [newEntry, setNewEntry] = useState({
    entry_type: 'expense' as 'income' | 'expense' | 'transfer',
    category: '',
    description: '',
    amount: '',
    currency_code: 'TRY',
    exchange_rate: '1',
    entry_date: format(new Date(), 'yyyy-MM-dd'),
    vendor_name: '',
    account_id: '',
    unit_id: '',
    from_account_id: '',
    to_account_id: '',
  });

  const [unitDuesCurrency, setUnitDuesCurrency] = useState<string | null>(null);

  const SUPPORTED_CURRENCIES = [
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  ];

  const isAdmin = currentRole?.role === 'admin';

  useEffect(() => {
    if (currentSite) {
      fetchData();
    }
  }, [currentSite]);

  useEffect(() => {
    if (selectedPeriod) {
      fetchCategories(selectedPeriod);
    }
  }, [selectedPeriod]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    const [periodsRes, accountsRes] = await Promise.all([
      supabase
        .from('fiscal_periods')
        .select('*')
        .eq('site_id', currentSite.id)
        .order('start_date', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    ]);

    setFiscalPeriods(periodsRes.data || []);
    setAccounts(accountsRes.data || []);

    const activePeriod = periodsRes.data?.find(p => p.status === 'active');
    if (activePeriod) {
      setSelectedPeriod(activePeriod.id);
    } else if (periodsRes.data && periodsRes.data.length > 0) {
      setSelectedPeriod(periodsRes.data[0].id);
    }

    await fetchEntries();
    setLoading(false);
  };

  const fetchEntries = async () => {
    if (!currentSite) return;

    // Fetch in ASCENDING order for correct balance calculation
    const { data } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('site_id', currentSite.id)
      .order('entry_date', { ascending: true }); 

    if (selectedPeriod && data) {
      const filtered = data.filter(entry =>
        entry.fiscal_period_id === selectedPeriod ||
        (entry.entry_type === 'transfer' && entry.fiscal_period_id === null)
      );
      setEntries(filtered);
    } else {
      setEntries(data || []);
    }
  };

  const fetchCategories = async (periodId: string) => {
    const { data } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('fiscal_period_id', periodId);

    setBudgetCategories(data || []);
    if (data && data.length > 0 && !newEntry.category) {
      setNewEntry(prev => ({ ...prev, category: data[0].category_name }));
    }
  };

  useEffect(() => {
    if (currentSite) {
      fetchEntries();
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (isAdmin && currentSite) {
      fetchUnitsForPayment();
    }
  }, [currentSite, isAdmin]);

  const fetchUnitsForPayment = async () => {
    if (!currentSite) return;
    const { data } = await supabase
      .from('units')
      .select('id, unit_number, block, owner_name')
      .eq('site_id', currentSite.id)
      .order('unit_number');
    setUnits(data || []);
  };

  const fetchUnitDuesCurrency = async (unitId: string) => {
    const { data } = await supabase
      .from('dues')
      .select('currency_code')
      .eq('unit_id', unitId)
      .limit(1)
      .maybeSingle();

    if (data) {
      setUnitDuesCurrency(data.currency_code);
      return data.currency_code;
    }
    setUnitDuesCurrency(null);
    return null;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleAddEntry = async () => {
    if (!currentSite || !user) return;

    if (newEntry.entry_type === 'transfer') {
      if (!newEntry.from_account_id || !newEntry.to_account_id || !newEntry.amount) {
        alert('Please select both accounts and enter an amount for the transfer');
        return;
      }

      const { error } = await supabase.rpc('create_account_transfer', {
        p_site_id: currentSite.id,
        p_from_account_id: newEntry.from_account_id,
        p_to_account_id: newEntry.to_account_id,
        p_amount: Number(newEntry.amount),
        p_transfer_date: newEntry.entry_date,
        p_description: newEntry.description || 'Internal Transfer',
        p_created_by: user.id,
      });

      if (error) {
        console.error('Error creating transfer:', error);
        alert('Failed to create transfer. Please try again.');
        return;
      }
    } else {
      if (!newEntry.category || !newEntry.amount || !newEntry.account_id) return;

      const isMaintenanceRelated = newEntry.entry_type === 'income' && (newEntry.category === 'Maintenance Fees' || newEntry.category === 'Extra Fees');
      if (isMaintenanceRelated && !newEntry.unit_id) {
        alert('Please select a unit for maintenance/extra fees');
        return;
      }

      let description = newEntry.description;
      if (isMaintenanceRelated && newEntry.unit_id) {
        const unit = units.find(u => u.id === newEntry.unit_id);
        const unitLabel = unit ? `Unit ${unit.block ? `${unit.block}-` : ''}${unit.unit_number}` : '';
        description = description ? `${unitLabel} - ${description}` : unitLabel;

        const paymentAmount = Number(newEntry.amount);
        const { error } = await supabase.rpc('apply_unit_payment', {
          p_unit_id: newEntry.unit_id,
          p_payment_amount: paymentAmount,
          p_payment_date: newEntry.entry_date,
          p_payment_method: 'bank_transfer',
          p_reference_no: null,
          p_account_id: newEntry.account_id || null,
          p_category: newEntry.category,
          p_currency_code: newEntry.currency_code || 'TRY',
          p_exchange_rate: Number(newEntry.exchange_rate) || 1.0,
        });

        if (error) {
          console.error('Error applying payment to unit:', error);
          alert('Failed to apply payment to unit. Please try again.');
          return;
        }
      } else {
        const amount = Number(newEntry.amount);
        const exchangeRate = Number(newEntry.exchange_rate) || 1;
        const amountReportingTry = newEntry.currency_code === 'TRY'
          ? amount
          : amount * exchangeRate;

        const { error } = await supabase.from('ledger_entries').insert({
          site_id: currentSite.id,
          fiscal_period_id: selectedPeriod || null,
          entry_type: newEntry.entry_type,
          category: newEntry.category,
          description: description || null,
          amount: amount,
          currency_code: newEntry.currency_code,
          exchange_rate: exchangeRate,
          amount_reporting_try: amountReportingTry,
          entry_date: newEntry.entry_date,
          vendor_name: newEntry.vendor_name || null,
          account_id: newEntry.account_id || null,
          created_by: user.id,
        });

        if (error) {
          console.error('Error creating ledger entry:', error);
          alert('Failed to create ledger entry. Please try again.');
          return;
        }
      }
    }

    setNewEntry({
      entry_type: 'expense',
      category: budgetCategories[0]?.category_name || '',
      description: '',
      amount: '',
      currency_code: 'TRY',
      exchange_rate: '1',
      entry_date: format(new Date(), 'yyyy-MM-dd'),
      vendor_name: '',
      account_id: '',
      unit_id: '',
      from_account_id: '',
      to_account_id: '',
    });
    setUnitDuesCurrency(null);

    await fetchEntries();
    await fetchData();
  };

  const handleUpdateEntry = async (entry: LedgerEntry, updates: Partial<LedgerEntry>) => {
    const cleanedUpdates = {
      ...updates,
      account_id: updates.account_id || null,
    };

    await supabase
      .from('ledger_entries')
      .update(cleanedUpdates)
      .eq('id', entry.id);

    setEditingRow(null);
    await fetchEntries();
    await fetchData();
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    await supabase.from('ledger_entries').delete().eq('id', id);
    await fetchEntries();
    await fetchData();
  };

  const handleSaveAccount = async (accountData: Partial<Account>) => {
    if (!currentSite) return;

    if (editingAccount) {
      await supabase
        .from('accounts')
        .update(accountData)
        .eq('id', editingAccount.id);
    } else {
      await supabase.from('accounts').insert({
        ...accountData,
        site_id: currentSite.id,
        initial_balance: accountData.initial_balance || 0,
        current_balance: accountData.initial_balance || 0,
        is_active: true,
      });
    }

    setShowAccountForm(false);
    setEditingAccount(null);
    await fetchData();
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to remove this account?')) return;

    await supabase.from('accounts').update({ is_active: false }).eq('id', id);
    await fetchData();
  };

  // --- BALANCE CALCULATION LOGIC ---
  const sortedAllEntries = [...entries].sort(
    (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
  );

  // 1. Define Opening Balance (FIXED: Added this line back)
  const openingBalance = accounts.reduce((sum, acc) => sum + Number(acc.initial_balance), 0);

  const accountBalances: Record<string, number> = {};
  accounts.forEach(acc => {
    accountBalances[acc.id] = Number(acc.initial_balance);
  });

  let currentTotalBalance = accounts.reduce((sum, acc) => sum + Number(acc.initial_balance), 0);

  const entriesWithCalculatedBalances = sortedAllEntries.map(entry => {
    const amountTry = Number(entry.amount_reporting_try || entry.amount);
    let entryAccountBalance = 0;
    
    if (entry.entry_type === 'transfer') {
        entryAccountBalance = 0; 
    } else {
        if (entry.account_id) {
            const currentAccBalance = accountBalances[entry.account_id] || 0;
            const newAccBalance = currentAccBalance + (entry.entry_type === 'income' ? amountTry : -amountTry);
            accountBalances[entry.account_id] = newAccBalance;
            entryAccountBalance = newAccBalance;
        }
        currentTotalBalance = currentTotalBalance + (entry.entry_type === 'income' ? amountTry : -amountTry);
    }

    return {
      ...entry,
      accountBalance: entryAccountBalance,
      totalBalance: currentTotalBalance,
    };
  });

  const filteredEntriesWithBalance = entriesWithCalculatedBalances.filter(entry => {
    const matchesType = typeFilter === 'all' || entry.entry_type === typeFilter;
    const matchesSearch =
      entry.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesType && matchesSearch;
  });

  const totals = filteredEntriesWithBalance.reduce(
    (acc, entry) => {
      const amountTry = Number(entry.amount_reporting_try || entry.amount);
      if (entry.entry_type === 'income') {
        acc.income += amountTry;
      } else if (entry.entry_type === 'expense') {
        acc.expense += amountTry;
      }
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const netBalance = openingBalance + totals.income - totals.expense;

  const displayEntries = [...filteredEntriesWithBalance].sort(
    (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
  );

  const selectedAccount = accounts.find(a => a.id === newEntry.account_id);
  const accountCurrency = selectedAccount?.currency_code || currentSite?.default_currency || 'TRY';
  const hasCurrencyMismatch = newEntry.entry_type !== 'transfer' && (
    (selectedAccount && newEntry.currency_code !== accountCurrency) ||
    (unitDuesCurrency && newEntry.currency_code !== unitDuesCurrency)
  );
  const needsExchangeRate = hasCurrencyMismatch || newEntry.currency_code !== 'TRY';

  // --- HANDLE EXPORT ---
  const handleExport = () => {
    const exportData = displayEntries.map(entry => {
      const account = accounts.find(a => a.id === entry.account_id);
      const amountTry = Number(entry.amount_reporting_try || entry.amount);
      
      return {
        Date: format(new Date(entry.entry_date), 'dd.MM.yyyy'),
        Type: entry.entry_type === 'transfer' ? 'Transfer' : (entry.entry_type === 'income' ? 'Income' : 'Expense'),
        Category: entry.category,
        Description: entry.description,
        Account: account?.account_name || 'N/A',
        'Debit (Out)': entry.entry_type === 'expense' ? amountTry : 0,
        'Credit (In)': entry.entry_type === 'income' ? amountTry : 0,
        'Original Amount': entry.amount,
        'Currency': entry.currency_code,
        'Rate': entry.exchange_rate,
        'Account Balance': entry.accountBalance,
        'Global Balance': entry.totalBalance
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const wscols = [
      { wch: 12 }, 
      { wch: 10 }, 
      { wch: 20 }, 
      { wch: 30 }, 
      { wch: 20 }, 
      { wch: 12 }, 
      { wch: 12 }, 
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `Ledger_Export_${currentSite?.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ledger</h1>
          <p className="text-gray-600">Income and expense tracking</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/ledger/import')}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import from Excel
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Accounts</h2>
          {isAdmin && (
            <button
              onClick={() => {
                setEditingAccount(null);
                setShowAccountForm(true);
              }}
              className="flex items-center px-3 py-2 text-sm bg-[#002561] text-white rounded-lg hover:bg-[#003380]"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Account
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {accounts.map(account => (
            <div key={account.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center">
                  {account.account_type === 'bank' ? (
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mr-3">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center mr-3">
                      <Wallet className="w-5 h-5 text-green-600" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{account.account_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{account.account_type}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingAccount(account);
                        setShowAccountForm(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(account.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat('tr-TR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(account.current_balance)}
                </p>
                <span className="text-sm font-medium text-gray-600">{account.currency_code}</span>
              </div>
              {account.account_number && (
                <p className="text-xs text-gray-400 mt-1">{account.account_number}</p>
              )}
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-3 text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl">
              <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p>No accounts configured</p>
              <p className="text-sm">Add a bank or cash account to start tracking</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Period Income</span>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(totals.income)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Period Expenses</span>
            <TrendingDown className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {formatCurrency(totals.expense)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Net Balance</span>
            <Receipt className="w-5 h-5 text-[#002561]" />
          </div>
          <p className={`text-2xl font-bold mt-1 ${
            netBalance >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {formatCurrency(netBalance)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Opening: {formatCurrency(openingBalance)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] appearance-none bg-white"
              >
                {fiscalPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] appearance-none bg-white"
              >
                <option value="all">All Types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Account</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-red-600 uppercase w-28">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase w-28">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">Acc. Balance</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">Total Balance</th>
                {isAdmin && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isAdmin && (
                <>
                  <tr className="bg-blue-50/50">
                    <td className="px-4 py-2" colSpan={9}>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setNewEntry({ ...newEntry, entry_type: 'expense', category: budgetCategories[0]?.category_name || '', from_account_id: '', to_account_id: '' })}
                            className={`px-4 py-1.5 text-sm rounded font-medium ${
                              newEntry.entry_type === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            Expense
                          </button>
                          <button
                            onClick={() => setNewEntry({ ...newEntry, entry_type: 'income', category: budgetCategories[0]?.category_name || '', from_account_id: '', to_account_id: '' })}
                            className={`px-4 py-1.5 text-sm rounded font-medium ${
                              newEntry.entry_type === 'income' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            Income
                          </button>
                          <button
                            onClick={() => setNewEntry({ ...newEntry, entry_type: 'transfer', category: '', account_id: '', currency_code: 'TRY', exchange_rate: '1' })}
                            className={`px-4 py-1.5 text-sm rounded font-medium ${
                              newEntry.entry_type === 'transfer' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            Transfer
                          </button>
                        </div>
                        {newEntry.entry_type !== 'transfer' && (
                          <div className="flex items-center gap-2 ml-auto">
                            <label className="text-sm font-medium text-gray-600">Currency:</label>
                            <select
                              value={newEntry.currency_code}
                              onChange={(e) => setNewEntry({
                                ...newEntry,
                                currency_code: e.target.value,
                                exchange_rate: e.target.value === 'TRY' ? '1' : newEntry.exchange_rate
                              })}
                              className={`px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-[#002561] bg-white ${
                                hasCurrencyMismatch ? 'border-orange-400 bg-orange-50' : 'border-gray-300'
                              }`}
                            >
                              {SUPPORTED_CURRENCIES.map(curr => (
                                <option key={curr.code} value={curr.code}>
                                  {curr.symbol} {curr.code}
                                </option>
                              ))}
                            </select>
                            {selectedAccount && (
                              <span className="text-xs text-gray-500">
                                (Account: {accountCurrency})
                              </span>
                            )}
                            {needsExchangeRate && (
                              <>
                                <label className={`text-sm font-medium ml-2 ${hasCurrencyMismatch ? 'text-orange-600' : 'text-gray-600'}`}>
                                  Rate {hasCurrencyMismatch ? '(Required)' : ''}:
                                </label>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={newEntry.exchange_rate}
                                  onChange={(e) => setNewEntry({ ...newEntry, exchange_rate: e.target.value })}
                                  placeholder="Exchange rate"
                                  className={`w-24 px-2 py-1.5 text-sm border rounded focus:ring-2 text-right ${
                                    hasCurrencyMismatch
                                      ? 'border-orange-400 bg-orange-50 focus:ring-orange-500'
                                      : 'border-amber-400 bg-amber-50 focus:ring-amber-500'
                                  }`}
                                />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  {newEntry.entry_type === 'transfer' ? (
                    <tr className="bg-blue-50/50">
                      <td className="px-4 py-2">
                        <input type="date" value={newEntry.entry_date} onChange={e => setNewEntry({...newEntry, entry_date: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"/>
                      </td>
                      <td className="px-4 py-2" colSpan={2}>
                         <div className="flex gap-1">
                           <select value={newEntry.from_account_id} onChange={e => setNewEntry({...newEntry, from_account_id: e.target.value})} className="w-1/2 text-sm border rounded p-1"><option value="">From</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}</select>
                           <span>→</span>
                           <select value={newEntry.to_account_id} onChange={e => setNewEntry({...newEntry, to_account_id: e.target.value})} className="w-1/2 text-sm border rounded p-1"><option value="">To</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}</select>
                         </div>
                      </td>
                      <td className="px-4 py-2"><input type="text" placeholder="Desc" value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} className="w-full text-sm border rounded p-1" /></td>
                      <td className="px-4 py-2" colSpan={2}><input type="number" placeholder="Amount" value={newEntry.amount} onChange={e => setNewEntry({...newEntry, amount: e.target.value})} className="w-full text-sm border rounded p-1 text-right" /></td>
                      <td colSpan={2}></td>
                      <td className="px-4 py-2 text-center"><button onClick={handleAddEntry} className="p-1 bg-green-500 text-white rounded"><Save className="w-4 h-4"/></button></td>
                    </tr>
                  ) : (
                    <>
                    <tr className="bg-blue-50/50">
                        <td className="px-4 py-2"><input type="date" value={newEntry.entry_date} onChange={e => setNewEntry({...newEntry, entry_date: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"/></td>
                        <td className="px-4 py-2"><select value={newEntry.account_id} onChange={e => setNewEntry({...newEntry, account_id: e.target.value})} className="w-full text-sm border rounded p-1"><option value="">Account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}</select></td>
                        <td className="px-4 py-2"><select value={newEntry.category} onChange={e => setNewEntry({...newEntry, category: e.target.value})} className="w-full text-sm border rounded p-1"><option value="">Cat</option>{budgetCategories.map(c => <option key={c.id} value={c.category_name}>{c.category_name}</option>)}</select></td>
                        <td className="px-4 py-2"><input type="text" placeholder="Desc" value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} className="w-full text-sm border rounded p-1" /></td>
                        <td className="px-4 py-2"><input type="number" disabled={newEntry.entry_type !== 'expense'} value={newEntry.entry_type === 'expense' ? newEntry.amount : ''} onChange={e => setNewEntry({...newEntry, amount: e.target.value, entry_type: 'expense'})} className="w-full text-sm border rounded p-1 text-right" placeholder={newEntry.entry_type === 'expense' ? '0' : ''} /></td>
                        <td className="px-4 py-2"><input type="number" disabled={newEntry.entry_type !== 'income'} value={newEntry.entry_type === 'income' ? newEntry.amount : ''} onChange={e => setNewEntry({...newEntry, amount: e.target.value, entry_type: 'income'})} className="w-full text-sm border rounded p-1 text-right" placeholder={newEntry.entry_type === 'income' ? '0' : ''} /></td>
                        <td colSpan={2}></td>
                        <td className="px-4 py-2 text-center"><button onClick={handleAddEntry} className="p-1 bg-green-500 text-white rounded"><Save className="w-4 h-4"/></button></td>
                    </tr>
                    {(newEntry.category === 'Maintenance Fees' || newEntry.category === 'Extra Fees') && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={9} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Unit:</label>
                              <select value={newEntry.unit_id} onChange={async (e) => { const unitId = e.target.value; setNewEntry({ ...newEntry, unit_id: unitId }); if (unitId) { await fetchUnitDuesCurrency(unitId); } else { setUnitDuesCurrency(null); } }} className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white">
                                <option value="">Choose unit...</option>
                                {units.map(unit => (<option key={unit.id} value={unit.id}>{unit.block ? `${unit.block}-` : ''}{unit.unit_number} {unit.owner_name ? `(${unit.owner_name})` : ''}</option>))}
                              </select>
                            </div>
                          </td>
                        </tr>
                    )}
                    </>
                  )}
                </>
              )}

              {displayEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  accounts={accounts}
                  categories={budgetCategories}
                  units={units}
                  isEditing={editingRow === entry.id}
                  isAdmin={isAdmin}
                  formatCurrency={formatCurrency}
                  accountBalance={entry.accountBalance}
                  totalBalance={entry.totalBalance}
                  onEdit={() => setEditingRow(entry.id)}
                  onSave={(updates) => handleUpdateEntry(entry, updates)}
                  onCancel={() => setEditingRow(null)}
                  onDelete={() => handleDeleteEntry(entry.id)}
                />
              ))}
            </tbody>
          </table>
          {filteredEntriesWithBalance.length === 0 && (
            <div className="p-12 text-center">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No ledger entries found</p>
            </div>
          )}
        </div>
      </div>

      {showAccountForm && (
        <AccountFormModal
          account={editingAccount}
          onClose={() => {
            setShowAccountForm(false);
            setEditingAccount(null);
          }}
          onSave={handleSaveAccount}
        />
      )}
    </div>
  );
}

interface EntryRowProps {
  entry: LedgerEntry;
  accounts: Account[];
  categories: BudgetCategory[];
  units: Array<{ id: string; unit_number: string; block: string | null; owner_name: string | null }>;
  isEditing: boolean;
  isAdmin: boolean;
  formatCurrency: (amount: number) => string;
  accountBalance: number;
  totalBalance: number;
  onEdit: () => void;
  onSave: (updates: Partial<LedgerEntry>) => void;
  onCancel: () => void;
  onDelete: () => void;
}

function EntryRow({
  entry,
  accounts,
  categories,
  units,
  isEditing,
  isAdmin,
  formatCurrency,
  accountBalance,
  totalBalance,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: EntryRowProps) {
  const [editData, setEditData] = useState({
    entry_date: entry.entry_date,
    entry_type: entry.entry_type,
    account_id: entry.account_id || '',
    category: entry.category,
    description: entry.description || '',
    amount: entry.amount,
    unit_id: '',
  });

  const account = accounts.find(a => a.id === entry.account_id);
  const isMaintenanceRelated = editData.category === 'Maintenance Fees' || editData.category === 'Extra Fees';

  if (isEditing) {
    return (
      <>
        <tr className="bg-yellow-50">
          <td className="px-4 py-2">
            <input
              type="date"
              value={editData.entry_date}
              onChange={(e) => setEditData({ ...editData, entry_date: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#002561] bg-white"
            />
          </td>
          <td className="px-4 py-2">
            <select
              value={editData.account_id}
              onChange={(e) => setEditData({ ...editData, account_id: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#002561] bg-white"
            >
              <option value="">Select</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name}
                </option>
              ))}
            </select>
          </td>
          <td className="px-4 py-2">
            <select
              value={editData.category}
              onChange={(e) => setEditData({ ...editData, category: e.target.value, unit_id: '' })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#002561] bg-white"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.category_name}>{cat.category_name}</option>
              ))}
              <option value="Other">Other</option>
            </select>
          </td>
          <td className="px-4 py-2">
            <input
              type="text"
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#002561] bg-white"
            />
          </td>
          <td className="px-4 py-2">
            <input
              type="number"
              value={editData.entry_type === 'expense' ? editData.amount : ''}
              onChange={(e) => setEditData({ ...editData, amount: Number(e.target.value), entry_type: 'expense' })}
              placeholder="0"
              className="w-full px-2 py-1.5 text-sm border border-red-200 rounded focus:ring-2 focus:ring-red-400 bg-red-50/50 text-right text-red-600"
            />
          </td>
          <td className="px-4 py-2">
            <input
              type="number"
              value={editData.entry_type === 'income' ? editData.amount : ''}
              onChange={(e) => setEditData({ ...editData, amount: Number(e.target.value), entry_type: 'income' })}
              placeholder="0"
              className="w-full px-2 py-1.5 text-sm border border-green-200 rounded focus:ring-2 focus:ring-green-400 bg-green-50/50 text-right text-green-600"
            />
          </td>
          <td className="px-4 py-2 text-right text-sm text-gray-400">-</td>
          <td className="px-4 py-2 text-right text-sm text-gray-400">-</td>
          <td className="px-4 py-2">
            <div className="flex justify-center gap-1">
              <button
                onClick={() => {
                  let finalDescription = editData.description;
                  if (isMaintenanceRelated && editData.unit_id) {
                    const unit = units.find(u => u.id === editData.unit_id);
                    const unitLabel = unit ? `Unit ${unit.block ? `${unit.block}-` : ''}${unit.unit_number}` : '';
                    finalDescription = finalDescription ? `${unitLabel} - ${finalDescription}` : unitLabel;
                  }
                  onSave({
                    entry_date: editData.entry_date,
                    entry_type: editData.entry_type,
                    account_id: editData.account_id,
                    category: editData.category,
                    description: finalDescription,
                    amount: editData.amount,
                  });
                }}
                className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600"
                title="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 bg-gray-400 text-white rounded hover:bg-gray-500"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
        {isMaintenanceRelated && (
          <tr className="bg-yellow-50/50">
            <td colSpan={9} className="px-4 py-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Unit:</label>
                <select
                  value={editData.unit_id}
                  onChange={(e) => setEditData({ ...editData, unit_id: e.target.value })}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#002561] bg-white"
                >
                  <option value="">Choose unit...</option>
                  {units.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.block ? `${unit.block}-` : ''}{unit.unit_number} {unit.owner_name ? `(${unit.owner_name})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 italic">Note: Editing does not update unit payment records</p>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  const fromAccount = accounts.find(a => a.id === entry.from_account_id);
  const toAccount = accounts.find(a => a.id === entry.to_account_id);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
        {format(new Date(entry.entry_date), 'MMM d, yyyy')}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
        {entry.entry_type === 'transfer' ? (
          fromAccount && toAccount ? (
            <div className="flex items-center gap-1 text-xs">
              <div className="flex items-center">
                {fromAccount.account_type === 'bank' ? (
                  <Building2 className="w-3 h-3 text-blue-600 mr-1" />
                ) : (
                  <Wallet className="w-3 h-3 text-green-600 mr-1" />
                )}
                <span className="truncate">{fromAccount.account_name}</span>
              </div>
              <span className="text-gray-400">→</span>
              <div className="flex items-center">
                {toAccount.account_type === 'bank' ? (
                  <Building2 className="w-3 h-3 text-blue-600 mr-1" />
                ) : (
                  <Wallet className="w-3 h-3 text-green-600 mr-1" />
                )}
                <span className="truncate">{toAccount.account_name}</span>
              </div>
            </div>
          ) : (
            <span className="text-gray-400">Transfer</span>
          )
        ) : account ? (
          <div className="flex items-center">
            {account.account_type === 'bank' ? (
              <Building2 className="w-4 h-4 text-blue-600 mr-1.5" />
            ) : (
              <Wallet className="w-4 h-4 text-green-600 mr-1.5" />
            )}
            <span className="truncate">{account.account_name}</span>
          </div>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
        {entry.entry_type === 'transfer' ? (
          <span className="text-blue-600 font-medium">Transfer</span>
        ) : (
          entry.category
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        <p className="truncate max-w-xs">{entry.description || '-'}</p>
        {entry.vendor_name && (
          <p className="text-xs text-gray-400">Vendor: {entry.vendor_name}</p>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {entry.entry_type === 'expense' ? (
          <div>
            <span className="font-semibold text-red-600">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: entry.currency_code,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(entry.amount)}
            </span>
            {(entry.currency_code !== 'TRY' || entry.exchange_rate !== 1.0) && entry.exchange_rate !== null && (
              <p className="text-xs text-gray-400">
                {entry.currency_code !== 'TRY' ? (
                  <>= {formatCurrency(entry.amount_reporting_try)} @ {entry.exchange_rate}</>
                ) : (
                  <>@ {entry.exchange_rate} → {new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(entry.amount * entry.exchange_rate)} applied</>
                )}
              </p>
            )}
          </div>
        ) : entry.entry_type === 'transfer' ? (
          <span className="font-semibold text-blue-600">
            {formatCurrency(entry.amount)}
          </span>
        ) : (
          <span className="text-gray-300">-</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {entry.entry_type === 'income' ? (
          <div>
            <span className="font-semibold text-green-600">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: entry.currency_code,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(entry.amount)}
            </span>
            {(entry.currency_code !== 'TRY' || entry.exchange_rate !== 1.0) && entry.exchange_rate !== null && (
              <p className="text-xs text-gray-400">
                {entry.currency_code !== 'TRY' ? (
                  <>= {formatCurrency(entry.amount_reporting_try)} @ {entry.exchange_rate}</>
                ) : (
                  <>@ {entry.exchange_rate} → {new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(entry.amount * entry.exchange_rate)} applied</>
                )}
              </p>
            )}
          </div>
        ) : entry.entry_type === 'transfer' ? (
          <span className="font-semibold text-blue-600">
            {formatCurrency(entry.amount)}
          </span>
        ) : (
          <span className="text-gray-300">-</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {entry.entry_type === 'transfer' ? (
          <span className="text-gray-400">-</span>
        ) : (
          <span className={`font-medium ${accountBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatCurrency(accountBalance)}
          </span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <span className={`font-semibold ${totalBalance >= 0 ? 'text-[#002561]' : 'text-red-600'}`}>
          {formatCurrency(totalBalance)}
        </span>
      </td>
      {isAdmin && (
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex justify-center gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

interface AccountFormModalProps {
  account: Account | null;
  onClose: () => void;
  onSave: (data: Partial<Account>) => void;
}

function AccountFormModal({ account, onClose, onSave }: AccountFormModalProps) {
  const [formData, setFormData] = useState({
    account_name: account?.account_name || '',
    account_type: account?.account_type || 'bank' as 'bank' | 'cash',
    account_number: account?.account_number || '',
    initial_balance: account?.initial_balance || 0,
    currency_code: account?.currency_code || 'TRY',
  });

  const SUPPORTED_CURRENCIES = [
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  ];

  const handleSubmit = () => {
    if (!formData.account_name) return;
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">
            {account ? 'Edit Account' : 'Add Account'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Account Name *
            </label>
            <input
              type="text"
              value={formData.account_name}
              onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              placeholder="e.g., Main Bank Account"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Account Type *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, account_type: 'bank' })}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                  formData.account_type === 'bank'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <Building2 className="w-8 h-8 mb-2" />
                <span className="font-medium">Bank Account</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, account_type: 'cash' })}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                  formData.account_type === 'cash'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <Wallet className="w-8 h-8 mb-2" />
                <span className="font-medium">Cash</span>
              </button>
            </div>
          </div>

          {formData.account_type === 'bank' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Account Number (Optional)
              </label>
              <input
                type="text"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
                placeholder="e.g., TR12 3456 7890"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Currency *
            </label>
            <select
              value={formData.currency_code}
              onChange={(e) => setFormData({ ...formData, currency_code: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
            >
              {SUPPORTED_CURRENCIES.map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.code} - {curr.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Initial Balance ({formData.currency_code})
            </label>
            <input
              type="number"
              value={formData.initial_balance}
              onChange={(e) => setFormData({ ...formData, initial_balance: Number(e.target.value) })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              placeholder="0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Starting balance when creating this account
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.account_name}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50"
          >
            {account ? 'Update' : 'Add'} Account
          </button>
        </div>
      </div>
    </div>
  );
}