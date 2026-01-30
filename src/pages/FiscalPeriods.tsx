import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Calendar, Plus, Check, Clock, Archive, Loader2,
  AlertTriangle, ArrowRight, Edit2, Trash2, X, Receipt, DollarSign,
  List, Search
} from 'lucide-react';
import { format, addMonths, subDays } from 'date-fns';
import type { FiscalPeriod, BudgetCategory, LedgerEntry } from '../types/database';
import { EXPENSE_CATEGORIES } from '../lib/constants';

interface Account {
  id: string;
  account_name: string;
  account_type: 'bank' | 'cash';
  currency_code: string;
}

// Interface definitions for sub-components
interface CreatePeriodModalProps {
  siteId: string;
  onClose: () => void;
  onCreated: () => void;
}

interface RolloverModalProps {
  period: FiscalPeriod;
  siteId: string;
  onClose: () => void;
  onCompleted: () => void;
}

interface AddCategoryModalProps {
  periodId: string;
  existingCategories: BudgetCategory[];
  onClose: () => void;
  onAdded: () => void;
}

interface EditCategoryModalProps {
  category: BudgetCategory;
  onClose: () => void;
  onUpdated: () => void;
}

interface AddEntryModalProps {
  category: BudgetCategory;
  period: FiscalPeriod;
  siteId: string;
  userId: string;
  accounts: Account[];
  onClose: () => void;
  onAdded: () => void;
}

interface SetDuesModalProps {
  periodId: string;
  siteId: string;
  defaultCurrency: string;
  onClose: () => void;
  onSet: () => void;
}

interface ExtraFeeModalProps {
  siteId: string;
  activePeriodId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ManageDuesModalProps {
  periodId: string;
  siteId: string;
  onClose: () => void;
}

interface Unit {
  id: string;
  unit_number: string;
  owner_name: string | null;
}

const CURRENCIES = [
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
];

export default function FiscalPeriods() {
  const { currentSite, currentRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<FiscalPeriod | null>(null);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]); 
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showSetDuesModal, setShowSetDuesModal] = useState(false);
  const [showExtraFeeModal, setShowExtraFeeModal] = useState(false);
  const [showManageDuesModal, setShowManageDuesModal] = useState(false);

  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [addingEntryCategory, setAddingEntryCategory] = useState<BudgetCategory | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = currentRole?.role === 'admin';
  const activePeriod = periods.find(p => p.status === 'active');

  useEffect(() => {
    if (currentSite) {
      fetchPeriods();
      fetchAccounts();
    }
  }, [currentSite]);

  const fetchAccounts = async () => {
    if (!currentSite) return;
    const { data } = await supabase
      .from('accounts')
      .select('id, account_name, account_type, currency_code')
      .eq('site_id', currentSite.id)
      .eq('is_active', true);
    setAccounts(data || []);
  };

  const fetchPeriods = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('site_id', currentSite.id)
      .order('start_date', { ascending: false });

    setPeriods(data || []);
    setLoading(false);
  };

  const fetchPeriodDetails = async (periodId: string) => {
    const [catRes, entriesRes] = await Promise.all([
        supabase
          .from('budget_categories')
          .select('*')
          .eq('fiscal_period_id', periodId)
          .order('display_order'),
        supabase
          .from('ledger_entries')
          .select('*')
          .eq('fiscal_period_id', periodId)
    ]);

    setBudgetCategories(catRes.data || []);
    setLedgerEntries(entriesRes.data || []);
  };

  const handleSelectPeriod = (period: FiscalPeriod) => {
    setSelectedPeriod(period);
    fetchPeriodDetails(period.id);
  };

  const activatePeriod = async (periodId: string) => {
    setActionLoading(true);
    await supabase.rpc('generate_fiscal_period_dues', {
      p_fiscal_period_id: periodId,
    });
    await fetchPeriodDetails(periodId);
    await fetchPeriods();
    
    if (selectedPeriod?.id === periodId) {
      const { data } = await supabase.from('fiscal_periods').select('*').eq('id', periodId).single();
      if (data) setSelectedPeriod(data);
    }
    setActionLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const normalizeCategory = (str: string) => {
      return str.toLowerCase()
          .replace('communual', 'communal')
          .replace(/payments?|payment/g, '')
          .replace(/\s+/g, ' ')
          .trim();
  };

  const checkIsIncome = (name: string) => {
      const lower = name.toLowerCase().trim();
      const incomeKeywords = ['dues', 'aidat', 'revenue', 'interest', 'deposit', 'income'];
      if (incomeKeywords.some(k => lower.includes(k))) return true;
      if (lower.includes('maintenance') && lower.includes('fee')) return true;
      return false;
  };

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-[#002561]" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Periods</h1>
          <p className="text-gray-600">Manage budget cycles and year-end rollover</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!activePeriod) {
                    alert("You must have an 'Active' fiscal period to add fees.");
                    return;
                  }
                  setShowExtraFeeModal(true);
                }}
                className={`flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors ${!activePeriod ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!activePeriod}
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Add Extra Fee
              </button>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Period
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-semibold text-gray-900">All Periods</h3>
          {periods.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No financial periods yet</p>
              {isAdmin && <button onClick={() => setShowCreateModal(true)} className="mt-4 text-[#002561] font-medium hover:underline">Create your first period</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {periods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => handleSelectPeriod(period)}
                  className={`w-full p-4 rounded-xl border text-left transition-colors ${selectedPeriod?.id === period.id ? 'border-[#002561] bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{period.name}</span>
                    <StatusBadge status={period.status} />
                  </div>
                  <p className="text-sm text-gray-500">{format(new Date(period.start_date), 'MMM d, yyyy')} - {format(new Date(period.end_date), 'MMM d, yyyy')}</p>
                  <p className="text-sm font-medium text-[#002561] mt-1">{formatCurrency(period.total_budget)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedPeriod ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{selectedPeriod.name}</h3>
                    <p className="text-gray-500">{format(new Date(selectedPeriod.start_date), 'MMMM d, yyyy')} - {format(new Date(selectedPeriod.end_date), 'MMMM d, yyyy')}</p>
                  </div>
                  <StatusBadge status={selectedPeriod.status} large />
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-500">Total Budget</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(selectedPeriod.total_budget)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-500">Monthly Average</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(selectedPeriod.total_budget / 12)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Budget Breakdown</h4>
                    {isAdmin && selectedPeriod.status === 'draft' && <button onClick={() => setShowAddCategoryModal(true)} className="text-sm text-[#002561] hover:underline font-medium">+ Add Category</button>}
                  </div>
                 
                  {budgetCategories.length > 0 ? (
                    <div className="space-y-2">
                      {budgetCategories.map((cat) => {
                        const normCatName = normalizeCategory(cat.category_name);
                        const isIncome = checkIsIncome(cat.category_name);
                        const categoryActual = ledgerEntries
                            .filter(e => {
                                if (e.category === 'Transfer') return false;
                                const normEntryCat = normalizeCategory(e.category);
                                return normEntryCat === normCatName || normEntryCat.includes(normCatName) || normCatName.includes(normEntryCat);
                            })
                            .reduce((sum, e) => {
                                const val = Number(e.amount_reporting_try || e.amount);
                                return sum + (isIncome ? (e.entry_type === 'income' ? val : -val) : (e.entry_type === 'expense' ? val : -val));
                            }, 0);
                        const utilization = cat.planned_amount > 0 ? (categoryActual / cat.planned_amount) * 100 : 0;

                        return (
                          <div key={cat.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">{cat.category_name}</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500">{formatCurrency(categoryActual)} / {formatCurrency(cat.planned_amount)}</span>
                                {isAdmin && selectedPeriod.status === 'active' && <button onClick={() => setAddingEntryCategory(cat)} className="p-1.5 bg-[#002561] text-white rounded hover:bg-[#003380] transition-colors"><Plus className="w-3.5 h-3.5" /></button>}
                                {isAdmin && selectedPeriod.status === 'draft' && (
                                  <div className="flex items-center space-x-1">
                                    <button onClick={() => setEditingCategory(cat)} className="p-1 text-[#002561] hover:bg-white rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={async () => { if (confirm(`Delete "${cat.category_name}"?`)) { await supabase.from('budget_categories').delete().eq('id', cat.id); fetchPeriodDetails(selectedPeriod.id); }}} className="p-1 text-red-600 hover:bg-white rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${utilization > 100 ? 'bg-red-500' : 'bg-[#002561]'}`} style={{ width: `${Math.min(utilization, 100)}%` }} />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{utilization.toFixed(1)}% {isIncome ? 'collected' : 'utilized'}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-gray-500 text-center py-4">No budget categories added yet</p>}
                </div>

                {isAdmin && selectedPeriod.status === 'draft' && (
                  <div className="flex items-center space-x-3">
                    <button onClick={() => activatePeriod(selectedPeriod.id)} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />} Activate Period
                    </button>
                  </div>
                )}

                {isAdmin && selectedPeriod.status === 'active' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <Receipt className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div><p className="font-medium text-blue-900">Monthly Dues Setup</p><p className="text-sm text-blue-700 mt-1">Set monthly due amounts for all units in this period.</p></div>
                      </div>
                      <div className="flex gap-2">
                        {/* ✅ MANAGE DEBTS BUTTON */}
                        <button onClick={() => setShowManageDuesModal(true)} className="px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap flex items-center">
                          <List className="w-4 h-4 mr-2"/> Manage Debts
                        </button>
                        <button onClick={() => setShowSetDuesModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">Set Dues</button>
                      </div>
                    </div>
                  </div>
                )}

                {isAdmin && selectedPeriod.status === 'active' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div><p className="font-medium text-orange-900">Year-End Closing</p><p className="text-sm text-orange-700 mt-1">Transfer balances to the next period.</p><button onClick={() => setShowRolloverModal(true)} className="mt-3 text-orange-700 font-medium hover:underline flex items-center">Perform Rollover <ArrowRight className="w-4 h-4 ml-1" /></button></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center"><Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Select a financial period to view details</p></div>}
        </div>
      </div>

      {/* MODALS */}
      {showCreateModal && currentSite && <CreatePeriodModal siteId={currentSite.id} onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); fetchPeriods(); }} />}
      {showRolloverModal && selectedPeriod && currentSite && <RolloverModal period={selectedPeriod} siteId={currentSite.id} onClose={() => setShowRolloverModal(false)} onCompleted={() => { setShowRolloverModal(false); fetchPeriods(); }} />}
      {showAddCategoryModal && selectedPeriod && <AddCategoryModal periodId={selectedPeriod.id} existingCategories={budgetCategories} onClose={() => setShowAddCategoryModal(false)} onAdded={() => { setShowAddCategoryModal(false); fetchPeriodDetails(selectedPeriod.id); }} />}
      {editingCategory && selectedPeriod && <EditCategoryModal category={editingCategory} onClose={() => setEditingCategory(null)} onUpdated={() => { setEditingCategory(null); fetchPeriodDetails(selectedPeriod.id); }} />}
      {addingEntryCategory && selectedPeriod && currentSite && user && <AddEntryModal category={addingEntryCategory} period={selectedPeriod} siteId={currentSite.id} userId={user.id} accounts={accounts} onClose={() => setAddingEntryCategory(null)} onAdded={() => { setAddingEntryCategory(null); fetchPeriodDetails(selectedPeriod.id); }} />}
      {showSetDuesModal && selectedPeriod && currentSite && <SetDuesModal periodId={selectedPeriod.id} siteId={currentSite.id} defaultCurrency={currentSite.default_currency || 'TRY'} onClose={() => setShowSetDuesModal(false)} onSet={() => { setShowSetDuesModal(false); fetchPeriods(); fetchPeriodDetails(selectedPeriod.id); }} />}
      
      {showExtraFeeModal && currentSite && activePeriod && (
        <ExtraFeeModal 
          siteId={currentSite.id} 
          activePeriodId={activePeriod.id} 
          onClose={() => setShowExtraFeeModal(false)} 
          onSuccess={() => {
            setShowExtraFeeModal(false);
            fetchPeriodDetails(activePeriod.id);
          }}
        />
      )}

      {/* ✅ MANAGE DUES MODAL */}
      {showManageDuesModal && selectedPeriod && currentSite && (
        <ManageDuesModal
          periodId={selectedPeriod.id}
          siteId={currentSite.id}
          onClose={() => setShowManageDuesModal(false)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, large = false }: { status: string; large?: boolean }) {
  const config: Record<string, { icon: any; color: string; label: string }> = {
    draft: { icon: Clock, color: 'bg-gray-100 text-gray-700', label: 'Draft' },
    active: { icon: Check, color: 'bg-green-100 text-green-700', label: 'Active' },
    closed: { icon: Archive, color: 'bg-blue-100 text-blue-700', label: 'Closed' },
  };
  const item = config[status] || { icon: Clock, color: 'bg-gray-100 text-gray-700', label: status };
  const Icon = item.icon;
  return (<span className={`inline-flex items-center rounded-full ${item.color} ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}><Icon className={`${large ? 'w-4 h-4 mr-1.5' : 'w-3 h-3 mr-1'}`} />{item.label}</span>);
}

function CreatePeriodModal({ siteId, onClose, onCreated }: CreatePeriodModalProps) {
  const [loading, setLoading] = useState(false);
  const [startMonth, setStartMonth] = useState(new Date().getMonth() + 1);
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [totalBudget, setTotalBudget] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    EXPENSE_CATEGORIES.slice(0, 6) as unknown as string[]
  );

  const handleCreate = async () => {
    setLoading(true);
    const startDate = new Date(startYear, startMonth - 1, 1);
    const endDate = subDays(addMonths(startDate, 12), 1); 
    const periodName = `${format(startDate, 'MMM yyyy')} - ${format(endDate, 'MMM yyyy')}`;

    const { data: period, error } = await supabase.from('fiscal_periods').insert({
        site_id: siteId, name: periodName, start_date: format(startDate, 'yyyy-MM-dd'), end_date: format(endDate, 'yyyy-MM-dd'), total_budget: totalBudget, status: 'draft',
      }).select().single();

    if (!error && period && selectedCategories.length > 0) {
      const categoryAmount = totalBudget > 0 ? Math.floor(totalBudget / selectedCategories.length) : 0;
      const categoriesData = selectedCategories.map((cat, idx) => ({ fiscal_period_id: period.id, category_name: cat, planned_amount: categoryAmount, display_order: idx }));
      await supabase.from('budget_categories').insert(categoriesData);
    }
    setLoading(false);
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"><div className="p-6 border-b border-gray-100"><h3 className="text-xl font-semibold text-gray-900">Create Financial Period</h3></div><div className="p-6 space-y-6"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Start Month</label><select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]">{Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{format(new Date(2000, i), 'MMMM')}</option>))}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Start Year</label><select value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]">{Array.from({ length: 5 }, (_, i) => { const year = new Date().getFullYear() + i - 1; return <option key={year} value={year}>{year}</option>; })}</select></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Total Budget (TRY)</label><input type="number" value={totalBudget || ''} onChange={(e) => setTotalBudget(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]" placeholder="e.g., 500000" /></div><div><label className="block text-sm font-medium text-gray-700 mb-2">Budget Categories</label><div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">{EXPENSE_CATEGORIES.map((cat) => (<label key={cat} className={`flex items-center p-2 rounded-lg border cursor-pointer transition-colors ${selectedCategories.includes(cat) ? 'border-[#002561] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}><input type="checkbox" checked={selectedCategories.includes(cat)} onChange={(e) => { if (e.target.checked) { setSelectedCategories([...selectedCategories, cat]); } else { setSelectedCategories(selectedCategories.filter(c => c !== cat)); } }} className="w-4 h-4 text-[#002561] rounded" /><span className="ml-2 text-sm">{cat}</span></label>))}</div></div></div><div className="p-6 border-t border-gray-100 flex justify-end space-x-3"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">Cancel</button><button type="button" onClick={handleCreate} disabled={loading} className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50">{loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Create Period</button></div></div></div>
  );
}

function RolloverModal({ period, siteId, onClose, onCompleted }: RolloverModalProps) {
  const [loading, setLoading] = useState(false);
  const [newPeriodId, setNewPeriodId] = useState('');
  const [availablePeriods, setAvailablePeriods] = useState<FiscalPeriod[]>([]);
  useEffect(() => { fetchAvailablePeriods(); }, []);
  const fetchAvailablePeriods = async () => {
    const { data } = await supabase.from('fiscal_periods').select('*').eq('site_id', siteId).eq('status', 'draft').gt('start_date', period.end_date);
    setAvailablePeriods(data || []);
    if (data && data.length > 0) { setNewPeriodId(data[0].id); }
  };
  const handleRollover = async () => {
    if (!newPeriodId) return;
    setLoading(true);
    await supabase.rpc('perform_fiscal_year_rollover', { p_closing_period_id: period.id, p_new_period_id: newPeriodId });
    setLoading(false);
    onCompleted();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-xl max-w-lg w-full"><div className="p-6 border-b border-gray-100"><h3 className="text-xl font-semibold text-gray-900">Year-End Rollover</h3><p className="text-gray-500 mt-1">Transfer balances to the next financial period</p></div><div className="p-6 space-y-6"><div className="bg-orange-50 border border-orange-200 rounded-xl p-4"><div className="flex items-start space-x-3"><AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" /><div className="text-sm text-orange-700"><p className="font-medium text-orange-900 mb-1">This action will:</p><ul className="list-disc list-inside space-y-1"><li>Close the current period: {period.name}</li><li>Transfer outstanding debts to the new period</li><li>Preserve legal action statuses (Icra)</li><li>Create "Previous Period Balance" entries</li></ul></div></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Transfer to Period</label>{availablePeriods.length > 0 ? (<select value={newPeriodId} onChange={(e) => setNewPeriodId(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]">{availablePeriods.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}</select>) : (<p className="text-gray-500 text-sm">No draft periods available. Please create a new financial period first.</p>)}</div></div><div className="p-6 border-t border-gray-100 flex justify-end space-x-3"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">Cancel</button><button type="button" onClick={handleRollover} disabled={loading || !newPeriodId} className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">{loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Perform Rollover</button></div></div></div>
  );
}

function AddCategoryModal({ periodId, existingCategories, onClose, onAdded }: AddCategoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [plannedAmount, setPlannedAmount] = useState(0);
  const handleAdd = async () => {
    if (!categoryName.trim()) return;
    setLoading(true);
    const maxOrder = existingCategories.length > 0 ? Math.max(...existingCategories.map(c => c.display_order)) : -1;
    await supabase.from('budget_categories').insert({ fiscal_period_id: periodId, category_name: categoryName.trim(), planned_amount: plannedAmount, actual_amount: 0, display_order: maxOrder + 1 });
    setLoading(false);
    onAdded();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-xl max-w-md w-full"><div className="p-6 border-b border-gray-100 flex items-center justify-between"><h3 className="text-xl font-semibold text-gray-900">Add Budget Category</h3><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button></div><div className="p-6 space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Category Name</label><input type="text" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" placeholder="e.g., Maintenance" autoFocus /></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Planned Amount (TRY)</label><input type="number" value={plannedAmount || ''} onChange={(e) => setPlannedAmount(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" placeholder="0" /></div></div><div className="p-6 border-t border-gray-100 flex justify-end space-x-3"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors">Cancel</button><button type="button" onClick={handleAdd} disabled={loading || !categoryName.trim()} className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors">{loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add Category</button></div></div></div>
  );
}

function EditCategoryModal({ category, onClose, onUpdated }: EditCategoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [categoryName, setCategoryName] = useState(category.category_name);
  const [plannedAmount, setPlannedAmount] = useState(category.planned_amount);
  const handleUpdate = async () => {
    if (!categoryName.trim()) return;
    setLoading(true);
    await supabase.from('budget_categories').update({ category_name: categoryName.trim(), planned_amount: plannedAmount }).eq('id', category.id);
    setLoading(false);
    onUpdated();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-xl max-w-md w-full"><div className="p-6 border-b border-gray-100 flex items-center justify-between"><h3 className="text-xl font-semibold text-gray-900">Edit Budget Category</h3><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button></div><div className="p-6 space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Category Name</label><input type="text" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" placeholder="e.g., Maintenance" autoFocus /></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Planned Amount (TRY)</label><input type="number" value={plannedAmount || ''} onChange={(e) => setPlannedAmount(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" placeholder="0" /></div><div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500"><span className="font-medium">Actual spent:</span>{' '}{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(category.actual_amount)}</p></div></div><div className="p-6 border-t border-gray-100 flex justify-end space-x-3"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors">Cancel</button><button type="button" onClick={handleUpdate} disabled={loading || !categoryName.trim()} className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors">{loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Update Category</button></div></div></div>
  );
}

function AddEntryModal({ category, period, siteId, userId, accounts, onClose, onAdded }: AddEntryModalProps) {
  const [loading, setLoading] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountId, setAccountId] = useState('');
  const handleAdd = async () => {
    if (!amount || !accountId) return;
    setLoading(true);
    const amountValue = Number(amount);
    await supabase.from('ledger_entries').insert({ site_id: siteId, fiscal_period_id: period.id, entry_type: entryType, category: category.category_name, description: description || null, amount: amountValue, currency_code: 'TRY', exchange_rate: 1.0, amount_reporting_try: amountValue, entry_date: entryDate, account_id: accountId, created_by: userId });
    setLoading(false);
    onAdded();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-xl max-w-md w-full"><div className="p-6 border-b border-gray-100 flex items-center justify-between"><div><h3 className="text-xl font-semibold text-gray-900">Add Entry</h3><p className="text-sm text-gray-500 mt-0.5">Category: <span className="font-medium text-gray-700">{category.category_name}</span></p></div><button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button></div><div className="p-6 space-y-4"><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setEntryType('expense')} className={`p-3 rounded-xl border-2 text-center transition-all ${entryType === 'expense' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}><Receipt className="w-5 h-5 mx-auto mb-1" /><span className="text-sm font-medium">Expense</span></button><button type="button" onClick={() => setEntryType('income')} className={`p-3 rounded-xl border-2 text-center transition-all ${entryType === 'income' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}><Receipt className="w-5 h-5 mx-auto mb-1" /><span className="text-sm font-medium">Income</span></button></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Account *</label><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent ${!accountId ? 'border-amber-400' : 'border-gray-300'}`}><option value="">Select account</option>{accounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.account_type === 'bank' ? 'Bank' : 'Cash'}: {acc.account_name} ({acc.currency_code})</option>))}</select>{accounts.length === 0 && (<p className="text-xs text-amber-600 mt-1">No accounts configured. Please add an account in the Ledger first.</p>)}</div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (TRY) *</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" placeholder="0" autoFocus /></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label><input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent" placeholder="Optional description..." /></div></div><div className="p-6 border-t border-gray-100 flex justify-end space-x-3"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors">Cancel</button><button type="button" onClick={handleAdd} disabled={loading || !amount || !accountId} className={`flex items-center px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors ${entryType === 'expense' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>{loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add {entryType === 'expense' ? 'Expense' : 'Income'}</button></div></div></div>
  );
}

function SetDuesModal({ periodId, siteId, defaultCurrency, onClose, onSet }: SetDuesModalProps) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'uniform' | 'individual'>('uniform');
  const [uniformAmount, setUniformAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitAmounts, setUnitAmounts] = useState<Record<string, string>>({});
  useEffect(() => { fetchUnits(); }, []);
  const fetchUnits = async () => {
    const { data } = await supabase.from('units').select('id, unit_number, owner_name').eq('site_id', siteId).order('unit_number');
    if (data) {
      setUnits(data);
      const amounts: Record<string, string> = {};
      data.forEach(unit => { amounts[unit.id] = ''; });
      setUnitAmounts(amounts);
    }
  };
  const handleSetUniform = async () => {
    if (!uniformAmount || Number(uniformAmount) < 0) return;
    setLoading(true);
    const { error } = await supabase.rpc('set_all_units_monthly_due', { p_fiscal_period_id: periodId, p_monthly_amount: Number(uniformAmount), p_currency_code: currency });
    if (error) { console.error('Error setting dues:', error); alert('Failed to set dues. Please try again.'); } else { alert('Monthly dues updated! Recalculating ledger...'); }
    setLoading(false); onSet();
  };
  const handleSetIndividual = async () => {
    const unitData = Object.entries(unitAmounts).filter(([_, amount]) => amount && Number(amount) >= 0).map(([unitId, amount]) => ({ unit_id: unitId, monthly_amount: Number(amount) }));
    if (unitData.length === 0) { alert('Please enter at least one valid amount.'); return; }
    setLoading(true);
    const { error } = await supabase.rpc('set_varied_unit_monthly_dues', { p_fiscal_period_id: periodId, p_unit_amounts: unitData, p_currency_code: currency });
    if (error) { console.error('Error setting dues:', error); alert('Failed to set dues. Please try again.'); } else { alert(`Updated ${unitData.length} units! Recalculating ledger...`); }
    setLoading(false); onSet();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"><div className="p-6 border-b border-gray-100"><h3 className="text-xl font-semibold text-gray-900">Set Monthly Dues</h3><p className="text-sm text-gray-500 mt-1">Configure the monthly due amounts for units in this fiscal period</p></div><div className="p-6 space-y-6 overflow-y-auto flex-1"><div><label className="block text-sm font-medium text-gray-700 mb-2">Currency</label><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">{CURRENCIES.map((curr) => (<option key={curr.code} value={curr.code}>{curr.symbol} {curr.name} ({curr.code})</option>))}</select><p className="text-xs text-gray-500 mt-1">Monthly dues will be recorded in this currency</p></div><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setMode('uniform')} className={`p-4 rounded-xl border-2 text-center transition-all ${mode === 'uniform' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}><div className="font-medium">Same for All</div><div className="text-xs mt-1">Set one amount for all units</div></button><button type="button" onClick={() => setMode('individual')} className={`p-4 rounded-xl border-2 text-center transition-all ${mode === 'individual' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}><div className="font-medium">Individual</div><div className="text-xs mt-1">Set different amounts per unit</div></button></div>{mode === 'uniform' ? (<div><label className="block text-sm font-medium text-gray-700 mb-2">Monthly Amount ({currency})</label><input type="number" value={uniformAmount} onChange={(e) => setUniformAmount(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg" placeholder="e.g., 2100" autoFocus /><p className="text-sm text-gray-500 mt-2">This amount will be set for all {units.length} units</p></div>) : (<div className="space-y-3"><label className="block text-sm font-medium text-gray-700">Set amounts for each unit</label><div className="max-h-96 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3">{units.map((unit) => (<div key={unit.id} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg"><div className="flex-1"><div className="font-medium text-gray-900">Unit {unit.unit_number}</div>{unit.owner_name && (<div className="text-xs text-gray-500">{unit.owner_name}</div>)}</div><input type="number" value={unitAmounts[unit.id]} onChange={(e) => setUnitAmounts({ ...unitAmounts, [unit.id]: e.target.value })} className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={currency} /></div>))}</div></div>)}</div><div className="p-6 border-t border-gray-100 flex justify-end space-x-3"><button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors">Cancel</button><button type="button" onClick={mode === 'uniform' ? handleSetUniform : handleSetIndividual} disabled={loading || (mode === 'uniform' ? !uniformAmount : false)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">{loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Set Dues</button></div></div></div>
  );
}

// --- UPDATED EXTRA FEE MODAL WITH REPLACE OPTION ---
function ExtraFeeModal({ siteId, activePeriodId, onClose, onSuccess }: ExtraFeeModalProps) {
  const [loading, setLoading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false); // ✅ New State
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency_code: 'TRY',
    due_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;
    
    let confirmMessage = `Are you sure you want to add a debt of ${formData.amount} ${formData.currency_code} to ALL units?`;
    if (replaceExisting) {
      confirmMessage = `⚠️ WARNING: You are about to DELETE all existing debts with the title "${formData.description}" (Paid & Unpaid) and create new ones.\n\nAre you sure you want to proceed?`;
    }

    if(!confirm(confirmMessage)) return;

    setLoading(true);
    try {
      // 1. (Optional) Delete Existing
      if (replaceExisting) {
        const { error: deleteError } = await supabase
          .from('dues')
          .delete()
          .eq('fiscal_period_id', activePeriodId)
          .eq('description', formData.description); // Only matches exact title
        
        if (deleteError) throw deleteError;
      }

      // 2. Get all units
      const { data: units, error: unitError } = await supabase
        .from('units')
        .select('id')
        .eq('site_id', siteId);

      if (unitError) throw unitError;
      if (!units || units.length === 0) throw new Error('No units found');

      // 3. Prepare inserts
      const duesInserts = units.map(unit => ({
        unit_id: unit.id,
        fiscal_period_id: activePeriodId,
        month_date: formData.due_date,
        due_date: formData.due_date,
        base_amount: Number(formData.amount),
        currency_code: formData.currency_code,
        status: 'pending',
        description: formData.description
      }));

      // 4. Batch insert
      const { error: insertError } = await supabase
        .from('dues')
        .insert(duesInserts);

      if (insertError) { 
        if (insertError.code === '23505') {
          throw new Error('A debt already exists for this exact date/unit. Try checking "Delete existing" or change the date.'); 
        }
        throw insertError; 
      }

      alert('Extra fees processed successfully!');
      onSuccess(); 
      onClose();

    } catch (error: any) {
      console.error('Error:', error);
      alert(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border-t-4 border-amber-500">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Add One-Time Extra Fee
          </h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description / Title</label>
            <input 
              type="text" 
              required 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500" 
              placeholder="e.g., Roof Repair 2024" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Per Unit)</label>
              <input 
                type="number" 
                required 
                value={formData.amount} 
                onChange={e => setFormData({...formData, amount: e.target.value})} 
                className="w-full px-3 py-2 border rounded-lg" 
                placeholder="0.00" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select 
                value={formData.currency_code} 
                onChange={e => setFormData({...formData, currency_code: e.target.value})} 
                className="w-full px-3 py-2 border rounded-lg"
              >
                {CURRENCIES.map(curr => (
                  <option key={curr.code} value={curr.code}>{curr.code}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input 
              type="date" 
              required 
              value={formData.due_date} 
              onChange={e => setFormData({...formData, due_date: e.target.value})} 
              className="w-full px-3 py-2 border rounded-lg" 
            />
          </div>

          {/* ✅ REPLACEMENT CHECKBOX */}
          <div className="bg-red-50 p-3 rounded-lg border border-red-100">
            <label className="flex items-start cursor-pointer">
              <input 
                type="checkbox" 
                checked={replaceExisting}
                onChange={e => setReplaceExisting(e.target.checked)}
                className="mt-1 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <span className="ml-2 text-sm text-red-800">
                <strong>Overwrite Mode:</strong> Delete ANY existing fees (even paid ones) that match this Description ("{formData.description || '... '}") before adding new ones.
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600">Cancel</button>
            <button 
              type="submit" 
              disabled={loading}
              className={`flex items-center px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors ${
                replaceExisting ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {replaceExisting ? 'Replace Debts' : 'Create Debts'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ✅ NEW MANAGE DUES MODAL COMPONENT (Allows Deleting PAID items)
function ManageDuesModal({ periodId, siteId, onClose }: ManageDuesModalProps) {
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { fetchDebts(); }, []);

  const fetchDebts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('dues')
      .select('*, units(unit_number, owner_name)')
      .eq('fiscal_period_id', periodId)
      .order('month_date', { ascending: false });
    setDebts(data || []);
    setLoading(false);
  };

  const handleDelete = async (id: string, isPaid: boolean) => {
    if (isPaid) {
      if (!confirm('⚠️ WARNING: This debt is marked as PAID or PARTIALLY PAID.\n\nDeleting it will NOT refund the payment, but it will remove the debt record.\n\nAre you absolutely sure you want to delete it?')) return;
    } else {
      if (!confirm('Are you sure you want to delete this debt?')) return;
    }
    
    const { error } = await supabase.from('dues').delete().eq('id', id);
    if (error) alert('Failed to delete. (Check console for foreign key errors)');
    else fetchDebts();
  };

  // ✅ NEW: Delete All Logic (Unrestricted)
  const handleDeleteAll = async () => {
    if (!confirm('⚠️ DANGER: This will delete ALL debts in this period (both PAID and UNPAID).\n\nUse this only if you need a hard reset of billing data.\n\nAre you sure?')) return;
    if (!confirm('Last Warning: This cannot be undone. Type OK to proceed.')) return;

    setLoading(true);
    const { error } = await supabase
      .from('dues')
      .delete()
      .eq('fiscal_period_id', periodId);

    if (error) alert('Failed to delete debts. Maybe some are linked to other records? Check console.');
    else {
      alert('All debts for this period have been deleted.');
      fetchDebts();
    }
    setLoading(false);
  };

  const filteredDebts = debts.filter(d => 
    d.description?.toLowerCase().includes(filter.toLowerCase()) || 
    d.units?.unit_number?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-gray-900">Manage Dues</h3>
          <div className="flex gap-2">
             {/* ✅ DELETE ALL BUTTON (Unrestricted) */}
             <button onClick={handleDeleteAll} className="flex items-center px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium">
               <Trash2 className="w-4 h-4 mr-1"/> Delete ALL
             </button>
             <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
        </div>
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input 
              type="text" 
              placeholder="Search by unit or description..." 
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-3">Unit</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-right">Paid</th>
                <th className="px-6 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600"/></td></tr>
              ) : filteredDebts.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">Unit {d.units?.unit_number}</td>
                  <td className="px-6 py-3 text-gray-500">{format(new Date(d.month_date), 'dd MMM yyyy')}</td>
                  <td className="px-6 py-3">{d.description || 'Monthly Due'}</td>
                  <td className="px-6 py-3 text-right font-medium">{d.base_amount} {d.currency_code}</td>
                  <td className={`px-6 py-3 text-right ${d.paid_amount > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                    {d.paid_amount > 0 ? d.paid_amount : '-'}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {/* ✅ DELETE INDIVIDUAL (Unrestricted) */}
                    <button onClick={() => handleDelete(d.id, d.paid_amount > 0)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title={d.paid_amount > 0 ? "Warning: Paid" : "Delete"}>
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}