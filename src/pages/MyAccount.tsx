import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  User, Receipt, CreditCard, Calendar, Loader2,
  TrendingDown, AlertTriangle, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Unit, Payment, DebtWorkflow, UnitBalance } from '../types/database';
import { DEBT_STAGES } from '../lib/constants';

export default function MyAccount() {
  const { user, currentSite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [balance, setBalance] = useState<UnitBalance | null>(null);
  const [payments, setPayments] = useState<Array<{ id: string; amount: number; payment_date: string; payment_method: string; reference_no: string | null; description: string | null }>>([]);
  const [debtWorkflow, setDebtWorkflow] = useState<DebtWorkflow | null>(null);

  useEffect(() => {
    if (user && currentSite) {
      fetchData();
    }
  }, [user, currentSite]);

  const fetchData = async () => {
    if (!user || !currentSite) return;
    setLoading(true);

    const { data: unitData } = await supabase
      .from('units')
      .select('*')
      .eq('site_id', currentSite.id)
      .eq('owner_id', user.id)
      .maybeSingle();

    setUnit(unitData);

    if (unitData) {
      const { data: paymentIds } = await supabase
        .from('payments')
        .select('id')
        .eq('unit_id', unitData.id);

      const paymentIdArray = (paymentIds || []).map(p => p.id);

      const [balanceRes, paymentsRes, workflowRes] = await Promise.all([
        supabase
          .from('unit_balances_from_ledger')
          .select('*')
          .eq('unit_id', unitData.id)
          .maybeSingle(),
        supabase
          .from('ledger_entries')
          .select('id, amount, entry_date, description, category')
          .eq('entry_type', 'income')
          .in('payment_id', paymentIdArray)
          .order('entry_date', { ascending: false }),
        supabase
          .from('debt_workflows')
          .select('*')
          .eq('unit_id', unitData.id)
          .eq('is_active', true)
          .maybeSingle(),
      ]);

      const formattedPayments = (paymentsRes.data || []).map(entry => {
        const refMatch = entry.description?.match(/Ref: ([^\s]+)/);
        return {
          id: entry.id,
          amount: entry.amount,
          payment_date: entry.entry_date,
          payment_method: 'bank_transfer',
          reference_no: refMatch ? refMatch[1] : null,
          description: entry.description,
        };
      });

      setBalance(balanceRes.data);
      setPayments(formattedPayments);
      setDebtWorkflow(workflowRes.data);
    }

    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const openingBalance = balance?.opening_balance || 0;
  const totalPaid = balance?.total_paid || 0;
  const currentBalance = balance?.current_balance || 0;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Unit Assigned</h2>
          <p className="text-gray-600">
            Your account is not linked to any unit in this site.
            Please contact the site administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="text-gray-600">
          Unit {unit.block ? `${unit.block}-` : ''}{unit.unit_number}
        </p>
      </div>

      {debtWorkflow && debtWorkflow.stage >= 2 && (
        <div className={`rounded-xl p-4 ${
          debtWorkflow.stage === 4 ? 'bg-red-50 border border-red-200' :
          debtWorkflow.stage === 3 ? 'bg-orange-50 border border-orange-200' :
          'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-start space-x-3">
            <AlertTriangle className={`w-6 h-6 flex-shrink-0 ${
              debtWorkflow.stage === 4 ? 'text-red-600' :
              debtWorkflow.stage === 3 ? 'text-orange-600' : 'text-yellow-600'
            }`} />
            <div>
              <p className={`font-semibold ${
                debtWorkflow.stage === 4 ? 'text-red-900' :
                debtWorkflow.stage === 3 ? 'text-orange-900' : 'text-yellow-900'
              }`}>
                {DEBT_STAGES[debtWorkflow.stage as keyof typeof DEBT_STAGES].name} Status
              </p>
              <p className={`text-sm mt-1 ${
                debtWorkflow.stage === 4 ? 'text-red-700' :
                debtWorkflow.stage === 3 ? 'text-orange-700' : 'text-yellow-700'
              }`}>
                {DEBT_STAGES[debtWorkflow.stage as keyof typeof DEBT_STAGES].description}
                {debtWorkflow.legal_case_number && (
                  <span className="block font-mono mt-1">
                    Case Number: {debtWorkflow.legal_case_number}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">Opening Balance</span>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <p className={`text-2xl font-bold ${openingBalance > 0 ? 'text-red-600' : openingBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {openingBalance > 0 ? '-' : openingBalance < 0 ? '+' : ''}{formatCurrency(Math.abs(openingBalance))}
          </p>
          <p className="text-xs text-gray-500 mt-1">Previous period</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">Total Paid</span>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totalPaid)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{payments.length} payments</p>
        </div>
        <div className="bg-[#002561] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70 text-sm">Current Balance</span>
            <TrendingDown className="w-5 h-5 text-white/70" />
          </div>
          <p className={`text-3xl font-bold ${currentBalance > 0 ? 'text-red-200' : 'text-white'}`}>
            {currentBalance > 0 ? '-' : currentBalance < 0 ? '+' : ''}{formatCurrency(Math.abs(currentBalance))}
          </p>
          <p className="text-xs text-white/70 mt-1">
            {currentBalance > 0 ? 'Outstanding debt' : currentBalance < 0 ? 'Credit balance' : 'Balanced'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Maintenance Fee Payment History</h3>
        </div>
        {payments.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No payments recorded</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">
                        {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                      </p>
                      {payment.reference_no && (
                        <p className="text-xs text-gray-500 font-mono">
                          Ref: {payment.reference_no}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      <p className="text-sm">{payment.description || 'Maintenance fee payment'}</p>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">
                        {payment.payment_method.replace('_', ' ')}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="font-semibold text-green-600">
                        +{formatCurrency(payment.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
