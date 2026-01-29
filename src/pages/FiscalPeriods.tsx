import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Calendar, Plus, Loader2, Save, X, AlertCircle, DollarSign, Users
} from 'lucide-react';
import { format } from 'date-fns';
import type { FiscalPeriod } from '../types/database';

export default function FiscalPeriods() {
  const { currentSite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showExtraFeeModal, setShowExtraFeeModal] = useState(false); // New Modal State

  // Standard Fiscal Period Form
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
  });

  // New Extra Fee Form
  const [extraFeeData, setExtraFeeData] = useState({
    description: '',
    amount: '',
    currency_code: 'TRY', // Default
    due_date: format(new Date(), 'yyyy-MM-dd'),
  });
  const [creatingExtra, setCreatingExtra] = useState(false);

  useEffect(() => {
    if (currentSite) {
      fetchPeriods();
    }
  }, [currentSite]);

  const fetchPeriods = async () => {
    try {
      const { data, error } = await supabase
        .from('fiscal_periods')
        .select('*')
        .eq('site_id', currentSite?.id)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setPeriods(data || []);
    } catch (error) {
      console.error('Error fetching periods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite) return;

    try {
      const { error } = await supabase.from('fiscal_periods').insert({
        site_id: currentSite.id,
        name: formData.name,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: 'active'
      });

      if (error) throw error;
      setShowModal(false);
      setFormData({ name: '', start_date: '', end_date: '' });
      fetchPeriods();
    } catch (error) {
      console.error('Error saving period:', error);
      alert('Failed to save fiscal period');
    }
  };

  // --- LOGIC TO CREATE EXTRA FEE ---
  const handleCreateExtraFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !extraFeeData.amount || !extraFeeData.description) return;
    
    if(!confirm(`Are you sure you want to add a debt of ${extraFeeData.amount} ${extraFeeData.currency_code} to ALL units for "${extraFeeData.description}"?`)) return;

    setCreatingExtra(true);
    try {
      // 1. Get all units in this site
      const { data: units, error: unitError } = await supabase
        .from('units')
        .select('id')
        .eq('site_id', currentSite.id);

      if (unitError) throw unitError;
      if (!units || units.length === 0) throw new Error('No units found');

      // 2. Prepare inserts for Dues table
      const duesInserts = units.map(unit => ({
        unit_id: unit.id,
        month_date: extraFeeData.due_date, // Using the selected date
        total_amount: Number(extraFeeData.amount),
        currency_code: extraFeeData.currency_code,
        status: 'pending',
        description: extraFeeData.description // Uses the new column
      }));

      // 3. Batch insert
      const { error: insertError } = await supabase
        .from('dues')
        .insert(duesInserts);

      if (insertError) throw insertError;

      alert('Extra fees created successfully!');
      setShowExtraFeeModal(false);
      setExtraFeeData({ description: '', amount: '', currency_code: 'TRY', due_date: format(new Date(), 'yyyy-MM-dd') });

    } catch (error) {
      console.error('Error creating extra fees:', error);
      alert('Failed to create extra fees.');
    } finally {
      setCreatingExtra(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fiscal Periods</h1>
          <p className="text-gray-600">Manage financial years and budgets</p>
        </div>
        
        <div className="flex gap-2">
          {/* Create Fiscal Period Button */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Period
          </button>

          {/* New Extra Fee Button */}
          <button
            onClick={() => setShowExtraFeeModal(true)}
            className="flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Add Extra Fee
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {periods.map((period) => (
              <tr key={period.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{period.name}</td>
                <td className="px-6 py-4 text-gray-500">{new Date(period.start_date).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-gray-500">{new Date(period.end_date).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    period.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {period.status}
                  </span>
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No fiscal periods found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Standard Period Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">New Fiscal Period</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSavePeriod} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period Name</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., 2024 Fiscal Year" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" required value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" required value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#002561] text-white rounded-lg">Create Period</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EXTRA FEE MODAL --- */}
      {showExtraFeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border-t-4 border-amber-500">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Add One-Time Extra Fee
              </h3>
              <button onClick={() => setShowExtraFeeModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4 bg-amber-50 p-3 rounded border border-amber-100">
              This will create a <strong>one-time debt</strong> for EVERY unit in the site. 
              Use this for specific expenses like roof repairs, painting, or emergency funds.
            </p>

            <form onSubmit={handleCreateExtraFee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description / Title</label>
                <input 
                  type="text" 
                  required 
                  value={extraFeeData.description} 
                  onChange={e => setExtraFeeData({...extraFeeData, description: e.target.value})} 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500" 
                  placeholder="e.g., Roof Repair 2024" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Per Unit)</label>
                  <input 
                    type="number" 
                    required 
                    value={extraFeeData.amount} 
                    onChange={e => setExtraFeeData({...extraFeeData, amount: e.target.value})} 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500" 
                    placeholder="0.00" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select 
                    value={extraFeeData.currency_code} 
                    onChange={e => setExtraFeeData({...extraFeeData, currency_code: e.target.value})} 
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input 
                  type="date" 
                  required 
                  value={extraFeeData.due_date} 
                  onChange={e => setExtraFeeData({...extraFeeData, due_date: e.target.value})} 
                  className="w-full px-3 py-2 border rounded-lg" 
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowExtraFeeModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button 
                  type="submit" 
                  disabled={creatingExtra}
                  className="flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {creatingExtra && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create Debt for All
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}