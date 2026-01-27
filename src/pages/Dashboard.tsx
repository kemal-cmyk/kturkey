import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, TrendingDown, AlertTriangle, Users,
  Building2, Receipt, ArrowRight, Loader2,
  ChevronRight, Scale, MessageSquare, Home, Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import type { SiteFinancialSummary, DebtAlert, FiscalPeriod, BudgetCategory, LedgerEntry } from '../types/database';
import { DEBT_STAGES } from '../lib/constants';

// Safe number helper
const safeNumber = (val: any) => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export default function Dashboard() {
  const { currentSite, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Data States
  const [summary, setSummary] = useState<SiteFinancialSummary | null>(null);
  const [debtAlerts, setDebtAlerts] = useState<DebtAlert[]>([]);
  const [activePeriod, setActivePeriod] = useState<FiscalPeriod | null>(null);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [periodEntries, setPeriodEntries] = useState<LedgerEntry[]>([]);

  const [opsStats, setOpsStats] = useState({
    openTickets: 0,
    occupiedUnits: 0,
    totalUnits: 0,
    totalResidents: 0
  });

  const isAdmin = currentRole?.role === 'admin';
  const isBoardMember = currentRole?.role === 'board_member';

  useEffect(() => {
    if (currentSite) {
      fetchDashboardData();
    }
  }, [currentSite]);

  const fetchDashboardData = async () => {
    if (!currentSite) return;
    setLoading(true);

    try {
      // 1. Fetch Active Period
      const { data: periods } = await supabase
        .from('fiscal_periods')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('status', 'active')
        .maybeSingle();

      setActivePeriod(periods);

      if (periods) {
        // 2. Fetch Financials
        const { data: summaryData } = await supabase
          .from('site_financial_summary')
          .select('*')
          .eq('site_id', currentSite.id)
          .eq('fiscal_period_id', periods.id)
          .maybeSingle();
        setSummary(summaryData);

        // 3. Fetch Categories
        const { data: categories } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('fiscal_period_id', periods.id)
          .order('display_order');
        setBudgetCategories(categories || []);

        // 4. Fetch Ledger Entries (ALL columns needed for currency calc)
        const { data: ledgerData } = await supabase
          .from('ledger_entries')
          .select('*')
          .eq('site_id', currentSite.id)
          .eq('fiscal_period_id', periods.id);

        setPeriodEntries(ledgerData || []);
      }

      // 5. Fetch Debt Alerts
      if (isAdmin || isBoardMember) {
        const { data: alerts } = await supabase
          .from('debt_alerts')
          .select('*')
          .eq('site_id', currentSite.id)
          .order('stage', { ascending: false })
          .limit(10);
        setDebtAlerts(alerts || []);
      }

      // 6. Fetch Ops Stats
      const { count: ticketCount } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', currentSite.id)
        .eq('status', 'open');

      const { data: units } = await supabase
        .from('units')
        .select('id, owner_id')
        .eq('site_id', currentSite.id);
      
      const { data: users } = await supabase
        .rpc('get_site_users', { p_site_id: currentSite.id });

      setOpsStats({
        openTickets: ticketCount || 0,
        totalUnits: units?.length || 0,
        occupiedUnits: units?.filter(u => u.owner_id).length || 0,
        totalResidents: users ? users.length : 0
      });

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safeNumber(amount));
  };

  const occupancyRate = opsStats.totalUnits > 0 
    ? Math.round((opsStats.occupiedUnits / opsStats.totalUnits) * 100) 
    : 0;

  // Calculate Budget Data (Smart Math: Sums TL + EUR properly)
  const budgetData = budgetCategories.map((cat) => {
    const actualSpent = periodEntries
      .filter(e => e.category === cat.category_name)
      .reduce((sum, e) => sum + safeNumber(e.amount_reporting_try || e.amount), 0);
    
    const planned = safeNumber(cat.planned_amount);
    const percent = planned > 0 ? (actualSpent / planned) * 100 : 0;

    return {
      name: cat.category_name,
      planned,
      actual: actualSpent,
      percent: Math.min(percent, 100)
    };
  }).sort((a, b) => b.percent - a.percent); 

  if (!currentSite) return null;
  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#002561]" /></div>;

  return (
    <div className="p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{currentSite.name}</h1>
          <p className="text-gray-600">
            {activePeriod ? `Financial Period: ${activePeriod.name}` : 'No active financial period'}
          </p>
        </div>
        {!activePeriod && isAdmin && (
          <Link to="/fiscal-periods" className="inline-flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors">
            Create Financial Period <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Total Budget" 
          value={formatCurrency(summary?.total_budget || 0)} 
          icon={<Receipt className="w-5 h-5" />} 
          color="bg-[#002561]" 
        />
        <StatCard 
          title="Total Collected" 
          value={formatCurrency(summary?.total_collected || 0)} 
          subtitle={`${summary?.collection_rate || 0}% collection rate`} 
          icon={<TrendingUp className="w-5 h-5" />} 
          color="bg-green-600" 
        />
        <StatCard 
          title="Total Spent" 
          value={formatCurrency(summary?.actual_expenses || 0)} 
          subtitle={`${summary?.budget_utilization || 0}% of budget`} 
          icon={<TrendingDown className="w-5 h-5" />} 
          color="bg-orange-500" 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          title="Open Tickets" 
          value={String(opsStats.openTickets)} 
          subtitle="Action Needed" 
          icon={<MessageSquare className="w-5 h-5" />} 
          color={opsStats.openTickets > 0 ? "bg-red-500" : "bg-blue-500"} 
        />
        <StatCard 
          title="Occupancy Rate" 
          value={`${occupancyRate}%`} 
          subtitle={`${opsStats.occupiedUnits}/${opsStats.totalUnits} Units`} 
          icon={<Home className="w-5 h-5" />} 
          color="bg-purple-500" 
        />
        <StatCard 
          title="Residents" 
          value={String(opsStats.totalResidents)} 
          subtitle="Registered" 
          icon={<Users className="w-5 h-5" />} 
          color="bg-indigo-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Budget Utilization List (Replaces Crashy Chart) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-gray-500" />
            Budget Utilization
          </h3>
          {budgetData.length > 0 ? (
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
              {budgetData.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{item.name}</span>
                    <span className="text-gray-500">
                      {formatCurrency(item.actual)} / {formatCurrency(item.planned)}
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.percent > 100 ? 'bg-red-500' : 
                        item.percent > 80 ? 'bg-orange-500' : 'bg-[#002561]'
                      }`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-500">No budget data</div>
          )}
        </div>

        {/* Debt Alerts */}
        {(isAdmin || isBoardMember) && debtAlerts.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Debt Alerts
              </h3>
              <Link to="/debt-tracking" className="text-[#002561] hover:underline text-sm font-medium flex items-center">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {debtAlerts.slice(0, 5).map((alert) => (
                <div key={alert.workflow_id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert.stage === 4 ? 'bg-red-100' : 'bg-yellow-100'}`}>
                      {alert.stage === 4 ? <Scale className="w-5 h-5 text-red-600" /> : <AlertTriangle className="w-5 h-5 text-orange-600" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{alert.block ? `${alert.block}-` : ''}{alert.unit_number}</p>
                      <p className="text-sm text-gray-500">{alert.owner_name || 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(alert.total_debt_amount)}</p>
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${DEBT_STAGES[alert.stage as keyof typeof DEBT_STAGES].color}`}>
                      {DEBT_STAGES[alert.stage as keyof typeof DEBT_STAGES].name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Placeholder if no alerts - Keeps layout balanced */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-center items-center text-center">
             <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <Receipt className="w-8 h-8 text-green-600" />
             </div>
             <h3 className="text-lg font-bold text-gray-900">Financial Status</h3>
             <p className="text-gray-500 mt-2">All systems running smoothly. No critical debt alerts.</p>
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, color }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-600 text-sm font-medium">{title}</span>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}