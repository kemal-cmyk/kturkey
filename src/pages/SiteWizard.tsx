import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Building2, Calendar, Layers, ArrowRight, ArrowLeft,
  Check, Loader2, Plus, Trash2, X
} from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { EXPENSE_CATEGORIES } from '../lib/constants';

interface UnitTypeInput {
  name: string;
  coefficient: number;
  description: string;
}

const STEPS = [
  { id: 1, name: 'Site Info', icon: Building2 },
  { id: 2, name: 'Financial Period', icon: Calendar },
  { id: 3, name: 'Unit Types', icon: Layers },
];

export default function SiteWizard() {
  const navigate = useNavigate();
  const { user, refreshSites } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Site Info
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteCity, setSiteCity] = useState('');
  const [distributionMethod, setDistributionMethod] = useState<'coefficient' | 'share_ratio'>('coefficient');
  const [defaultCurrency, setDefaultCurrency] = useState('TRY');

  // Step 2: Financial
  const [fiscalStartMonth, setFiscalStartMonth] = useState(new Date().getMonth() + 1);
  const [fiscalStartYear, setFiscalStartYear] = useState(new Date().getFullYear());
  const [totalBudget, setTotalBudget] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    EXPENSE_CATEGORIES.slice(0, 6) as unknown as string[]
  );
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, number>>({});
  const [customCategory, setCustomCategory] = useState('');

  // Step 3: Unit Types
  const [unitTypes, setUnitTypes] = useState<UnitTypeInput[]>([
    { name: 'Standard', coefficient: 1.0, description: 'Standard apartment' },
  ]);

  const handleNext = () => {
    if (currentStep === 1 && !siteName.trim()) {
      setError('Site name is required');
      return;
    }
    setError('');
    setCurrentStep(prev => Math.min(prev + 1, 3)); // Max step is now 3
  };

  const handleBack = () => {
    setError('');
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const addUnitType = () => {
    setUnitTypes([...unitTypes, { name: '', coefficient: 1.0, description: '' }]);
  };

  const removeUnitType = (index: number) => {
    if (unitTypes.length > 1) {
      setUnitTypes(unitTypes.filter((_, i) => i !== index));
    }
  };

  const updateUnitType = (index: number, field: keyof UnitTypeInput, value: string | number) => {
    const updated = [...unitTypes];
    updated[index] = { ...updated[index], [field]: value };
    setUnitTypes(updated);
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      // 1. Create Site
      const { data: site, error: siteError } = await supabase
        .from('sites')
        .insert({
          name: siteName,
          address: siteAddress,
          city: siteCity,
          distribution_method: distributionMethod,
          default_currency: defaultCurrency,
          total_units: 0,
        })
        .select()
        .single();

      if (siteError) throw siteError;

      // 2. Assign Admin Role
      await supabase.from('user_site_roles').insert({
        user_id: user?.id,
        site_id: site.id,
        role: 'admin',
      });

      // 3. Create Unit Types
      const unitTypesData = unitTypes.filter(ut => ut.name.trim()).map(ut => ({
        site_id: site.id,
        name: ut.name.trim(),
        coefficient: ut.coefficient,
        description: ut.description,
      }));

      await supabase.from('unit_types').insert(unitTypesData);

      // 4. Create Fiscal Period
      const startDate = new Date(fiscalStartYear, fiscalStartMonth - 1, 1);
      const endDate = addMonths(startDate, 12);
      const periodName = `${format(startDate, 'MMM yyyy')} - ${format(addMonths(startDate, 11), 'MMM yyyy')}`;

      const calculatedTotalBudget = Object.values(categoryAmounts).reduce((sum, val) => sum + (val || 0), 0);

      const { data: fiscalPeriod, error: fpError } = await supabase
        .from('fiscal_periods')
        .insert({
          site_id: site.id,
          name: periodName,
          start_date: format(startDate, 'yyyy-MM-dd'),
          end_date: format(endDate, 'yyyy-MM-dd'),
          total_budget: calculatedTotalBudget,
          status: calculatedTotalBudget > 0 ? 'active' : 'draft',
        })
        .select()
        .single();

      if (fpError) throw fpError;

      // 5. Create Budget Categories
      if (selectedCategories.length > 0) {
        const categoriesData = selectedCategories.map((cat, idx) => ({
          fiscal_period_id: fiscalPeriod.id,
          category_name: cat,
          planned_amount: categoryAmounts[cat] || 0,
          display_order: idx,
        }));

        await supabase.from('budget_categories').insert(categoriesData);
      }

      // Note: We don't generate dues here anymore because there are no units yet.
      // Dues will be generated when units are imported in Settings.

      await refreshSites();
      navigate('/dashboard');
    } catch (err: any) {
      console.error("Setup Error:", err);
      setError(err.message || 'Failed to create site');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Site Setup Wizard</h1>
          <p className="text-gray-600 mt-2">Create a new property site in a few simple steps</p>
        </div>

        {/* Step Indicators */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isComplete = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                        isComplete
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-[#002561] text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {isComplete ? <Check className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                    </div>
                    <span
                      className={`mt-2 text-sm font-medium ${
                        isCurrent ? 'text-[#002561]' : 'text-gray-500'
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-16 sm:w-24 h-1 mx-2 rounded ${
                        currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Container */}
        <form 
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
          onSubmit={(e) => e.preventDefault()}
        >
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* STEP 1: Site Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Site Information</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Site Name *
                </label>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                  placeholder="e.g., Blue Valley Apartments"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Address
                </label>
                <input
                  type="text"
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                  placeholder="Street address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  City
                </label>
                <input
                  type="text"
                  value={siteCity}
                  onChange={(e) => setSiteCity(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                  placeholder="e.g., Istanbul"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Default Currency
                </label>
                <select
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                >
                  <option value="TRY">Turkish Lira (TRY)</option>
                  <option value="USD">US Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="GBP">British Pound (GBP)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  This will be the reporting currency for budgets and financial statements
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Budget Distribution Method
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setDistributionMethod('coefficient')}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      distributionMethod === 'coefficient'
                        ? 'border-[#002561] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">Unit Coefficient</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Based on unit type (Standard=1.0, Duplex=1.5, etc.)
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionMethod('share_ratio')}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      distributionMethod === 'share_ratio'
                        ? 'border-[#002561] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">Share Ratio (Arsa Payi)</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Based on ownership share percentage
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Financial Period */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Financial Period Setup</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Start Month
                  </label>
                  <select
                    value={fiscalStartMonth}
                    onChange={(e) => setFiscalStartMonth(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {format(new Date(2000, i), 'MMMM')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Start Year
                  </label>
                  <select
                    value={fiscalStartYear}
                    onChange={(e) => setFiscalStartYear(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                  >
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() + i - 1;
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Budget Categories
                  </label>
                  <span className="text-sm text-gray-500">
                    Total: {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(
                      Object.values(categoryAmounts).reduce((sum, val) => sum + (val || 0), 0)
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCategories.includes(cat)
                          ? 'border-[#002561] bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCategories([...selectedCategories, cat]);
                          } else {
                            setSelectedCategories(selectedCategories.filter(c => c !== cat));
                            const newAmounts = { ...categoryAmounts };
                            delete newAmounts[cat];
                            setCategoryAmounts(newAmounts);
                          }
                        }}
                        className="w-4 h-4 text-[#002561] rounded focus:ring-[#002561]"
                      />
                      <span className="ml-2 text-sm">{cat}</span>
                    </label>
                  ))}
                </div>

                {selectedCategories.filter(c => !EXPENSE_CATEGORIES.includes(c as typeof EXPENSE_CATEGORIES[number])).length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Custom Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCategories
                        .filter(c => !EXPENSE_CATEGORIES.includes(c as typeof EXPENSE_CATEGORIES[number]))
                        .map(cat => (
                          <span
                            key={cat}
                            className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-[#002561] rounded-full text-sm"
                          >
                            {cat}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategories(selectedCategories.filter(c => c !== cat));
                                const newAmounts = { ...categoryAmounts };
                                delete newAmounts[cat];
                                setCategoryAmounts(newAmounts);
                              }}
                              className="ml-2 hover:text-red-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex space-x-2 mb-6">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customCategory.trim() && !selectedCategories.includes(customCategory.trim())) {
                        e.preventDefault();
                        setSelectedCategories([...selectedCategories, customCategory.trim()]);
                        setCustomCategory('');
                      }
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                    placeholder="Add custom category..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customCategory.trim() && !selectedCategories.includes(customCategory.trim())) {
                        setSelectedCategories([...selectedCategories, customCategory.trim()]);
                        setCustomCategory('');
                      }
                    }}
                    disabled={!customCategory.trim() || selectedCategories.includes(customCategory.trim())}
                    className="px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {selectedCategories.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Budget Amounts per Category
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (totalBudget > 0 && selectedCategories.length > 0) {
                          const perCategory = Math.floor(totalBudget / selectedCategories.length);
                          const newAmounts: Record<string, number> = {};
                          selectedCategories.forEach(cat => {
                            newAmounts[cat] = perCategory;
                          });
                          setCategoryAmounts(newAmounts);
                        }
                      }}
                      className="text-sm text-[#002561] hover:underline font-medium"
                    >
                      Distribute Evenly
                    </button>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Reference Total Budget (TRY)</span>
                      <input
                        type="number"
                        value={totalBudget || ''}
                        onChange={(e) => setTotalBudget(Number(e.target.value))}
                        className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-[#002561]"
                        placeholder="e.g., 500000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedCategories.map(cat => (
                      <div key={cat} className="flex items-center space-x-3 bg-white border border-gray-200 rounded-lg p-3">
                        <span className="flex-1 text-sm font-medium text-gray-700 truncate">{cat}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400">TRY</span>
                          <input
                            type="number"
                            value={categoryAmounts[cat] || ''}
                            onChange={(e) => setCategoryAmounts({ ...categoryAmounts, [cat]: Number(e.target.value) })}
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-[#002561]"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Unit Types */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Unit Types</h2>
                <button
                  type="button"
                  onClick={addUnitType}
                  className="flex items-center text-[#002561] hover:underline text-sm font-medium"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Type
                </button>
              </div>

              <div className="space-y-4">
                {unitTypes.map((ut, index) => (
                  <div
                    key={index}
                    className="p-4 border border-gray-200 rounded-lg space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-medium text-gray-500">Type #{index + 1}</span>
                      {unitTypes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeUnitType(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={ut.name}
                          onChange={(e) => updateUnitType(index, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                          placeholder="e.g., Duplex"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Coefficient
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={ut.coefficient}
                          onChange={(e) => updateUnitType(index, 'coefficient', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={ut.description}
                          onChange={(e) => updateUnitType(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            )}

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center px-6 py-2.5 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors"
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={loading}
                className="flex items-center px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Complete Setup
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}