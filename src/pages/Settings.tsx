import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Settings as SettingsIcon, Building2, Percent, Save, Loader2,
  Trash2, Users, AlertTriangle, X, Edit2, Plus, Upload, FileSpreadsheet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import type { PenaltySettings, UnitType } from '../types/database';

export default function Settings() {
  const { currentSite, refreshSites } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingUnitType, setEditingUnitType] = useState<UnitType | null>(null);
  const [showAddUnitTypeModal, setShowAddUnitTypeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [penaltySettings, setPenaltySettings] = useState<PenaltySettings | null>(null);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);

  const [siteForm, setSiteForm] = useState({
    name: '',
    address: '',
    city: '',
    distribution_method: 'coefficient' as 'coefficient' | 'share_ratio',
    default_currency: 'TRY',
  });

  const [penaltyForm, setPenaltyForm] = useState({
    months_overdue_threshold: 3,
    penalty_percentage: 5,
    is_compound: false,
  });

  useEffect(() => {
    if (currentSite) {
      fetchData();
    }
  }, [currentSite]);

  const fetchData = async () => {
    if (!currentSite) return;
    setLoading(true);

    setSiteForm({
      name: currentSite.name,
      address: currentSite.address || '',
      city: currentSite.city || '',
      distribution_method: currentSite.distribution_method,
      default_currency: currentSite.default_currency || 'TRY',
    });

    const [penaltyRes, typesRes] = await Promise.all([
      supabase
        .from('penalty_settings')
        .select('*')
        .eq('site_id', currentSite.id)
        .maybeSingle(),
      supabase
        .from('unit_types')
        .select('*')
        .eq('site_id', currentSite.id)
        .order('name'),
    ]);

    if (penaltyRes.data) {
      setPenaltySettings(penaltyRes.data);
      setPenaltyForm({
        months_overdue_threshold: penaltyRes.data.months_overdue_threshold,
        penalty_percentage: penaltyRes.data.penalty_percentage,
        is_compound: penaltyRes.data.is_compound,
      });
    }

    setUnitTypes(typesRes.data || []);
    setLoading(false);
  };

  const saveSiteSettings = async () => {
    if (!currentSite) return;
    setSaving(true);

    await supabase
      .from('sites')
      .update({
        name: siteForm.name,
        address: siteForm.address || null,
        city: siteForm.city || null,
        distribution_method: siteForm.distribution_method,
        default_currency: siteForm.default_currency,
      })
      .eq('id', currentSite.id);

    await refreshSites();
    setSaving(false);
  };

  const savePenaltySettings = async () => {
    if (!currentSite) return;
    setSaving(true);

    await supabase
      .from('penalty_settings')
      .upsert({
        site_id: currentSite.id,
        months_overdue_threshold: penaltyForm.months_overdue_threshold,
        penalty_percentage: penaltyForm.penalty_percentage,
        is_compound: penaltyForm.is_compound,
      });

    await fetchData();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002561]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage site configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#002561] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Site Information</h2>
              <p className="text-sm text-gray-500">Basic site details</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Name
              </label>
              <input
                type="text"
                value={siteForm.name}
                onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <input
                type="text"
                value={siteForm.address}
                onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={siteForm.city}
                onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Currency
              </label>
              <select
                value={siteForm.default_currency}
                onChange={(e) => setSiteForm({ ...siteForm, default_currency: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
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
                Currency for monthly dues. Financial reports always use TRY.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Distribution Method
              </label>
              <select
                value={siteForm.distribution_method}
                onChange={(e) => setSiteForm({ ...siteForm, distribution_method: e.target.value as any })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              >
                <option value="coefficient">Unit Coefficient</option>
                <option value="share_ratio">Share Ratio (Arsa Payi)</option>
              </select>
            </div>

            <button
              onClick={saveSiteSettings}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
              <Percent className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Late Payment Penalty</h2>
              <p className="text-sm text-gray-500">Configure penalty settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Months Before Penalty
              </label>
              <input
                type="number"
                min="1"
                value={penaltyForm.months_overdue_threshold}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, months_overdue_threshold: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Penalty applies after this many months overdue
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Penalty Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={penaltyForm.penalty_percentage}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, penalty_percentage: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Monthly penalty rate applied to overdue amount
              </p>
            </div>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={penaltyForm.is_compound}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, is_compound: e.target.checked })}
                className="w-4 h-4 text-[#002561] rounded focus:ring-[#002561]"
              />
              <span className="text-sm text-gray-700">Compound interest (penalty on penalty)</span>
            </label>

            <button
              onClick={savePenaltySettings}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Penalty Settings
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Unit Types</h2>
                <p className="text-sm text-gray-500">{unitTypes.length} types configured</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddUnitTypeModal(true)}
              className="flex items-center px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Type
            </button>
          </div>

          <div className="space-y-2">
            {unitTypes.length > 0 ? (
              unitTypes.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{type.name}</p>
                    <p className="text-sm text-gray-500">
                      Coefficient: {type.coefficient}x
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingUnitType(type)}
                    className="p-2 text-blue-600 hover:bg-white rounded transition-colors"
                    title="Edit unit type"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No unit types configured yet
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Import Data</h2>
              <p className="text-sm text-gray-500">Bulk import units and residents</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Import units and residents from an Excel file. The file should have columns for unit number, type, resident name, email, and phone.
            </p>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import from Excel
            </button>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <h2 className="font-semibold text-red-900">Danger Zone</h2>
          </div>
          <p className="text-sm text-red-700 mb-4">
            These actions are irreversible. Please be careful.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Site
          </button>
        </div>
      </div>

      {showAddUnitTypeModal && currentSite && (
        <AddUnitTypeModal
          siteId={currentSite.id}
          onClose={() => setShowAddUnitTypeModal(false)}
          onAdded={() => {
            setShowAddUnitTypeModal(false);
            fetchData();
          }}
        />
      )}

      {editingUnitType && (
        <EditUnitTypeModal
          unitType={editingUnitType}
          onClose={() => setEditingUnitType(null)}
          onUpdated={() => {
            setEditingUnitType(null);
            fetchData();
          }}
        />
      )}

      {showImportModal && currentSite && (
        <ImportModal
          siteId={currentSite.id}
          unitTypes={unitTypes}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            // Optional: refresh or navigate
          }}
        />
      )}

      {showDeleteModal && currentSite && (
        <DeleteSiteModal
          site={currentSite}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={async () => {
            await refreshSites();
            navigate('/dashboard');
          }}
        />
      )}
    </div>
  );
}

interface AddUnitTypeModalProps {
  siteId: string;
  onClose: () => void;
  onAdded: () => void;
}

function AddUnitTypeModal({ siteId, onClose, onAdded }: AddUnitTypeModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [coefficient, setCoefficient] = useState(1);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setLoading(true);

    await supabase.from('unit_types').insert({
      site_id: siteId,
      name: name.trim(),
      coefficient: coefficient,
    });

    setLoading(false);
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Add Unit Type</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              placeholder="e.g., 2+1 Apartment"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Coefficient
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={coefficient}
              onChange={(e) => setCoefficient(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              placeholder="1.0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Weight factor for calculating dues (e.g., 1.5x for larger units)
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading || !name.trim()}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add Type
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditUnitTypeModalProps {
  unitType: UnitType;
  onClose: () => void;
  onUpdated: () => void;
}

function EditUnitTypeModal({ unitType, onClose, onUpdated }: EditUnitTypeModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(unitType.name);
  const [coefficient, setCoefficient] = useState(unitType.coefficient);

  const handleUpdate = async () => {
    if (!name.trim()) return;
    setLoading(true);

    await supabase
      .from('unit_types')
      .update({
        name: name.trim(),
        coefficient: coefficient,
      })
      .eq('id', unitType.id);

    setLoading(false);
    onUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Edit Unit Type</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              placeholder="e.g., 2+1 Apartment"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Coefficient
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={coefficient}
              onChange={(e) => setCoefficient(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
              placeholder="1.0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Weight factor for calculating dues (e.g., 1.5x for larger units)
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={loading || !name.trim()}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Update Type
          </button>
        </div>
      </div>
    </div>
  );
}

interface ImportModalProps {
  siteId: string;
  unitTypes: UnitType[];
  onClose: () => void;
  onImported: () => void;
}

function ImportModal({ siteId, unitTypes, onClose, onImported }: ImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        setPreview(jsonData.slice(0, 5));
      } catch (err) {
        setError('Failed to read Excel file. Please check the file format.');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet) as any[];

          const unitsToInsert = [];
          
          // Create type map once for O(1) lookup
          const typeMap = new Map(unitTypes.map(t => [t.name.toLowerCase().trim(), t.id]));
          // Fallback type (first one in the list)
          const defaultTypeId = unitTypes[0]?.id;

          // Helper to check multiple possible headers
          const getVal = (row: any, keys: string[]) => {
            for (const key of keys) {
              if (row[key] !== undefined) return row[key];
            }
            return '';
          };

          for (const row of jsonData) {
            const unitNumber = String(getVal(row, ['Unit Number', 'unit_number', 'Unit No', 'No', 'Kapı No', 'Daire No', 'Numara'])).trim();
            const typeName = String(getVal(row, ['Unit Type', 'unit_type', 'Type', 'Tip', 'Daire Tipi'])).trim();
            const residentName = String(getVal(row, ['Owner Name', 'owner_name', 'Owner', 'Name', 'Kat Maliki', 'Ad Soyad'])).trim();
            const email = String(getVal(row, ['Email', 'email', 'E-mail', 'Eposta'])).trim();
            const phone = String(getVal(row, ['Phone', 'phone', 'Mobile', 'Telefon', 'Cep'])).trim();
            const block = String(getVal(row, ['Block', 'block', 'Blok'])).trim();
            const floor = Number(getVal(row, ['Floor', 'floor', 'Kat'])) || 0;
            const shareRatio = Number(getVal(row, ['Share Ratio', 'share_ratio', 'Arsa Payı', 'Pay'])) || 0;

            if (!unitNumber) continue;

            const unitTypeID = typeMap.get(typeName.toLowerCase()) || defaultTypeId;

            unitsToInsert.push({
              site_id: siteId,
              unit_number: unitNumber,
              block: block || null,
              floor: floor || null,
              share_ratio: shareRatio || 0,
              unit_type_id: unitTypeID || null,
              owner_name: residentName || null,
              owner_email: email || null,
              owner_phone: phone || null,
            });
          }

          if (unitsToInsert.length > 0) {
            const { error: insertError } = await supabase.from('units').insert(unitsToInsert);
            if (insertError) throw insertError;
          } else {
            setError("No valid units found in the file.");
            setLoading(false);
            return;
          }

          setLoading(false);
          onImported();
          alert(`Successfully imported ${unitsToInsert.length} units!`);
        } catch (err: any) {
          console.error('Import error:', err);
          setError(`Import failed: ${err.message || 'Unknown error'}`);
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('An error occurred during import.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Import Units & Residents</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">Excel File Format</p>
            <p className="text-sm text-blue-700 mb-2">Your Excel file should have these columns (English or Turkish):</p>
            <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
              <li><strong>Unit Number</strong> / Kapı No (Required)</li>
              <li><strong>Type</strong> / Tip (Matches your Unit Types)</li>
              <li><strong>Block</strong> / Blok</li>
              <li><strong>Owner Name</strong> / Kat Maliki</li>
              <li><strong>Email</strong> / Eposta</li>
              <li><strong>Phone</strong> / Telefon</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Excel File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {preview.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Preview (first 5 rows)
              </h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(preview[0]).map((key) => (
                          <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.map((row, idx) => (
                        <tr key={idx}>
                          {Object.values(row).map((value: any, i) => (
                            <td key={i} className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Preview of data to be imported
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !file}
            className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Import Data
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteSiteModalProps {
  site: { id: string; name: string };
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteSiteModal({ site, onClose, onDeleted }: DeleteSiteModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email || '',
      password: password,
    });

    if (signInError) {
      setError('Incorrect password');
      setLoading(false);
      return;
    }

    await supabase
      .from('sites')
      .update({ is_active: false })
      .eq('id', site.id);

    setLoading(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Delete Site</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    <p className="font-medium text-red-900 mb-2">Warning: Data Loss</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This will permanently delete the site: <strong>{site.name}</strong></li>
                      <li>All financial periods, budget data, and financial records will be removed</li>
                      <li>All unit information and resident data will be deleted</li>
                      <li>Payment history and ledger entries will be permanently lost</li>
                    </ul>
                  </div>
                </div>
              </div>

              <p className="text-gray-600">
                Are you sure you want to proceed? This action cannot be undone.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-700">
                    <p className="font-medium text-orange-900 mb-2">Confirm Identity</p>
                    <p>Please enter your password to confirm deletion.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter your password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Your account password"
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-red-600 mt-2">{error}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              I Understand, Continue
            </button>
          ) : (
            <button
              onClick={handleDelete}
              disabled={loading || !password}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete Site Permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
}