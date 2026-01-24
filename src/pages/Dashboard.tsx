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
  Building2, Calendar, Receipt, ArrowRight, Loader2,
  ChevronRight, Scale,
} from 'lucide-react';
import { format } from 'date-fns';
import type { SiteFinancialSummary, DebtAlert, FiscalPeriod, BudgetCategory } from '../types/database';
import { DEBT_STAGES } from '../lib/constants';

export default function Dashboard() {
  const { currentSite, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SiteFinancialSummary | null>(null);
  const [debtAlerts, setDebtAlerts] = useState<DebtAlert[]>([]);
  const [activePeriod, setActivePeriod] = useState<FiscalPeriod | null>(null);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

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
      const { data: periods } = await supabase
        .from('fiscal_periods')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('status', 'active')
        .maybeSingle();

      setActivePeriod(periods);

      if (periods) {
        const { data: summaryData } = await supabase
          .from('site_financial_summary')
          .select('*')
          .eq('site_id', currentSite.id)
          .eq('fiscal_period_id', periods.id)
          .maybeSingle();

        setSummary(summaryData);

        const { data: categories } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('fiscal_period_id', periods.id)
          .order('display_order');

        setBudgetCategories(categories || []);

        const { data: ledgerData } = await supabase
          .from('ledger_entries')
          .select('entry_date, amount, entry_type')
          .eq('site_id', currentSite.id)
          .eq('fiscal_period_id', periods.id)
          .order('entry_date');

        const grouped: Record<string, { income: number; expense: number }> = {};
        ledgerData?.forEach(entry => {
          const month = format(new Date(entry.entry_date), 'MMM');
          if (!grouped[month]) grouped[month] = { income: 0, expense: 0 };
          if (entry.entry_type === 'income') {
            grouped[month].income += Number(entry.amount);
          } else {
            grouped[month].expense += Number(entry.amount);
          }
        });

        setMonthlyData(Object.entries(grouped).map(([month, data]) => ({
          month,
          ...data,
        })));
      }

      if (isAdmin || isBoardMember) {
        const { data: alerts } = await supabase
          .from('debt_alerts')
          .select('*')
          .eq('site_id', currentSite.id)
          .order('stage', { ascending: false })
          .limit(10);

        setDebtAlerts(alerts || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
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
    }).format(amount);
  };

  const COLORS = ['#002561', '#0066cc', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  if (!currentSite) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Site Selected</h2>
          <p className="text-gray-600 mb-6">Please select a site from the sidebar or create a new one.</p>
          {isAdmin && (
            <Link
              to="/sites/new"
              className="inline-flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
            >
              Add New Site
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          )}
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

  const budgetData = budgetCategories.map((cat, idx) => ({
    name: cat.category_name,
    planned: Number(cat.planned_amount),
    actual: Number(cat.actual_amount),
    color: COLORS[idx % COLORS.length],
  }));

  const pieData = budgetCategories.map((cat, idx) => ({
    name: cat.category_name,
    value: Number(cat.actual_amount),
    color: COLORS[idx % COLORS.length],
  })).filter(d => d.value > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{currentSite.name}</h1>
          <p className="text-gray-600">
            {activePeriod ? `Financial Period: ${activePeriod.name}` : 'No active financial period'}
          </p>
        </div>
        {!activePeriod && isAdmin && (
          <Link
            to="/fiscal-periods"
            className="inline-flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
          >
            Create Financial Period
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <StatCard
          title="Total Units"
          value={String(summary?.total_units || currentSite.total_units || 0)}
          subtitle={`${summary?.units_in_warning || 0} in warning, ${summary?.units_in_legal || 0} in legal`}
          icon={<Users className="w-5 h-5" />}
          color="bg-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Utilization</h3>
          {budgetData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgetData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#002561" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No budget data available
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Distribution</h3>
          {pieData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No expense data available
            </div>
          )}
        </div>
      </div>

      {monthlyData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Cash Flow</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981' }}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  name="Expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {(isAdmin || isBoardMember) && debtAlerts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">Debt Alerts</h3>
            </div>
            <Link
              to="/debt-tracking"
              className="text-[#002561] hover:underline text-sm font-medium flex items-center"
            >
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {debtAlerts.slice(0, 5).map((alert) => (
              <div key={alert.workflow_id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    alert.stage === 4 ? 'bg-red-100' :
                    alert.stage === 3 ? 'bg-orange-100' : 'bg-yellow-100'
                  }`}>
                    {alert.stage === 4 ? (
                      <Scale className="w-5 h-5 text-red-600" />
                    ) : (
                      <AlertTriangle className={`w-5 h-5 ${
                        alert.stage === 3 ? 'text-orange-600' : 'text-yellow-600'
                      }`} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {alert.block ? `${alert.block}-` : ''}{alert.unit_number}
                    </p>
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

      {!activePeriod && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <div className="flex items-start space-x-4">
            <Calendar className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">No Active Financial Period</h3>
              <p className="text-blue-700 mt-1">
                Create a financial period to start tracking budgets, dues, and financial data for this site.
              </p>
              {isAdmin && (
                <Link
                  to="/fiscal-periods"
                  className="inline-flex items-center mt-3 text-blue-600 font-medium hover:underline"
                >
                  Create Financial Period
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              )}
            </div>
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
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
