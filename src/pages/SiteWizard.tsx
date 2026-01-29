import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Building2, Calendar, Layers, Users, ArrowRight, ArrowLeft,
  Check, Loader2, Upload, Plus, Trash2, X, FileSpreadsheet
} from 'lucide-react';
import { format, addMonths } from 'date-fns';
import * as XLSX from 'xlsx';
import { EXPENSE_CATEGORIES } from '../lib/constants';

interface UnitTypeInput {
  name: string;
  coefficient: number;
  description: string;
}

interface UnitInput {
  unit_number: string;
  block: string;
  floor: number;
  unit_type: string;
  share_ratio: number;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
}

const STEPS = [
  { id: 1, name: 'Site Info', icon: Building2 },
  { id: 2, name: 'Financial Period', icon: Calendar },
  { id: 3, name: 'Unit Types', icon: Layers },
  { id: 4, name: 'Import Units', icon: Users },
];

export default function SiteWizard() {
  const navigate = useNavigate();
  const { user, refreshSites } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteCity, setSiteCity] = useState('');
  const [distributionMethod, setDistributionMethod] = useState<'coefficient' | 'share_ratio'>('coefficient');
  const [defaultCurrency, setDefaultCurrency] = useState('TRY');

  const [fiscalStartMonth, setFiscalStartMonth] = useState(new Date().getMonth() + 1);
  const [fiscalStartYear, setFiscalStartYear] = useState(new Date().getFullYear());
  const [totalBudget, setTotalBudget] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    EXPENSE_CATEGORIES.slice(0, 6) as unknown as string[]
  );
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, number>>({});
  const [customCategory, setCustomCategory] = useState('');

  const [unitTypes, setUnitTypes] = useState<UnitTypeInput[]>([
    { name: 'Standard', coefficient: 1.0, description: 'Standard apartment' },
  ]);

  const [units, setUnits] = useState<UnitInput[]>([]);
  const [fileUploaded, setFileUploaded] = useState(false);

  // ✅ Function to generate and download the template
  const downloadTemplate = () => {
    const templateData = [
      {
        'Unit Number': '1',
        'Block': 'A',
        'Floor': 1,
        'Unit Type': unitTypes[0]?.name || 'Standard', // Use the first type defined
        'Share Ratio': 10,
        'Owner Name': 'John Doe',
        'Phone': '555-0101',
        'Email': 'john@example.com'
      },
      {
        'Unit Number': '2',
        'Block': 'A',
        'Floor': 2,
        'Unit Type': unitTypes[0]?.name || 'Standard',
        'Share Ratio': 15,
        'Owner Name': 'Jane Smith',
        'Phone': '555-0102',
        'Email': 'jane@example.com'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Units Template");
    XLSX.writeFile(wb, "site_units_template.xlsx");
  };

  const handleNext = () => {
    if (currentStep === 1 && !siteName.trim()) {
      setError('Site name is required');
      return;
    }
    setError('');
    setCurrentStep(prev => Math.min(prev + 1, 4));
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        // --- UPDATED PARSING LOGIC (Handles EN/TR headers) ---
        const parsedUnits: UnitInput[] = json.map(row => {
            // Helper to get value from multiple possible keys
            const getVal = (keys: string[]) => {
                for (const key of keys) {
                    if (row[key] !== undefined) return row[key];
                }
                return '';
            };

            return {
                unit_number: String(getVal(['Unit Number', 'unit_number', 'Unit No', 'No', 'Kapı No', 'Daire No', 'Numara'])).trim(),
                block: String(getVal(['Block', 'block', 'Blok'])).trim(),
                floor: Number(getVal(['Floor', 'floor', 'Kat'])) || 0,
                unit_type: String(getVal(['Unit Type', 'unit_type', 'Type', 'Tip', 'Daire Tipi'])) || 'Standard',
                share_ratio: Number(getVal(['Share Ratio', 'share_ratio', 'Arsa Payı', 'Pay'])) || 0,
                owner_name: String(getVal(['Owner Name', 'owner_name', 'Owner', 'Name', 'Kat Maliki', 'Ad Soyad'])).trim(),
                owner_phone: String(getVal(['Phone', 'phone', 'Mobile', 'Telefon', 'Cep'])).trim(),
                owner_email: String(getVal(['Email', 'email', 'E-mail', 'Eposta'])).trim(),
            };
        }).filter(u => u.unit_number); // Only keep rows with a unit number

        if (parsedUnits.length === 0) {
            setError('No valid units found. Please check your column headers.');
            return;
        }

        setUnits(parsedUnits);
        setFileUploaded(true);
        setError('');
      } catch (err) {
        console.error("Excel parse error:", err);
        setError('Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const addManualUnit = () => {
    setUnits([...units, {
      unit_number: '',
      block: '',
      floor: 0,
      unit_type: unitTypes[0]?.name || 'Standard',
      share_ratio: 0,
      owner_name: '',
      owner_phone: '',
      owner_email: '',
    }]);
  };

  const removeUnit = (index: number) => {
    setUnits(units.filter((_, i) => i !== index));
  };

  const updateUnit = (index: number, field: keyof UnitInput, value: string | number) => {
    const updated = [...units];
    updated[index] = { ...updated[index], [field]: value };
    setUnits(updated);
  };

  const handleComplete = async () => {
    if (units.length === 0) {
      setError('Please add at least one unit');
      return;
    }

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
        name: ut.name.trim(), // Trim whitespace
        coefficient: ut.coefficient,
        description: ut.description,
      }));

      const { data: createdTypes } = await supabase
        .from('unit_types')
        .insert(unitTypesData)
        .select();

      // Create a Map for easy lookup (normalize keys to lowercase)
      const typeMap = new Map(
        createdTypes?.map(t => [t.name.toLowerCase().trim(), t.id]) || []
      );
      
      // Fallback ID (use the first created type if exact match fails)
      const defaultTypeId = createdTypes?.[0]?.id || null;

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

      // 6. Prepare Units Data (With Safer Mapping)
      const unitsData = units.filter(u => u.unit_number.trim()).map(u => {
        // Try to match exact name, then lowercase, then fallback to default
        const typeName = u.unit_type?.toLowerCase().trim();
        const typeId = typeMap.get(typeName) || defaultTypeId;

        return {
          site_id: site.id,
          unit_type_id: typeId, // ✅ Uses fallback if match fails
          unit_number: u.unit_number,
          block: u.block || null,
          floor: u.floor || null,
          share_ratio: u.share_ratio || 0,
          owner_name: u.owner_name || null,
          owner_phone: u.owner_phone || null,
          owner_email: u.owner_email || null,
        };
      });

      const { error: unitsError } = await supabase.from('units').insert(unitsData);
      if (unitsError) throw unitsError; // Catch unit insertion errors

      // 7. Generate Dues if Active
      if (calculatedTotalBudget > 0 && fiscalPeriod.status === 'active') {
        await supabase.rpc('generate_fiscal_period_dues', {
          p_fiscal_period_id: fiscalPeriod.id,
        });
      }

      await refreshSites();
      
      // ✅ Force a small delay to ensure DB propagation before redirect
      setTimeout(() => {
        navigate('/dashboard');
      }, 500);

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

        <form 
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
          onSubmit={(e) => e.preventDefault()}
        >
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

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
                  <option value="CHF">Swiss Franc (CHF)</option>
                  <option value="JPY">Japanese Yen (JPY)</option>
                  <option value="CNY">Chinese Yuan (CNY)</option>
                  <option value="CAD">Canadian Dollar (CAD)</option>
                  <option value="AUD">Australian Dollar (AUD)</option>
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

          {currentStep === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Import Units</h2>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Upload Excel file with unit data</p>
                <p className="text-sm text-gray-500 mb-4">
                  Columns: Unit Number, Block, Floor, Unit Type, Share Ratio, Owner Name, Phone, Email
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <label className="inline-flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg cursor-pointer hover:bg-[#003380] transition-colors">
                    <Upload className="w-4 h-4 mr-2" />
                    Select File
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  
                  {/* ✅ Download Template Button */}
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                    Download Template
                  </button>
                </div>
              </div>

              {fileUploaded && (
                <div className="flex items-center text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                  <Check className="w-5 h-5 mr-2" />
                  {units.length} units loaded from file
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Or add units manually</span>
                <button
                  type="button"
                  onClick={addManualUnit}
                  className="flex items-center text-[#002561] hover:underline text-sm font-medium"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Unit
                </button>
              </div>

              {units.length > 0 && (
                <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Unit #</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Block</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Owner</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {units.map((unit, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={unit.unit_number}
                              onChange={(e) => updateUnit(index, 'unit_number', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={unit.block}
                              onChange={(e) => updateUnit(index, 'block', e.target.value)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={unit.unit_type}
                              onChange={(e) => updateUnit(index, 'unit_type', e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded"
                            >
                              {unitTypes.map((ut) => (
                                <option key={ut.name} value={ut.name}>
                                  {ut.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={unit.owner_name}
                              onChange={(e) => updateUnit(index, 'owner_name', e.target.value)}
                              className="w-32 px-2 py-1 border border-gray-300 rounded"
                              placeholder="Owner name"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => removeUnit(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

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

            {currentStep < 4 ? (
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