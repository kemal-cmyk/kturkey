import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import { 
  FileText, Search, Printer, Loader2, 
  TrendingUp, TrendingDown, Wallet, Calendar 
} from 'lucide-react';
import { format } from 'date-fns';

// 1. Define Types to match Unit Page Logic
interface StatementItem {
  id: string;
  date: string;
  type: 'debt' | 'payment';
  description: string;
  category?: string;     // For Debts
  method?: string;       // For Payments
  amount_debt: number;   // Separated for clarity
  amount_paid: number;   // Separated for clarity
  running_balance: number;
}

interface Unit {
  id: string;
  unit_number: string;
  owner_name: string;
  tenant_name?: string;
}

export default function ResidentStatement() {
  const { currentSite } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [statementData, setStatementData] = useState<StatementItem[]>([]);
  
  // Financial Summary State
  const [summary, setSummary] = useState({
    totalAccrued: 0, // Total Debts
    totalPaid: 0,    // Total Payments
    balance: 0       // Net Result
  });

  // 1. Load Units on Mount
  useEffect(() => {
    if (currentSite) fetchUnits();
  }, [currentSite]);

  // 2. Handle URL Parameter (Connection from Unit Page)
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
      .select('id, unit_number, owner_name, tenant_name')
      .eq('site_id', currentSite.id)
      .order('unit_number');
    setUnits(data || []);
  };

  const fetchStatementData = async (unitId: string) => {
    setLoading(true);
    try {
      // A. Get Accrued Dues (Debts)
      const { data: debts } = await supabase
        .from('debts')
        .select('*')
        .eq('unit_id', unitId)
        .order('due_date');

      // B. Get Payment History
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('unit_id', unitId)
        .order('payment_date');

      // C. Merge & Calculate (The "Bank Statement" Logic)
      const combined: StatementItem[] = [];

      debts?.forEach(d => {
        combined.push({
          id: d.id,
          date: d.due_date,
          type: 'debt',
          description: d.description || d.category || 'Dues',
          category: d.category,
          amount_debt: Number(d.amount),
          amount_paid: 0,
          running_balance: 0
        });
      });

      payments?.forEach(p => {
        combined.push({
          id: p.id,
          date: p.payment_date,
          type: 'payment',
          description: p.description || 'Payment Received',
          method: p.payment_method,
          amount_debt: 0,
          amount_paid: Number(p.amount),
          running_balance: 0
        });
      });

      // Sort Chronologically
      combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate Running Balance
      let running = 0;
      let sumDebt = 0;
      let sumPaid = 0;

      const calculatedData = combined.map(item => {
        if (item.type === 'debt') {
          running += item.amount_debt;
          sumDebt += item.amount_debt;
        } else {
          running -= item.amount_paid;
          sumPaid += item.amount_paid;
        }
        return { ...item, running_balance: running };
      });

      setStatementData(calculatedData);
      setSummary({
        totalAccrued: sumDebt,
        totalPaid: sumPaid,
        balance: running
      });

    } catch (error) {
      console.error('Error fetching statement:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);

  const selectedUnit = units.find(u => u.id === selectedUnitId);

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:p-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 print:max-w-none print:px-0">
        
        {/* Navigation / Header (Hidden on Print) */}
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
                      Unit {u.unit_number} - {u.owner_name}
                    </option>
                  ))}
                </select>
             </div>
             
             {selectedUnitId && (
               <button 
                 onClick={() => window.print()}
                 className="flex items-center px-4 py-2 bg-[#002561] text-white border border-transparent rounded-lg hover:bg-[#003875]"
               >
                 <Printer className="w-4 h-4 mr-2" /> Print Statement
               </button>
             )}
          </div>
        </div>

        {/* --- STATEMENT DOCUMENT --- */}
        {selectedUnitId && (
          <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200 print:shadow-none print:border-none print:rounded-none">
            
            {/* 1. Document Header */}
            <div className="p-8 border-b border-gray-200 bg-gray-50/50 print:bg-white print:border-b-2 print:border-black">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-[#002561] uppercase tracking-wide">Statement of Account</h2>
                  <p className="text-sm text-gray-500 flex items-center">
                    <Calendar className="w-4 h-4 mr-1"/> Date: <span className="font-medium text-gray-900 ml-1">{format(new Date(), 'dd MMMM yyyy')}</span>
                  </p>
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-bold text-gray-900">{currentSite?.name}</h3>
                  <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg text-left min-w-[200px] print:border-black">
                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Account Holder</p>
                    <p className="font-bold text-lg text-gray-900">{selectedUnit?.owner_name}</p>
                    <p className="text-gray-600">Unit No: <span className="font-mono font-bold">{selectedUnit?.unit_number}</span></p>
                  </div>
                </div>
              </div>

              {/* 2. Financial Summary (Accrual-Based) */}
              <div className="mt-8">
                <h4 className="text-sm font-bold text-gray-400 uppercase mb-3 print:text-black">Financial Summary</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-white border border-gray-200 rounded-lg print:border-black">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1 bg-red-100 rounded print:hidden"><TrendingDown className="w-4 h-4 text-red-600"/></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Total Accrued Dues</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalAccrued)}</p>
                  </div>

                  <div className="p-4 bg-white border border-gray-200 rounded-lg print:border-black">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1 bg-green-100 rounded print:hidden"><TrendingUp className="w-4 h-4 text-green-600"/></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Total Payments</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalPaid)}</p>
                  </div>

                  <div className={`p-4 border rounded-lg print:border-black ${summary.balance > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1 bg-white rounded print:hidden"><Wallet className="w-4 h-4 text-gray-600"/></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Current Balance</span>
                    </div>
                    <p className={`text-2xl font-bold ${summary.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(summary.balance)}
                    </p>
                    <p className="text-xs mt-1 font-medium opacity-75">
                      {summary.balance > 0 ? '(Amount Due)' : '(Credit / Paid)'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Detailed Ledger (Merged Accrued Dues + Payment History) */}
            <div className="p-0">
              {loading ? (
                <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#002561]" /></div>
              ) : statementData.length === 0 ? (
                <div className="p-12 text-center text-gray-500 italic">No financial history found for this unit.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider print:bg-gray-200 print:border-black print:text-black">
                      <th className="px-6 py-4 text-left font-bold">Date</th>
                      <th className="px-6 py-4 text-left font-bold">Description</th>
                      <th className="px-6 py-4 text-left font-bold">Category / Method</th>
                      <th className="px-6 py-4 text-right font-bold">Accrued (Debt)</th>
                      <th className="px-6 py-4 text-right font-bold">Paid (Credit)</th>
                      <th className="px-6 py-4 text-right font-bold bg-gray-50 print:bg-transparent">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                    {/* Opening Balance Row */}
                    <tr className="bg-gray-50/50 italic print:hidden">
                      <td className="px-6 py-3" colSpan={5}>Opening Balance</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-500">{formatCurrency(0)}</td>
                    </tr>

                    {statementData.map((item, idx) => (
                      <tr key={`${item.id}-${idx}`} className="hover:bg-gray-50 print:hover:bg-transparent break-inside-avoid">
                        <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {format(new Date(item.date), 'dd.MM.yyyy')}
                        </td>
                        <td className="px-6 py-3 text-gray-800">
                          {item.description}
                        </td>
                        <td className="px-6 py-3 text-xs text-gray-500 uppercase">
                          {item.type === 'debt' 
                            ? <span className="px-2 py-1 bg-gray-100 rounded text-gray-600 print:bg-transparent print:p-0">{item.category}</span>
                            : <span className="px-2 py-1 bg-green-50 rounded text-green-700 print:bg-transparent print:p-0">{item.method}</span>
                          }
                        </td>
                        <td className="px-6 py-3 text-right text-red-600 font-medium">
                          {item.amount_debt > 0 ? formatCurrency(item.amount_debt) : '-'}
                        </td>
                        <td className="px-6 py-3 text-right text-green-600 font-medium">
                          {item.amount_paid > 0 ? formatCurrency(item.amount_paid) : '-'}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-gray-900 bg-gray-50 print:bg-transparent">
                          {formatCurrency(item.running_balance)}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Final Totals Row */}
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300 print:bg-gray-200 print:border-black">
                       <td className="px-6 py-4 text-right" colSpan={3}>ENDING TOTALS</td>
                       <td className="px-6 py-4 text-right text-red-700">{formatCurrency(summary.totalAccrued)}</td>
                       <td className="px-6 py-4 text-right text-green-700">{formatCurrency(summary.totalPaid)}</td>
                       <td className={`px-6 py-4 text-right text-lg ${summary.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                         {formatCurrency(summary.balance)}
                       </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Print Footer */}
            <div className="hidden print:block p-8 mt-12 text-center text-xs text-gray-500 border-t border-gray-300">
               <p className="mb-1">This document is computer generated and valid without a signature.</p>
               <p>Generated by {currentSite?.name} Management System on {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>

          </div>
        )}
        
        {/* Empty State */}
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