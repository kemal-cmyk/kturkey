import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, Users,
  Building2, Receipt, ArrowRight, Loader2,
  ChevronRight, Scale, MessageSquare, Home,
  Wallet, CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import type { SiteFinancialSummary, DebtAlert, FiscalPeriod, BudgetCategory, LedgerEntry } from '../types/database';
import { DEBT_STAGES } from '../lib/constants';

export default function Dashboard() {
  const { user, currentSite, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Financial Data State
  const [summary, setSummary] = useState<SiteFinancialSummary | null>(null);
  const [debtAlerts, setDebtAlerts] = useState<DebtAlert[]>([]);
  const [activePeriod, setActivePeriod] = useState<FiscalPeriod | null>(null);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [periodEntries, setPeriodEntries] = useState<LedgerEntry[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  // Operational Data State
  const [opsStats, setOpsStats] = useState({
    openTickets: 0,
    occupiedUnits: 0,
    totalUnits: 0,
    totalResidents: 0
  });

  // Homeowner Specific State
  const [myStats, setMyStats] = useState({
    unitId: '',
    unitNumber: '',
    balance: 0,
    currency: 'TRY',
    myOpenTickets: 0
  });

const isAdmin = currentRole?.role === 'admin';
const isBoardMember = currentRole?.role === 'board_member';
  // explicitly check if role exists to avoid showing homeowner view to uninitialized users
const isHomeowner = currentRole && !isAdmin && !isBoardMember;

  // Add this safety check
  if (!loading && currentSite && !currentRole && !user) {
     return (
       <div className="p-12 text-center">
         <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
         <p className="text-gray-500">Loading your profile...</p>
       </div>
     );
  }
  
  useEffect(() => {
    if (currentSite) {
      fetchDashboardData();
    }
  }, [currentSite, user]);

  const fetchDashboardData = async () => {
    if (!currentSite) return;
    setLoading(true);

    try {
      // 1. Fetch Active Period & Financials (Common for ALL roles)
      const { data: periods } = await supabase
        .from('fiscal_periods')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('status', 'active')
        .maybeSingle();

      setActivePeriod(periods);

      if (periods) {
        // Financial Summary
        const { data: summaryData } = await supabase
          .from('site_financial_summary')
          .select('*')
          .eq('site_id', currentSite.id)
          .eq('fiscal_period_id', periods.id)
          .maybeSingle();
        setSummary(summaryData);

        // Budget Categories
        const { data: categories } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('fiscal_period_id', periods.id)
          .order('display_order');
        setBudgetCategories(categories || []);

        // Ledger Data (Charts)
        const { data: ledgerData } = await supabase
          .from('ledger_entries')
          .select('*')
          .eq('site_id', currentSite.id)
          .eq('fiscal_period_id', periods.id)
          .order('entry_date');

        setPeriodEntries(ledgerData || []);

        // Monthly Data Calculation
        const grouped: Record<string, { income: number; expense: number }> = {};
        ledgerData?.forEach(entry => {
          const month = format(new Date(entry.entry_date), 'MMM');
          if (!grouped[month]) grouped[month] = { income: 0, expense: 0 };
          
          const amount = Number(entry.amount_reporting_try || entry.amount);

          if (entry.entry_type === 'income') {
            grouped[month].income += amount;
          } else {
            grouped[month].expense += amount;
          }
        });
        setMonthlyData(Object.entries(grouped).map(([month, data]) => ({
          month, ...data,
        })));
      }

      // 2. DATA FOR ADMINS
      if (isAdmin || isBoardMember) {
        // Debt Alerts
        const { data: alerts } = await supabase
          .from('debt_alerts')
          .select('*')
          .eq('site_id', currentSite.id)
          .order('stage', { ascending: false })
          .limit(10);
        setDebtAlerts(alerts || []);

        // Operational Stats
        const { count: ticketCount } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', currentSite.id)
          .eq('status', 'open');

        const { data: units } = await supabase
          .from('units')
          .select('id, owner_id')
          .eq('site_id', currentSite.id);
        
        const totalUnits = units?.length || 0;
        const occupiedUnits = units?.filter(u => u.owner_id !== null).length || 0;

        const { data: users } = await supabase
          .rpc('get_site_users', { p_site_id: currentSite.id });

        setOpsStats({
          openTickets: ticketCount || 0,
          totalUnits,
          occupiedUnits,
          totalResidents: users ? users.length : 0
        });
      }

      // 3. DATA FOR HOMEOWNERS (My Stats)
      if (isHomeowner && user) {
        // A. Find My Unit
        const { data: myUnit } = await supabase
          .from('units')
          .select('id, unit_number, opening_balance')
          .eq('site_id', currentSite.id)
          .eq('owner_id', user.id)
          .maybeSingle();

        if (myUnit) {
          // B. Calculate Balance
          const { data: myDues } = await supabase
            .from('dues')
            .select('total_amount, base_amount, paid_amount, currency_code')
            .eq('unit_id', myUnit.id)
            .neq('status', 'cancelled');
          
          const totalUnpaidDues = myDues?.reduce((sum, d) => {
             const amount = Number(d.total_amount) || Number(d.base_amount) || 0;
             const paid = Number(d.paid_amount) || 0;
             const remaining = amount - paid;
             return sum + (remaining > 0.01 ? remaining : 0);
          }, 0) || 0;

          const detectedCurrency = myDues?.[0]?.currency_code || currentSite.default_currency || 'TRY';

          // Get My Open Tickets
          const { count: myTicketCount } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .eq('site_id', currentSite.id)
            .eq('reporter_id', user.id)
            .eq('status', 'open');

          setMyStats({
            unitId: myUnit.id,
            unitNumber: myUnit.unit_number,
            balance: (myUnit.opening_balance || 0) + totalUnpaidDues,
            currency: detectedCurrency, 
            myOpenTickets: myTicketCount || 0
          });
        }
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 1. Used for Debt Alerts and My Balance (Shows Symbol)
  const formatCurrency = (amount: number, currency: string | undefined = undefined) => {
    const code = currency || currentSite?.default_currency || 'TRY';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // 2. Used for Site Transparency & Admin Overview (No Symbol)
  const formatNumber = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const COLORS = ['#002561', '#0066cc', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  
  // --- LIVE CALCULATIONS ---
  const totalCollectedLive = periodEntries
    .filter(e => e.entry_type === 'income')
    .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

  const totalSpentLive = periodEntries
    .filter(e => e.entry_type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

  // Chart Data
  const budgetData = budgetCategories.map((cat, idx) => {
    const actualSpent = periodEntries
      .filter(e => e.category === cat.category_name)
      .reduce((sum, e) => sum + Number(e.amount_reporting_try || e.amount), 0);

    return {
      name: cat.category_name,
      planned: Number(cat.planned_amount),
      actual: actualSpent,
      color: COLORS[idx % COLORS.length],
    };
  });

  const pieData = budgetData.map((data, idx) => ({
    name: data.name,
    value: data.actual,
    color: COLORS[idx % COLORS.length],
  })).filter(d => d.value > 0);

  // --- RENDER ---

  if (!currentSite) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Site Selected</h2>
          <p className="text-gray-600 mb-6">Please select a site from the sidebar.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  // ==========================================
  // VIEW 1: HOMEOWNER DASHBOARD
  // ==========================================
  if (isHomeowner) {
    return (
      <div className="p-6 space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome Home</h1>
          <p className="text-gray-600">
            {currentSite.name} {myStats.unitNumber ? `- Unit ${myStats.unitNumber}` : ''}
          </p>
        </div>

        {/* My Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Balance Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 font-medium mb-1">My Current Balance</p>
                {/* ✅ Display with correct currency */}
                <h2 className={`text-3xl font-bold ${myStats.balance > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(myStats.balance), myStats.currency)}
                </h2>
                <p className="text-sm mt-1 text-gray-400">
                  {myStats.balance > 0.01 ? 'Payment Required' : 'Account in Good Standing'}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${myStats.balance > 0.01 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                <Wallet className="w-6 h-6" />
              </div>
            </div>
            {myStats.unitId && (
              <Link 
                to={`/resident-statement?unit_id=${myStats.unitId}`} 
                className="mt-6 inline-flex items-center text-sm font-medium text-[#002561] hover:underline"
              >
                View Full Statement <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            )}
          </div>

          {/* Tickets Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 font-medium mb-1">My Open Tickets</p>
                <h2 className="text-3xl font-bold text-gray-900">{myStats.myOpenTickets}</h2>
                <p className="text-sm mt-1 text-gray-400">Active Requests</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
                <MessageSquare className="w-6 h-6" />
              </div>
            </div>
            <Link 
              to="/tickets" 
              className="mt-6 inline-flex items-center text-sm font-medium text-[#002561] hover:underline"
            >
              Manage Tickets <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          {/* Community Info Card */}
          <div className="bg-[#002561] text-white rounded-2xl shadow-sm p-6 relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-blue-200 font-medium mb-1">Community Update</p>
              <h3 className="text-xl font-bold mb-2">Transparency Report</h3>
              <p className="text-sm text-blue-100 mb-4 opacity-90">
                View how the budget is being utilized for {activePeriod?.name}.
              </p>
              <div className="flex items-center text-xs text-blue-200">
                <CheckCircle className="w-4 h-4 mr-1" /> Updated Today
              </div>
            </div>
            {/* Decorative Icon */}
            <Building2 className="absolute -bottom-4 -right-4 w-32 h-32 text-white/5" />
          </div>
        </div>

        {/* Transparency Section - ✅ NO CURRENCY SYMBOLS */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Site Financial Transparency</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatCard 
              title="Total Budget" 
              value={formatNumber(summary?.total_budget || 0)} 
              icon={<Receipt className="w-5 h-5" />} 
              color="bg-gray-600" 
            />
            <StatCard 
              title="Collected (YTD)" 
              value={formatNumber(totalCollectedLive)} 
              icon={<TrendingUp className="w-5 h-5" />} 
              color="bg-green-600" 
            />
            <StatCard 
              title="Total Spent" 
              value={formatNumber(totalSpentLive)} 
              icon={<TrendingDown className="w-5 h-5" />} 
              color="bg-orange-500" 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Expenses by Category</h3>
              {pieData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      {/* ✅ Tooltip No Symbol */}
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400">No data available</div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Budget vs Actual</h3>
              {budgetData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                      {/* ✅ Tooltip No Symbol */}
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Bar dataKey="planned" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="actual" fill="#002561" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400">No data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: ADMIN DASHBOARD (Existing + Refined)
  // ==========================================
  const occupancyRate = opsStats.totalUnits > 0 
    ? Math.round((opsStats.occupiedUnits / opsStats.totalUnits) * 100) 
    : 0;

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

      {/* Operational Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/tickets" className="block">
          <StatCard
            title="Open Tickets"
            value={String(opsStats.openTickets)}
            subtitle="Action Needed"
            icon={<MessageSquare className="w-5 h-5" />}
            color={opsStats.openTickets > 0 ? "bg-red-500" : "bg-blue-500"}
          />
        </Link>
        <StatCard
          title="Occupancy Rate"
          value={`${occupancyRate}%`}
          subtitle={`${opsStats.occupiedUnits} / ${opsStats.totalUnits} Units Occupied`}
          icon={<Home className="w-5 h-5" />}
          color="bg-purple-500"
        />
        <Link to="/users" className="block">
          <StatCard
            title="Total Residents"
            value={String(opsStats.totalResidents)}
            subtitle="Registered Users"
            icon={<Users className="w-5 h-5" />}
            color="bg-indigo-500"
          />
        </Link>
      </div>

      {/* Financial Overview - ✅ UPDATED TO USE formatNumber (No Symbol) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Budget"
          value={formatNumber(summary?.total_budget || 0)} // ✅ CHANGED
          icon={<Receipt className="w-5 h-5" />}
          color="bg-[#002561]"
        />
        <StatCard
          title="Total Collected"
          value={formatNumber(totalCollectedLive)} // ✅ CHANGED
          subtitle="Year to date"
          icon={<TrendingUp className="w-5 h-5" />}
          color="bg-green-600"
        />
        <StatCard
          title="Total Spent"
          value={formatNumber(totalSpentLive)} // ✅ CHANGED
          subtitle={`${summary?.total_budget ? Math.round((totalSpentLive / summary.total_budget) * 100) : 0}% of budget`}
          icon={<TrendingDown className="w-5 h-5" />}
          color="bg-orange-500"
        />
      </div>

      {/* Charts & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Budget Bar Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Utilization</h3>
          {budgetData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgetData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                  {/* ✅ Tooltip No Symbol */}
                  <Tooltip formatter={(value: number) => formatNumber(value)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#002561" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No budget data available</div>
          )}
        </div>

        {/* Expense Pie Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Distribution</h3>
          {pieData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  {/* ✅ Tooltip No Symbol */}
                  <Tooltip formatter={(value: number) => formatNumber(value)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">No expense data available</div>
          )}
        </div>
      </div>

      {/* Monthly Cash Flow */}
      {monthlyData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Cash Flow</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                {/* ✅ Tooltip No Symbol */}
                <Tooltip formatter={(value: number) => formatNumber(value)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                <Line type="monotone" dataKey="expense" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Debt Alerts */}
      {debtAlerts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">Debt Alerts</h3>
            </div>
            <Link to="/debt-tracking" className="text-[#002561] hover:underline text-sm font-medium flex items-center">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {debtAlerts.slice(0, 5).map((alert) => (
              <div key={alert.workflow_id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert.stage === 4 ? 'bg-red-100' : alert.stage === 3 ? 'bg-orange-100' : 'bg-yellow-100'}`}>
                    {alert.stage === 4 ? <Scale className="w-5 h-5 text-red-600" /> : <AlertTriangle className={`w-5 h-5 ${alert.stage === 3 ? 'text-orange-600' : 'text-yellow-600'}`} />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{alert.block ? `${alert.block}-` : ''}{alert.unit_number}</p>
                    <p className="text-sm text-gray-500">{alert.owner_name || 'Unknown Owner'}</p>
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
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
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