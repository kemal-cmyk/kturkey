import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  FileText, Search, Download, User, 
  Home, Calendar, Printer, Loader2
} from 'lucide-react';
import { format } from 'date-fns';

// Define the shape of our merged transaction
interface StatementItem {
  id: string;
  date: string;
  type: 'debt' | 'payment';
  description: string;
  amount: number;
  running_balance?: number;
}

interface Unit {
  id: string;
  unit_number: string;
  owner_name: string;
}

export default function ResidentStatement() {
  const { currentSite } = useAuth();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [statementData, setStatementData] = useState<StatementItem[]>([]);
  
  // Stats
  const [totalDebt, setTotalDebt] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    if (currentSite) fetchUnits();
  }, [currentSite]);

  useEffect(() => {
    if (selectedUnitId) fetchStatement(selectedUnitId);
  }, [selectedUnitId]);

  const fetchUnits = async () => {
    if (!currentSite) return;
    const { data } = await supabase
      .from('units')
      .select('id, unit_number, owner_name')
      .eq('site_id', currentSite.id)
      .order('unit_number');
    setUnits(data || []);
  };

  const fetchStatement = async (unitId: string) => {
    setLoading(true);
    try {
      // 1. Fetch Debts (Charges)
      const { data: debts } = await supabase
        .from('debts')
        .select('id, due_date, amount, description, category')
        .eq('unit_id', unitId)
        .order('due_date');

      // 2. Fetch Payments (Credits)
      const { data: payments } = await supabase
        .from('payments')
        .select('id, payment_date, amount, description, payment_method')
        .eq('unit_id', unitId)
        .order('payment_date');

      // 3. Merge & Sort
      const combined: StatementItem[] = [];

      debts?.forEach(d => {
        combined.push({
          id: d.id,
          date: d.due_date,
          type: 'debt',
          description: d.description || d.category || 'Monthly Due',
          amount: Number(d.amount)
        });
      });

      payments?.forEach(p => {
        combined.push({
          id: p.id,
          date: p.payment_date,
          type: 'payment',
          description: p.description || `Payment (${p.payment_method})`,
          amount: Number(p.amount)
        });
      });

      // Sort by Date Ascending
      combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 4. Calculate Running Balance
      let balance = 0;
      let tDebt = 0;
      let tPaid = 0;

      const finalData = combined.map(item => {
        if (item.type === 'debt') {
          balance += item.amount; // Debt increases balance owed
          tDebt += item.amount;
        } else {
          balance -= item.amount; // Payment decreases balance owed
          tPaid += item.amount;
        }
        return { ...item, running_balance: balance };
      });

      setStatementData(finalData);
      setTotalDebt(tDebt);
      setTotalPaid(tPaid);

    } catch (error) {
      console.error('Error fetching statement:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);

  const handlePrint = () => {
    window.print();
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId);

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 print:px-0">
        
        {/* Header - Hidden on Print */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-[#002561]" />
              Resident Statement
            </h1>
            <p className="text-gray-600 mt-1">View account history and balance</p>
          </div>
          <div className="flex items-center gap-3">
             {/* Unit Selector */}
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select 
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] min-w-[200px]"
                >
                  <option value="">Select Unit...</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.unit_number} - {u.owner_name}
                    </option>
                  ))}
                </select>
             </div>
             
             {selectedUnitId && (
               <button 
                 onClick={handlePrint}
                 className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
               >
                 <Printer className="w-4 h-4 mr-2" /> Print
               </button>
             )}
          </div>
        </div>

        {/* Statement Content */}
        {selectedUnitId ? (
          <div className="bg-white shadow-lg rounded-xl overflow-hidden print:shadow-none print:rounded-none">
            
            {/* Statement Header */}
            <div className="p-8 border-b border-gray-200 bg-gray-50 print:bg-white print:border-black">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-[#002561] mb-1">Statement of Account</h2>
                  <p className="text-gray-500 text-sm">Date: {format(new Date(), 'dd MMMM yyyy')}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-gray-900">{currentSite?.name}</h3>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Bill To</p>
                    <p className="font-semibold text-lg">{selectedUnit?.owner_name}</p>
                    <p className="text-gray-600">Unit: {selectedUnit?.unit_number}</p>
                  </div>
                </div>
              </div>

              {/* Summary Boxes */}
              <div className="grid grid-cols-3 gap-6 mt-8">
                <div className="p-4 bg-white rounded-lg border border-gray-200 print:border-black">
                  <p className="text-xs text-gray-500 uppercase">Total Charges</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(totalDebt)}</p>
                </div>
                <div className="p-4 bg-white rounded-lg border border-gray-200 print:border-black">
                  <p className="text-xs text-gray-500 uppercase">Total Payments</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                </div>
                <div className={`p-4 rounded-lg border print:border-black ${totalDebt - totalPaid > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                  <p className="text-xs text-gray-500 uppercase">Current Balance</p>
                  <p className={`text-xl font-bold ${totalDebt - totalPaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(totalDebt - totalPaid)}
                  </p>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="p-0">
              {loading ? (
                <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#002561]" /></div>
              ) : statementData.length === 0 ? (
                <div className="p-12 text-center text-gray-500 italic">No transactions found for this unit.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 print:bg-gray-100 print:border-black">
                      <th className="px-6 py-3 text-left font-semibold text-gray-600">Date</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-600">Description</th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-600">Charge</th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-600">Payment</th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-600">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                    {/* Opening Balance Row (Optional, starts at 0 for now) */}
                    <tr className="bg-gray-50/50 italic">
                      <td className="px-6 py-3" colSpan={4}>Opening Balance</td>
                      <td className="px-6 py-3 text-right font-medium">{formatCurrency(0)}</td>
                    </tr>

                    {statementData.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                          {format(new Date(item.date), 'dd MMM yyyy')}
                        </td>
                        <td className="px-6 py-3 text-gray-900">
                          {item.description}
                        </td>
                        <td className="px-6 py-3 text-right text-red-600">
                          {item.type === 'debt' ? formatCurrency(item.amount) : '-'}
                        </td>
                        <td className="px-6 py-3 text-right text-green-600">
                          {item.type === 'payment' ? formatCurrency(item.amount) : '-'}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-gray-900 bg-gray-50/50 print:bg-transparent">
                          {formatCurrency(item.running_balance || 0)}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Final Row */}
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300 print:bg-gray-200 print:border-black">
                       <td className="px-6 py-4" colSpan={2}>Ending Balance</td>
                       <td className="px-6 py-4 text-right text-red-700">{formatCurrency(totalDebt)}</td>
                       <td className="px-6 py-4 text-right text-green-700">{formatCurrency(totalPaid)}</td>
                       <td className="px-6 py-4 text-right text-[#002561]">{formatCurrency(totalDebt - totalPaid)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Footer for Print */}
            <div className="hidden print:block p-8 mt-8 text-center text-xs text-gray-500 border-t">
               <p>This document is computer generated. No signature required.</p>
               <p>Generated on {format(new Date(), 'dd/MM/yyyy HH:mm')} by {currentSite?.name} System.</p>
            </div>

          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center print:hidden">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a Unit</h2>
            <p className="text-gray-600">Choose a unit from the dropdown above to view their statement.</p>
          </div>
        )}

      </div>
    </div>
  );
}