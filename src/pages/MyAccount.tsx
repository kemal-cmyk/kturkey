import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import {
  User, Receipt, CreditCard, Calendar, Loader2,
  TrendingDown, AlertTriangle, Clock, CheckCircle2, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import type { Unit, DebtWorkflow, UnitBalance } from '../types/database';
import { DEBT_STAGES } from '../lib/constants';

export default function MyAccount() {
  const { user, currentSite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [balance, setBalance] = useState<UnitBalance | null>(null);
  
  // Data State
  const [payments, setPayments] = useState<Array<{ 
    id: string; 
    amount: number; 
    payment_date: string; 
    payment_method: string; 
    reference_no: string | null; 
    description: string | null;
    currency_code: string; 
  }>>([]);
  
  const [dues, setDues] = useState<Array<{
    id: string;
    month_date: string;
    total_amount: number;
    paid_amount: number;
    status: string;
    currency_code: string;
  }>>([]);

  const [debtWorkflow, setDebtWorkflow] = useState<DebtWorkflow | null>(null);

  useEffect(() => {
    if (user && currentSite) {
      fetchData();
    }
  }, [user, currentSite]);

  const fetchData = async () => {
    if (!user || !currentSite) return;
    setLoading(true);

    try {
      // 1. Get the User's Unit
      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('owner_id', user.id)
        .maybeSingle();

      setUnit(unitData);

      if (unitData) {
        // 2. Fetch all data in parallel
        const [balanceRes, paymentsRes, duesRes, workflowRes] = await Promise.all([
          // A. Balance View
          supabase
            .from('unit_balances_from_ledger')
            .select('*')
            .eq('unit_id', unitData.id)
            .maybeSingle(),
          
          // B. Payments (Linked via Payment IDs to Ledger for description, or direct from payments table)
          supabase
            .from('payments')
            .select('*')
            .eq('unit_id', unitData.id)
            .order('payment_date', { ascending: false }),

          // C. Dues (To show charges and unpaid items)
          supabase
            .from('dues')
            .select('*')
            .eq('unit_id', unitData.id)
            .order('month_date', { ascending: false }),

          // D. Debt Status
          supabase
            .from('debt_workflows')
            .select('*')
            .eq('unit_id', unitData.id)
            .eq('is_active', true)
            .maybeSingle(),
        ]);

        setBalance(balanceRes.data);
        setPayments(paymentsRes.data || []);
        setDues(duesRes.data || []);
        setDebtWorkflow(workflowRes.data);
      }
    } catch (error) {
      console.error("Error fetching account data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'TRY') => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const openingBalance = balance?.opening_balance || 0;
  const totalPaid = balance?.total_paid || 0;
  const currentBalance = balance?.current_balance || 0;
  
  // Use currency from the most recent due, or site default
  const displayCurrency = dues[0]?.currency_code || currentSite?.default_currency || 'TRY';

  // Filter for Unpaid/Partial items
  const unpaidDues = dues.filter(d => d.status !== 'paid');

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
            Please contact management if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Financials</h1>
          <p className="text-gray-600">
            Unit {unit.block ? `${unit.block}-` : ''}{unit.unit_number} • {unit.owner_name}
          </p>
        </div>
        {/* Link to the printable statement page we created */}
        <Link 
          to={`/resident-statement?unit_id=${unit.id}`}
          className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
        >
          <FileText className="w-4 h-4 mr-2 text-[#002561]" />
          Print Official Statement
        </Link>
      </div>

      {/* Alert Section (Debt Status) */}
      {debtWorkflow && debtWorkflow.stage >= 2 && (
        <div className={`rounded-xl p-4 border ${
          debtWorkflow.stage === 4 ? 'bg-red-50 border-red-200' :
          debtWorkflow.stage === 3 ? 'bg-orange-50 border-orange-200' :
          'bg-yellow-50 border-yellow-200'
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
                Attention Needed: {DEBT_STAGES[debtWorkflow.stage as keyof typeof DEBT_STAGES].name}
              </p>
              <p className={`text-sm mt-1 ${
                debtWorkflow.stage === 4 ? 'text-red-700' :
                debtWorkflow.stage === 3 ? 'text-orange-700' : 'text-yellow-700'
              }`}>
                {DEBT_STAGES[debtWorkflow.stage as keyof typeof DEBT_STAGES].description}
                {debtWorkflow.legal_case_number && (
                  <span className="block font-mono mt-1 font-bold">
                    Case Number: {debtWorkflow.legal_case_number}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">Opening Balance</span>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <p className={`text-2xl font-bold ${openingBalance > 0 ? 'text-red-600' : openingBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {formatCurrency(openingBalance, displayCurrency)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Carried from last period</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">Total Paid</span>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totalPaid, displayCurrency)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{payments.length} payments recorded</p>
        </div>
        
        <div className={`rounded-xl p-6 shadow-sm border ${currentBalance > 0 ? 'bg-white border-red-200' : 'bg-[#002561] border-[#002561]'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${currentBalance > 0 ? 'text-red-600' : 'text-white/80'}`}>Current Balance</span>
            <TrendingDown className={`w-5 h-5 ${currentBalance > 0 ? 'text-red-600' : 'text-white/80'}`} />
          </div>
          <p className={`text-3xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-white'}`}>
            {formatCurrency(Math.abs(currentBalance), displayCurrency)}
          </p>
          <p className={`text-xs mt-1 ${currentBalance > 0 ? 'text-red-500 font-medium' : 'text-white/70'}`}>
            {currentBalance > 0 ? 'PLEASE PAY NOW' : currentBalance < 0 ? 'Credit Balance' : 'Account Settled'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: Unpaid Dues (Action Items) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
              Unpaid Dues
            </h3>
            {unpaidDues.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                {unpaidDues.length} Items
              </span>
            )}
          </div>
          
          <div className="overflow-y-auto flex-1 p-0">
            {unpaidDues.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-gray-900 font-medium">All caught up!</p>
                <p className="text-gray-500 text-sm mt-1">You have no outstanding dues.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm z-10">
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-6 py-3 text-left">Month</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unpaidDues.map((due) => (
                    <tr key={due.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">
                          {format(new Date(due.month_date), 'MMMM yyyy')}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize inline-block mt-1 ${
                          due.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {due.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-gray-500">
                        {formatCurrency(Number(due.total_amount), due.currency_code)}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-red-600">
                        {formatCurrency(Number(due.total_amount) - Number(due.paid_amount), due.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Payment History */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center">
              <Receipt className="w-4 h-4 mr-2 text-gray-500" />
              Payment History
            </h3>
          </div>
          
          <div className="overflow-y-auto flex-1 p-0">
            {payments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <CreditCard className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500">No payments recorded yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm z-10">
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Detail</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">
                          {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                        </p>
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        <p className="text-xs uppercase font-bold text-gray-400">
                          {payment.payment_method.replace('_', ' ')}
                        </p>
                        {payment.reference_no && (
                          <p className="text-xs font-mono mt-0.5">Ref: {payment.reference_no}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="font-semibold text-green-600">
                          +{formatCurrency(payment.amount, payment.currency_code)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}