import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import { 
  FileText, Search, Printer, Loader2, 
  TrendingUp, TrendingDown, Wallet, Calendar,
  Building2, Phone, Mail, User
} from 'lucide-react';
import { format } from 'date-fns';

// 1. Data Types
interface StatementItem {
  id: string;
  date: string;
  type: 'due' | 'payment';
  description: string;
  amount_accrued: number; // Debt (Borç)
  amount_paid: number;    // Credit (Alacak)
  running_balance: number;
}

interface Unit {
  id: string;
  unit_number: string;
  block: string | null;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  opening_balance: number; // Critical for correct math
}

export default function ResidentStatement() {
  const { currentSite } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  
  // Ledger Data
  const [statementData, setStatementData] = useState<StatementItem[]>([]);
  
  // Summary Stats (Matching Units.tsx)
  const [summary, setSummary] = useState({
    openingBalance: 0,
    totalDues: 0,
    totalPaid: 0,
    endingBalance: 0
  });

  // 1. Load Units List
  useEffect(() => {
    if (currentSite) fetchUnits();
  }, [currentSite]);

  // 2. Auto-select unit if coming from Units Page
  useEffect(() => {
    const unitFromUrl = searchParams.get('unit_id');
    if (unitFromUrl && units.length > 0) {
      setSelectedUnitId(unitFromUrl);
    }
  }, [searchParams, units]);

  // 3. Fetch Details when Unit is selected
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
      // Get the specific unit to ensure we have fresh opening_balance
      const unit = units.find(u => u.id === unitId);
      const openingBalance = unit?.opening_balance || 0;

      // A. Get Dues (Borçlar)
      const { data: dues } = await supabase
        .from('dues')
        .select('*')
        .eq('unit_id', unitId)
        .order('month_date');

      // B. Get Payments (Ödemeler)
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('unit_id', unitId)
        .order('payment_date');

      // C. Merge into Ledger
      const combined: StatementItem[] = [];

      // Add Dues
      dues?.forEach(d => {
        combined.push({
          id: d.id,
          date: d.month_date,
          type: 'due',
          description: `Due: ${format(new Date(d.month_date), 'MMMM yyyy')}`,
          amount_accrued: Number(d.total_amount),
          amount_paid: 0,
          running_balance: 0
        });
      });

      // Add Payments
      payments?.forEach(p => {
        combined.push({
          id: p.id,
          date: p.payment_date,
          type: 'payment',
          description: p.description ? `Payment: ${p.description}` : `Payment (${p.payment_method})`,
          amount_accrued: 0,
          amount_paid: Number(p.amount),
          running_balance: 0
        });
      });

      // Sort Chronologically
      combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate Running Balance
      let running = openingBalance;
      let sumDues = 0;
      let sumPaid = 0;

      const calculatedData = combined.map(item => {
        if (item.type === 'due') {
          running += item.amount_accrued; // Increases debt
          sumDues += item.amount_accrued;
        } else {
          running -= item.amount_paid;    // Decreases debt
          sumPaid += item.amount_paid;
        }
        return { ...item, running_balance: running };
      });

      setStatementData(calculatedData);
      setSummary({
        openingBalance: openingBalance,
        totalDues: sumDues,
        totalPaid: sumPaid,
        endingBalance: running
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
                <Search className="