import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Home, Search, Plus, Loader2, ChevronDown, Edit2,
  User, Phone, Mail, Building2, ChevronRight, Calendar, Receipt, DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Unit, UnitType, UnitBalance } from '../types/database';

export default function Units() {
  const { currentSite, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<(Unit & { balance?: UnitBalance })[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  
  const [unitDetails, setUnitDetails] = useState<{
    dues: Array<{ 
      id: string; 
      month_date: string; 
      total_amount: number; 
      paid_amount: number; 
      status: string; 
      currency_code: string; 
      description?: string // Added description field
    }>;
    payments: Array<{ id: string; amount: number; payment_date: string; payment_method: string; reference_no: string | null; description: string | null; currency_code: string; exchange_rate: number }>;
  } | null>(null);
  
  const [loadingDetails, setLoadingDetails] = useState(false);

  const isAdmin = currentRole?.role === 'admin';
  const blocks = [...new Set(units.map(u => u.block).filter(Boolean))];

  useEffect(() => {
    if (currentSite) {
      fetchData();
    }
  }, [currentSite]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    const [unitsRes, typesRes, balancesRes] = await Promise.all([
      supabase
        .from('units')
        .select('*, unit_type:unit_types(*)')
        .eq('site_id', currentSite.id)
        .order('block')
        .order('unit_number'),
      supabase
        .from('unit_types')
        .select('*')
        .eq('site_id', currentSite.id),
      supabase
        .from('unit_balances_from_ledger')
        .select('*')
        .eq('site_id', currentSite.id),
    ]);

    const balanceMap = new Map(
      (balancesRes.data || []).map(b => [b.unit_id, b])
    );

    const unitsWithBalance = (unitsRes.data || []).map(u => ({
      ...u,
      balance: balanceMap.get(u.id),
    }));

    setUnits(unitsWithBalance);
    setUnitTypes(typesRes.data || []);
    setLoading(false);
  };

  const formatCurrency = (amount: number, currencyCode: string = 'TRY') => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const fetchUnitDetails = async (unitId: string) => {
    setLoadingDetails(true);

    const paymentIdsRes = await supabase
      .from('payments')
      .select('id')
      .eq('unit_id', unitId);

    const paymentIds = (paymentIdsRes.data || []).map(p => p.id);

    const [duesRes, ledgerRes] = await Promise.all([
      supabase
        .from('dues')
        // Updated to select 'description'
        .select('id, month_date, total_amount, paid_amount, status, currency_code, description')
        .eq('unit_id', unitId)
        .order('month_date', { ascending: false }),
      paymentIds.length > 0
        ? supabase
            .from('ledger_entries')
            .select('id, amount, entry_date, description, payment_id, exchange_rate, currency_code, payments(payment_date, payment_method, reference_no, amount, currency_code)')
            .eq('entry_type', 'income')
            .in('payment_id', paymentIds)
            .not('payment_id', 'is', null)
            .order('entry_date', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const formattedPayments = (ledgerRes.data || []).map(entry => ({
      id: entry.id,
      amount: entry.payments?.amount || entry.amount,
      payment_date: entry.payments?.payment_date || entry.entry_date,
      payment_method: entry.payments?.payment_method || 'bank_transfer',
      reference_no: entry.payments?.reference_no || null,
      description: entry.description,
      currency_code: entry.payments?.currency_code || entry.currency_code || 'TRY',
      exchange_rate: entry.exchange_rate || 1,
    }));

    setUnitDetails({
      dues: duesRes.data || [],
      payments: formattedPayments,
    });
    setLoadingDetails(false);
  };

  const toggleUnitExpansion = (unitId: string) => {
    if (expandedUnit === unitId) {
      setExpandedUnit(null);
      setUnitDetails(null);
    } else {
      setExpandedUnit(unitId);
      fetchUnitDetails(unitId);
    }
  };

  const filteredUnits = units.filter(unit => {
    const matchesSearch =
      unit.unit_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      unit.owner_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesBlock = !blockFilter || unit.block === blockFilter;

    return matchesSearch && matchesBlock;
  });

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
          <h1 className="text-2xl font-bold text-gray-900">Units</h1>
          <p className="text-gray-600">{units.length} units in this site</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setSelectedUnit(null);
              setShowEditModal(true);
            }}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Unit
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by unit number or owner..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
            />
          </div>
          {blocks.length > 0 && (
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={blockFilter}
                onChange={(e) => setBlockFilter(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561] appearance-none bg-white"
              >
                <option value="">All Blocks</option>
                {blocks.map((block) => (
                  <option key={block} value={block!}>
                    Block {block}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>

        {filteredUnits.length === 0 ? (
          <div className="p-12 text-center">
            <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No units found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUnits.map((unit) => {
                  const balance = unit.balance?.current_balance || 0;
                  const isExpanded = expandedUnit === unit.id;

                  return (
                    <>
                      <tr key={unit.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <button
                              onClick={() => toggleUnitExpansion(unit.id)}
                              className="mr-2 text-gray-400 hover:text-[#002561]"
                            >
                              <ChevronRight
                                className={`w-4 h-4 transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              />
                            </button>
                            <div className="w-10 h-10 rounded-lg bg-[#002561]/10 flex items-center justify-center mr-3">
                              <Home className="w-5 h-5 text-[#002561]" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {unit.block ? `${unit.block}-` : ''}{unit.unit_number}
                              </p>
                              {unit.floor && (
                                <p className="text-sm text-gray-500">Floor {unit.floor}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">
                            {unit.owner_name || 'Not assigned'}
                          </p>
                          {unit.owner_phone && (
                            <p className="text-sm text-gray-500">{unit.owner_phone}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {unit.unit_type?.name || 'Standard'}
                            {unit.unit_type?.coefficient !== 1 && (
                              <span className="ml-1 text-gray-500">
                                ({unit.unit_type?.coefficient}x)
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {balance !== 0 && (
                            <span
                              className={`font-semibold ${
                                balance > 0 ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              {formatCurrency(Math.abs(balance), currentSite?.default_currency || 'TRY')}
                            </span>
                          )}
                          {balance === 0 && (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setSelectedUnit(unit);
                                setShowEditModal(true);
                              }}
                              className="text-gray-400 hover:text-[#002561]"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 bg-gray-50">
                            {loadingDetails ? (
                              <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-[#002561]" />
                              </div>
                            ) : unitDetails ? (
                              (() => {
                                const unit = units.find(u => u.id === expandedUnit);
                                const openingBalance = Number(unit?.opening_balance || 0);
                                const totalDues = unitDetails.dues.reduce((sum, due) => sum + Number(due.total_amount), 0);

                                const duesCurrency = unitDetails.dues[0]?.currency_code || currentSite?.default_currency || 'TRY';
                                const displayCurrency = duesCurrency;

                                const totalPaid = unitDetails.payments.reduce((sum, payment) => {
                                  const paymentAmount = Number(payment.amount);
                                  if (payment.currency_code === displayCurrency) {
                                    return sum + paymentAmount;
                                  }
                                  const rate = payment.exchange_rate || 1;
                                  return sum + (paymentAmount * rate);
                                }, 0);

                                const totalDebt = openingBalance + totalDues - totalPaid;
                                const totalAmountDue = totalDues + openingBalance;
                                const paymentPercentage = totalAmountDue > 0 ? (totalPaid / totalAmountDue) * 100 : 0;

                                return (
                                  <>
                                    <div className="mb-6 p-5 rounded-xl bg-gradient-to-br from-blue-50 via-white to-blue-50 border-2 border-blue-200 shadow-md">
                                      <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center">
                                        <DollarSign className="w-5 h-5 mr-2 text-blue-600" />
                                        Financial Summary (Accrual-Based)
                                      </h4>

                                      <div className="grid grid-cols-4 gap-4 mb-4">
                                        <div className="text-center p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                                          <div className="text-xs font-medium text-gray-600 mb-1.5">Opening Balance</div>
                                          <div className={`text-xl font-bold ${openingBalance > 0 ? 'text-red-600' : openingBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                            {formatCurrency(Math.abs(openingBalance), displayCurrency)}
                                          </div>
                                          <div className="text-xs text-gray-500 mt-1">Previous period</div>
                                        </div>
                                        <div className="text-center p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                                          <div className="text-xs font-medium text-gray-600 mb-1.5">Total Dues</div>
                                          <div className="text-xl font-bold text-gray-900">
                                            {formatCurrency(totalDues, displayCurrency)}
                                          </div>
                                          <div className="text-xs text-gray-500 mt-1">Accrued fees</div>
                                        </div>
                                        <div className="text-center p-3 bg-white rounded-xl shadow-sm border border-green-100">
                                          <div className="text-xs font-medium text-gray-600 mb-1.5">Total Paid</div>
                                          <div className="text-xl font-bold text-green-600">{formatCurrency(totalPaid, displayCurrency)}</div>
                                          <div className="text-xs text-gray-500 mt-1">{unitDetails.payments.length} payments</div>
                                        </div>
                                        <div className="text-center p-3 bg-white rounded-xl shadow-sm border border-red-100">
                                          <div className="text-xs font-medium text-gray-600 mb-1.5">Balance</div>
                                          <div className={`text-xl font-bold ${totalDebt > 0 ? 'text-red-600' : totalDebt < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                            {formatCurrency(Math.abs(totalDebt), displayCurrency)}
                                          </div>
                                          <div className={`text-xs mt-1 ${totalDebt > 0 ? 'text-red-600' : totalDebt < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                            {totalDebt > 0 ? 'Outstanding' : totalDebt < 0 ? 'Overpayment' : 'Balanced'}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                                        <div className="flex justify-between items-center mb-3">
                                          <span className="text-sm font-semibold text-gray-700">Payment Progress</span>
                                          <span className="text-sm font-bold text-blue-600">{paymentPercentage.toFixed(1)}%</span>
                                        </div>
                                        <div className="relative w-full h-6 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                                          <div
                                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 via-green-600 to-green-500 transition-all duration-500 rounded-full"
                                            style={{ width: `${Math.min(paymentPercentage, 100)}%` }}
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                              {totalPaid > 0 ? `${formatCurrency(totalPaid, displayCurrency)} of ${formatCurrency(totalAmountDue, displayCurrency)}` : 'No payments yet'}
                                            </span>
                                          </div>
                                        </div>
                                        {totalDebt > 0 && (
                                          <div className="mt-3 flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                                            <span className="text-sm font-medium text-red-700">Outstanding Balance:</span>
                                            <span className="text-lg font-bold text-red-600">{formatCurrency(totalDebt, displayCurrency)}</span>
                                          </div>
                                        )}
                                        {totalDebt < 0 && (
                                          <div className="mt-3 flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                                            <span className="text-sm font-medium text-green-700">Overpayment:</span>
                                            <span className="text-lg font-bold text-green-600">{formatCurrency(Math.abs(totalDebt), displayCurrency)}</span>
                                          </div>
                                        )}
                                        {totalDebt === 0 && totalAmountDue > 0 && (
                                          <div className="mt-3 flex items-center justify-center p-3 bg-green-50 rounded-lg border border-green-200">
                                            <span className="text-sm font-bold text-green-700">All payments completed!</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
                                          <span className="flex items-center">
                                            <Calendar className="w-4 h-4 mr-2" />
                                            Accrued Dues
                                          </span>
                                        </h4>
                                        <div className="space-y-2 max-h-96 overflow-y-auto">
                                          {unitDetails.dues.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-4">No dues records</p>
                                          ) : (
                                            (() => {
                                              const sortedDues = [...unitDetails.dues].sort(
                                                (a, b) => new Date(a.month_date).getTime() - new Date(b.month_date).getTime()
                                              );
                                              let remainingCredit = totalPaid + Math.abs(Math.min(openingBalance, 0));

                                              const duesWithCalculatedPaid = sortedDues.map(due => {
                                                const dueAmount = Number(due.total_amount);
                                                const paidForThisDue = Math.min(remainingCredit, dueAmount);
                                                remainingCredit = Math.max(0, remainingCredit - dueAmount);

                                                const calcStatus = paidForThisDue >= dueAmount
                                                  ? 'paid'
                                                  : paidForThisDue > 0
                                                    ? 'partial'
                                                    : 'pending';

                                                return {
                                                  ...due,
                                                  calculatedPaid: paidForThisDue,
                                                  calculatedStatus: calcStatus,
                                                };
                                              });

                                              return duesWithCalculatedPaid.slice().reverse().map((due) => (
                                                <div
                                                  key={due.id}
                                                  className={`p-3 rounded-lg border ${
                                                    due.calculatedStatus === 'paid'
                                                      ? 'bg-green-50 border-green-200'
                                                      : due.calculatedStatus === 'partial'
                                                      ? 'bg-amber-50 border-amber-200'
                                                      : 'bg-white border-gray-200'
                                                  }`}
                                                >
                                                  <div className="flex justify-between items-start mb-2">
                                                    <span className="text-sm font-semibold text-gray-900">
                                                      {/* ---- UPDATED PART STARTS HERE ---- */}
                                                      {/* If description exists, show it. Otherwise show formatted month/year */}
                                                      {due.description || format(new Date(due.month_date), 'MMMM yyyy')}
                                                      {/* ---- UPDATED PART ENDS HERE ---- */}
                                                    </span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                                                      due.calculatedStatus === 'paid'
                                                        ? 'bg-green-100 text-green-700'
                                                        : due.calculatedStatus === 'partial'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                      {due.calculatedStatus}
                                                    </span>
                                                  </div>
                                                  
                                                  {/* Optional: Show date if description is used */}
                                                  {due.description && (
                                                    <div className="text-xs text-gray-500 mb-1">
                                                      Due: {format(new Date(due.month_date), 'dd MMM yyyy')}
                                                    </div>
                                                  )}

                                                  <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-sm">
                                                      <span className="text-gray-600">Total:</span>
                                                      <span className="font-medium text-gray-900">{formatCurrency(Number(due.total_amount), due.currency_code)}</span>
                                                    </div>
                                                    {due.calculatedPaid > 0 && (
                                                      <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-600">Paid:</span>
                                                        <span className="font-medium text-green-600">{formatCurrency(due.calculatedPaid, due.currency_code)}</span>
                                                      </div>
                                                    )}
                                                    {due.calculatedStatus === 'partial' && (
                                                      <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-600">Remaining:</span>
                                                        <span className="font-medium text-red-600">{formatCurrency(Number(due.total_amount) - due.calculatedPaid, due.currency_code)}</span>
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              ));
                                            })()
                                          )}
                                        </div>
                                      </div>

                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                                          <Receipt className="w-4 h-4 mr-2" />
                                          Payment History
                                        </h4>
                                        <div className="space-y-2 max-h-96 overflow-y-auto">
                                          {unitDetails.payments.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-4">No payment records</p>
                                          ) : (
                                            unitDetails.payments.map((payment) => (
                                              <div
                                                key={payment.id}
                                                className="p-3 bg-white rounded-lg border border-gray-200"
                                              >
                                                <div className="flex justify-between items-start mb-2">
                                                  <span className="text-sm font-medium text-green-600">
                                                    {formatCurrency(Number(payment.amount), payment.currency_code)}
                                                  </span>
                                                  <span className="text-xs text-gray-500">
                                                    {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                                                  </span>
                                                </div>
                                                {payment.description && (
                                                  <div className="text-xs text-gray-600 mb-1">
                                                    {payment.description}
                                                  </div>
                                                )}
                                                <div className="text-xs text-gray-600 space-y-0.5">
                                                  <div className="flex justify-between">
                                                    <span>Method:</span>
                                                    <span className="capitalize">{payment.payment_method.replace('_', ' ')}</span>
                                                  </div>
                                                  {payment.reference_no && (
                                                    <div className="flex justify-between">
                                                      <span>Ref:</span>
                                                      <span className="font-mono">{payment.reference_no}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                );
                              })()
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditModal && (
        <UnitEditModal
          unit={selectedUnit}
          unitTypes={unitTypes}
          siteId={currentSite!.id}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUnit(null);
          }}
          onSaved={() => {
            setShowEditModal(false);
            setSelectedUnit(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ... (Rest of the file including UnitEditModal remains exactly the same)
interface UnitEditModalProps {
  unit: Unit | null;
  unitTypes: UnitType[];
  siteId: string;
  onClose: () => void;
  onSaved: () => void;
}

function UnitEditModal({ unit, unitTypes, siteId, onClose, onSaved }: UnitEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    unit_number: unit?.unit_number || '',
    block: unit?.block || '',
    floor: unit?.floor || 0,
    unit_type_id: unit?.unit_type_id || unitTypes[0]?.id || '',
    share_ratio: unit?.share_ratio || 0,
    opening_balance: unit?.opening_balance || 0,
    owner_name: unit?.owner_name || '',
    owner_phone: unit?.owner_phone || '',
    owner_email: unit?.owner_email || '',
    is_rented: unit?.is_rented || false,
    tenant_name: unit?.tenant_name || '',
    tenant_phone: unit?.tenant_phone || '',
  });

  const handleSave = async () => {
    setLoading(true);

    const data = {
      site_id: siteId,
      unit_number: formData.unit_number,
      block: formData.block || null,
      floor: formData.floor || null,
      unit_type_id: formData.unit_type_id || null,
      share_ratio: formData.share_ratio || 0,
      opening_balance: formData.opening_balance || 0,
      owner_name: formData.owner_name || null,
      owner_phone: formData.owner_phone || null,
      owner_email: formData.owner_email || null,
      is_rented: formData.is_rented,
      tenant_name: formData.tenant_name || null,
      tenant_phone: formData.tenant_phone || null,
    };

    if (unit) {
      await supabase.from('units').update(data).eq('id', unit.id);
    } else {
      await supabase.from('units').insert(data);
    }

    setLoading(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-xl font-semibold text-gray-900">
            {unit ? 'Edit Unit' : 'Add Unit'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Number *
              </label>
              <input
                type="text"
                value={formData.unit_number}
                onChange={(e) => setFormData({ ...formData, unit_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
                placeholder="e.g., 101"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Block
              </label>
              <input
                type="text"
                value={formData.block}
                onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
                placeholder="e.g., A"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Floor
              </label>
              <input
                type="number"
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Type
              </label>
              <select
                value={formData.unit_type_id}
                onChange={(e) => setFormData({ ...formData, unit_type_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              >
                {unitTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} ({type.coefficient}x)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Share Ratio (Arsa Payi)
            </label>
            <input
              type="number"
              step="0.000001"
              value={formData.share_ratio}
              onChange={(e) => setFormData({ ...formData, share_ratio: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
            />
          </div>

          <hr />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <DollarSign className="w-4 h-4 inline mr-1" />
              Opening Balance (Previous Period)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.opening_balance}
              onChange={(e) => setFormData({ ...formData, opening_balance: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              Positive = Debt (unit owes money) | Negative = Credit (unit has credit)
            </p>
          </div>

          <hr />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Owner Name
            </label>
            <input
              type="text"
              value={formData.owner_name}
              onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Phone className="w-4 h-4 inline mr-1" />
                Phone
              </label>
              <input
                type="tel"
                value={formData.owner_phone}
                onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Mail className="w-4 h-4 inline mr-1" />
                Email
              </label>
              <input
                type="email"
                value={formData.owner_email}
                onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
            </div>
          </div>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.is_rented}
              onChange={(e) => setFormData({ ...formData, is_rented: e.target.checked })}
              className="w-4 h-4 text-[#002561] rounded focus:ring-[#002561]"
            />
            <span className="text-sm text-gray-700">This unit is rented</span>
          </label>

          {formData.is_rented && (
            <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tenant Name
                </label>
                <input
                  type="text"
                  value={formData.tenant_name}
                  onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tenant Phone
                </label>
                <input
                  type="tel"
                  value={formData.tenant_phone}
                  onChange={(e) => setFormData({ ...formData, tenant_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !formData.unit_number}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {unit ? 'Save Changes' : 'Add Unit'}
          </button>
        </div>
      </div>
    </div>
  );
}