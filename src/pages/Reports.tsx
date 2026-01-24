import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  FileText, Download, Loader2, TrendingUp, TrendingDown,
  Users, AlertTriangle, Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import type { FiscalPeriod } from '../types/database';

export default function Reports() {
  const { currentSite, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<FiscalPeriod | null>(null);
  const [transparencyData, setTransparencyData] = useState<any>(null);
  const [collectionData, setCollectionData] = useState<any[]>([]);

  const isHomeowner = currentRole?.role === 'homeowner';

  useEffect(() => {
    if (currentSite) {
      fetchData();
    }
  }, [currentSite]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data: period } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('site_id', currentSite.id)
      .eq('status', 'active')
      .maybeSingle();

    setActivePeriod(period);

    if (period) {
      const { data: report } = await supabase
        .from('transparency_report')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('fiscal_period_id', period.id)
        .maybeSingle();

      setTransparencyData(report);

      const { data: summary } = await supabase
        .from('site_financial_summary')
        .select('*')
        .eq('site_id', currentSite.id)
        .eq('fiscal_period_id', period.id)
        .maybeSingle();

      if (summary) {
        setCollectionData([
          { name: 'Collected', value: summary.total_collected, color: '#10b981' },
          { name: 'Outstanding', value: summary.total_dues_generated - summary.total_collected, color: '#ef4444' },
        ]);
      }
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

  const COLORS = ['#002561', '#0066cc', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  if (!activePeriod) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Period</h2>
          <p className="text-gray-600">Reports will be available once a financial period is active.</p>
        </div>
      </div>
    );
  }

  const budgetBreakdown = transparencyData?.budget_breakdown || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">
            {isHomeowner ? 'Site Transparency Report' : 'Financial Reports'} - {activePeriod.name}
          </p>
        </div>
        <button
          className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">
          {isHomeowner ? 'Site Financial Transparency' : 'Financial Overview'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Budget"
            value={formatCurrency(transparencyData?.total_budget || 0)}
            icon={<Building2 className="w-5 h-5" />}
            color="bg-[#002561]"
          />
          <StatCard
            title="Total Collected"
            value={formatCurrency(transparencyData?.total_dues_collected || 0)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="bg-green-600"
          />
          <StatCard
            title="Total Spent"
            value={formatCurrency(transparencyData?.total_expenses || 0)}
            icon={<TrendingDown className="w-5 h-5" />}
            color="bg-orange-500"
          />
          <StatCard
            title="Total Units"
            value={String(transparencyData?.total_units || 0)}
            icon={<Users className="w-5 h-5" />}
            color="bg-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="font-medium text-gray-900 mb-4">Collection Status</h3>
            {collectionData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={collectionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {collectionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No collection data
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="font-medium text-gray-900 mb-4">Budget vs Actual Spending</h3>
            {budgetBreakdown.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={budgetBreakdown}
                    layout="vertical"
                    margin={{ left: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={75} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="planned" name="Planned" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="actual" name="Actual" fill="#002561" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500">
                No budget data
              </div>
            )}
          </div>
        </div>
      </div>

      {budgetBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Budget Utilization Details</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Planned
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actual
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Utilization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {budgetBreakdown.map((item: any, index: number) => {
                  const utilization = item.utilization || 0;
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {item.category}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">
                        {formatCurrency(item.planned)}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-900 font-medium">
                        {formatCurrency(item.actual)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-medium ${
                          utilization > 100 ? 'text-red-600' :
                          utilization > 80 ? 'text-orange-600' : 'text-green-600'
                        }`}>
                          {utilization.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              utilization > 100 ? 'bg-red-500' :
                              utilization > 80 ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900">About This Report</h3>
            <p className="text-blue-700 mt-1 text-sm">
              This transparency report shows how the site's budget is being managed. All homeowners
              can view this report to understand the financial health of the property. Income comes
              from monthly dues collected, and expenses are categorized by type.
            </p>
            <p className="text-blue-600 mt-2 text-xs">
              Report generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm">{title}</span>
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center text-white`}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
