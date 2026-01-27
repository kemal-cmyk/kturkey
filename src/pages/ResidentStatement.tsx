import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import {
  FileText, Search, Printer, Loader2,
  TrendingUp, TrendingDown, Wallet, Calendar,
  Building2, Phone, User
} from 'lucide-react';
import { format } from 'date-fns';

// 1. Data Types
interface StatementItem {
  id: string;
  date: string;
  type: 'due' | 'payment';
  description: string;
  amount_accrued: number; // In Dues Currency
  amount_paid: number;    // In Dues Currency (Converted if necessary)
  original_amount?: number; // Original payment amount (e.g. in TRY)
  original_currency?: string; // Original payment currency
  running_balance: number;
  currency_code: string;
}

interface Unit {
  id: string;
  unit_number: string;
  block: string | null;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  opening_balance: number;
}

export default function ResidentStatement() {
  const { currentSite } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Ledger Data
  const [statementData, setStatementData] = useState<StatementItem[]>([]);
  
  // Summary Stats
  const [summary, setSummary] = useState({
    openingBalance: 0,
    totalDues: 0,
    totalPaid: 0,
    endingBalance: 0,
    currency: 'TRY' // Default, will update based on unit
  });

  // 1. Load Units List
  useEffect(() => {
    if (currentSite) fetchUnits();
  }, [currentSite]);

  // 2. Auto-select unit from URL
  useEffect(() => {
    const unitFromUrl = searchParams.get('unit_id');
    if (unitFromUrl && units.length > 0) {
      setSelectedUnitId(unitFromUrl);
    }
  }, [searchParams, units]);

  // 3. Fetch Data when Unit is selected
  useEffect(() => {
    if (selectedUnitId) fetchStatementData(selectedUnitId);
  }, [selectedUnitId]);

  const fetchUnits = async () => {
    if (!currentSite) return;
    const { data } = await supabase
      .from('units')
      .select('id, unit_number, block, owner_name, owner_phone, owner_email, opening_balance')
      .eq('site_id', currentSite.id)
      .order('unit_number');
    setUnits(data || []);
  };

  const fetchStatementData = async (unitId: string) => {
    setLoading(true);
    try {
      // 1. Get Unit Info (Opening Balance)
      const unit = units.find(u => u.id === unitId);
      const openingBalance = unit?.opening_balance || 0;

      // 2. Get Dues (The "Charges")
      // This table contains the correct currency and paid amounts
      const { data: dues } = await supabase
        .from('dues')
        .select('*')
        .eq('unit_id', unitId)
        .order('month_date');

      // 3. Get Actual Payments (The "Credits")
      // We fetch these to show the history, but the math relies on what was applied to dues
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('unit_id', unitId)
        .order('payment_date');

      // Determine Base Currency from the first due or default to site default
      const baseCurrency = dues?.[0]?.currency_code || currentSite?.default_currency || 'TRY';

      // --- MERGE & CALCULATE ---
      const combined: StatementItem[] = [];

      // A. Add Dues (Charges)
      dues?.forEach(d => {
        combined.push({
          id: d.id,
          date: d.month_date,
          type: 'due',
          description: `Accrual: ${format(new Date(d.month_date), 'MMMM yyyy')}`,
          amount_accrued: Number(d.total_amount),
          amount_paid: 0,
          running_balance: 0,
          currency_code: d.currency_code
        });
      });

      /* B. Add Payments (Credits)
         CRITICAL: We must link payments to the dues they paid or show them chronologically.
         For a simple statement, we can just list payments.
         However, because of cross-currency, we need to be careful.
         
         If a payment was made in TRY for EUR dues, we should show the converted amount
         that effectively reduced the debt.
         
         Since your `apply_unit_payment` function calculates `amount_reporting_try` 
         or converts to dues currency, we can try to infer the "Effective Amount"
         based on the exchange rate stored in the payment.
      */
      
      payments?.forEach(p => {
        // Calculate the "Effective Credit" in the Base Currency
        let effectiveAmount = Number(p.amount);
        
        if (p.currency_code !== baseCurrency) {
           // If Payment is TRY and Base is EUR
           if (p.currency_code === 'TRY' && baseCurrency !== 'TRY') {
              effectiveAmount = Number(p.amount) / Number(p.exchange_rate || 1);
           } 
           // If Payment is EUR and Base is TRY
           else if (p.currency_code !== 'TRY' && baseCurrency === 'TRY') {
              effectiveAmount = Number(p.amount) * Number(p.exchange_rate || 1);
           }
        }

        combined.push({
          id: p.id,
          date: p.payment_date,
          type: 'payment',
          description: p.description 
            ? `Payment: ${p.description}` 
            : `Payment (${p.payment_method?.replace('_', ' ')})`,
          amount_accrued: 0,
          amount_paid: effectiveAmount, // The amount that reduces the balance in Base Currency
          original_amount: Number(p.amount),
          original_currency: p.currency_code,
          running_balance: 0,
          currency_code: baseCurrency
        });
      });

      // Sort Chronologically
      combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // C. Calculate Running Balance
      let running = openingBalance;
      let sumAccrued = 0;
      let sumPaid = 0;

      const calculatedData = combined.map(item => {
        if (item.type === 'due') {
          running += item.amount_accrued;
          sumAccrued += item.amount_accrued;
        } else {
          running -= item.amount_paid;
          sumPaid += item.amount_paid;
        }
        return { ...item, running_balance: running };
      });

      setStatementData(calculatedData);
      setSummary({
        openingBalance: openingBalance,
        totalDues: sumAccrued,
        totalPaid: sumPaid,
        endingBalance: running,
        currency: baseCurrency
      });

    } catch (error) {
      console.error('Error fetching statement:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number, currency: string) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency }).format(val);

  const selectedUnit = units.find(u => u.id === selectedUnitId);

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:p-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 print:max-w-none print:px-0">
        
        {/* Navigation - Hidden on Print */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-[#002561]" />
              Resident Account Statement
            </h1>
            <p className="text-gray-600 mt-1">Official financial history and balance</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select 
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] min-w-[240px]"
                >
                  <option value="">Select a Unit...</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.block ? `Block ${u.block} - ` : ''}Unit {u.unit_number} ({u.owner_name})
                    </option>
                  ))}
                </select>
             </div>
             
             {selectedUnitId && (
               <button 
                 onClick={() => window.print()}
                 className="flex items-center px-4 py-2 bg-[#002561] text-white border border-transparent rounded-lg hover:bg-[#003875]"
               >
                 <Printer className="w-4 h-4 mr-2" /> Print
               </button>
             )}
          </div>
        </div>

        {/* --- STATEMENT DOCUMENT --- */}
        {selectedUnitId && (
          <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200 print:shadow-none print:border-none print:rounded-none">
            
            {/* Header */}
            <div className="p-8 border-b border-gray-200 bg-gray-50/30 print:bg-white print:border-b-2 print:border-black">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-[#002561] uppercase tracking-wide">Statement of Account</h2>
                  <p className="text-sm text-gray-500 flex items-center">
                    <Calendar className="w-4 h-4 mr-1"/> Date: <span className="font-medium text-gray-900 ml-1">{format(new Date(), 'dd MMMM yyyy')}</span>
                  </p>
                  <h3 className="text-lg font-bold text-gray-900 mt-4">{currentSite?.name}</h3>
                </div>

                <div className="text-right min-w-[250px]">
                  <div className="p-4 bg-white border border-gray-200 rounded-lg text-left shadow-sm print:shadow-none print:border-black">
                    <p className="text-xs text-gray-400 uppercase font-bold mb-2 border-b pb-1">Account Holder</p>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-gray-400"/>
                      <span className="font-bold text-lg text-gray-900">{selectedUnit?.owner_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                       <Building2 className="w-4 h-4 text-gray-400"/>
                       <span>{selectedUnit?.block ? `Block ${selectedUnit.block}, ` : ''}Unit {selectedUnit?.unit_number}</span>
                    </div>
                    {selectedUnit?.owner_phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-4 h-4 text-gray-400"/> {selectedUnit.owner_phone}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="mt-8 grid grid-cols-4 gap-4 print:gap-2">
                <div className="p-3 bg-white rounded-lg border border-gray-200 text-center print:border-black">
                   <p className="text-xs font-bold text-gray-500 uppercase mb-1">Opening Balance</p>
                   <p className={`text-xl font-bold ${summary.openingBalance > 0 ? 'text-red-600' : summary.openingBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {formatCurrency(Math.abs(summary.openingBalance), summary.currency)}
                   </p>
                   <p className="text-[10px] text-gray-400">Previous Period</p>
                </div>

                <div className="p-3 bg-white rounded-lg border border-gray-200 text-center print:border-black">
                   <p className="text-xs font-bold text-gray-500 uppercase mb-1">Total Accrued</p>
                   <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(summary.totalDues, summary.currency)}
                   </p>
                   <p className="text-[10px] text-gray-400">Dues & Fees</p>
                </div>

                <div className="p-3 bg-white rounded-lg border border-gray-200 text-center print:border-black">
                   <p className="text-xs font-bold text-gray-500 uppercase mb-1">Total Paid</p>
                   <p className="text-xl font-bold text-green-600">
                      {formatCurrency(summary.totalPaid, summary.currency)}
                   </p>
                   <p className="text-[10px] text-gray-400">Payments Received</p>
                </div>

                <div className={`p-3 rounded-lg border text-center print:border-black ${summary.endingBalance > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                   <p className="text-xs font-bold text-gray-500 uppercase mb-1">Ending Balance</p>
                   <p className={`text-xl font-bold ${summary.endingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(Math.abs(summary.endingBalance), summary.currency)}
                   </p>
                   <p className="text-[10px] font-semibold opacity-75">
                      {summary.endingBalance > 0 ? 'OUTSTANDING' : summary.endingBalance < 0 ? 'CREDIT' : 'BALANCED'}
                   </p>
                </div>
              </div>
            </div>

            {/* Detailed Ledger */}
            <div className="p-0">
              {loading ? (
                <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#002561]" /></div>
              ) : statementData.length === 0 ? (
                <div className="p-12 text-center text-gray-500 italic">No transactions found for this period.</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider print:bg-gray-200 print:border-black print:text-black">
                      <th className="px-6 py-3 text-left font-bold border-r border-gray-200">Date</th>
                      <th className="px-6 py-3 text-left font-bold border-r border-gray-200 w-1/3">Description</th>
                      <th className="px-6 py-3 text-right font-bold border-r border-gray-200 text-red-600">Accrued</th>
                      <th className="px-6 py-3 text-right font-bold border-r border-gray-200 text-green-600">Paid</th>
                      <th className="px-6 py-3 text-right font-bold bg-gray-50 print:bg-transparent">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                    <tr className="bg-gray-50/50 italic print:bg-gray-100">
                      <td className="px-6 py-3 font-medium text-gray-700 border-r" colSpan={2}>Opening Balance</td>
                      <td className="px-6 py-3 text-right border-r">-</td>
                      <td className="px-6 py-3 text-right border-r">-</td>
                      <td className={`px-6 py-3 text-right font-bold border-r ${summary.openingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(summary.openingBalance, summary.currency)}
                      </td>
                    </tr>

                    {statementData.map((item, idx) => (
                      <tr key={`${item.id}-${idx}`} className="hover:bg-gray-50 print:hover:bg-transparent break-inside-avoid">
                        <td className="px-6 py-2.5 font-medium text-gray-900 whitespace-nowrap border-r">
                          {format(new Date(item.date), 'dd.MM.yyyy')}
                        </td>
                        <td className="px-6 py-2.5 text-gray-800 border-r">
                          <div className="flex flex-col">
                            <span>{item.description}</span>
                            {/* Show original currency if different from base */}
                            {item.original_amount && item.original_currency !== summary.currency && (
                              <span className="text-xs text-gray-500 italic">
                                (Orig: {formatCurrency(item.original_amount, item.original_currency)})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-2.5 text-right text-red-600 font-medium border-r bg-red-50/30">
                          {item.amount_accrued > 0 ? formatCurrency(item.amount_accrued, summary.currency) : '-'}
                        </td>
                        <td className="px-6 py-2.5 text-right text-green-600 font-medium border-r bg-green-50/30">
                          {item.amount_paid > 0 ? formatCurrency(item.amount_paid, summary.currency) : '-'}
                        </td>
                        <td className={`px-6 py-2.5 text-right font-bold border-r bg-gray-50 print:bg-transparent ${item.running_balance > 0 ? 'text-red-800' : 'text-green-800'}`}>
                          {formatCurrency(item.running_balance, summary.currency)}
                        </td>
                      </tr>
                    ))}
                    
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300 print:bg-gray-200 print:border-black">
                       <td className="px-6 py-4 text-right border-r border-gray-300" colSpan={2}>ENDING TOTALS</td>
                       <td className="px-6 py-4 text-right text-red-700 border-r border-gray-300">{formatCurrency(summary.totalDues, summary.currency)}</td>
                       <td className="px-6 py-4 text-right text-green-700 border-r border-gray-300">{formatCurrency(summary.totalPaid, summary.currency)}</td>
                       <td className={`px-6 py-4 text-right text-lg border-r border-gray-300 ${summary.endingBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                         {formatCurrency(summary.endingBalance, summary.currency)}
                       </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="hidden print:block p-8 mt-12 text-center text-xs text-gray-500 border-t border-gray-300">
               <p className="mb-1 uppercase tracking-widest font-bold">End of Statement</p>
               <p className="mb-1">This document is computer generated and valid without a signature.</p>
               <p>Generated by {currentSite?.name} Management System on {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>

          </div>
        )}
        
        {!selectedUnitId && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center print:hidden">
            <div className="w-16 h-16 bg-blue-50 text-[#002561] rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Select a Unit</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Please select a unit from the dropdown menu above to view and print their full financial statement.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}