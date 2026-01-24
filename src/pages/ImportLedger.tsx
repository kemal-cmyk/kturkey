import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ExcelRow {
  [key: string]: any;
}

interface MappedEntry {
  entry_date: string;
  entry_type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  account_name?: string;
  unit_number?: string;
  errors?: string[];
}

export default function ImportLedger() {
  const navigate = useNavigate();
  const { user, currentSite } = useAuth();
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedData, setMappedData] = useState<MappedEntry[]>([]);
  const [columnMapping, setColumnMapping] = useState({
    entry_date: '',
    account: '',
    category: '',
    description: '',
    debit: '',
    credit: '',
    unit_number: ''
  });
  const [fiscalPeriods, setFiscalPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [units, setUnits] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [importResults, setImportResults] = useState({ success: 0, errors: 0, errorDetails: [] as string[] });

  useEffect(() => {
    if (currentSite) {
      loadFiscalPeriods();
      loadUnits();
      loadCategories();
      loadAccounts();
    }
  }, [currentSite]);

  const loadFiscalPeriods = async () => {
    if (!currentSite) return;

    const { data } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('site_id', currentSite.id)
      .in('status', ['active', 'draft', 'closed'])
      .order('start_date', { ascending: false });
    if (data) {
      setFiscalPeriods(data);
      const current = data.find(p => p.status === 'active');
      if (current) setSelectedPeriod(current.id);
    }
  };

  const loadUnits = async () => {
    if (!currentSite) return;

    const { data } = await supabase
      .from('units')
      .select('id, unit_number')
      .eq('site_id', currentSite.id)
      .order('unit_number');
    if (data) setUnits(data);
  };

  const loadCategories = async () => {
    if (!currentSite) return;

    const { data: budgetData } = await supabase
      .from('budget_categories')
      .select('category_name')
      .eq('site_id', currentSite.id)
      .order('category_name');

    const categorySet = new Set<string>();
    budgetData?.forEach(b => categorySet.add(b.category_name));
    setCategories(Array.from(categorySet));
  };

  const loadAccounts = async () => {
    if (!currentSite) return;

    const { data } = await supabase
      .from('accounts')
      .select('id, account_name, account_type')
      .eq('site_id', currentSite.id)
      .order('account_name');
    if (data) setAccounts(data);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
          raw: false,
          defval: '',
          blankrows: false
        });

        if (jsonData.length > 0) {
          const detectedHeaders = Object.keys(jsonData[0]);
          console.log('Detected headers:', detectedHeaders);
          console.log('First row sample:', jsonData[0]);

          setExcelData(jsonData as ExcelRow[]);
          setHeaders(detectedHeaders);
          setStep('mapping');
        } else {
          alert('No data found in the Excel file. Please check the file format.');
        }
      } catch (error) {
        console.error('Error reading Excel file:', error);
        alert('Error reading Excel file. Please ensure it is a valid Excel file.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const parseDDMMYYYYDate = (dateStr: string): string => {
    if (!dateStr) return '';

    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return dateStr;
  };

  const handleMapping = () => {
    const mapped = excelData.map((row, index) => {
      const debitValue = parseFloat(row[columnMapping.debit]) || 0;
      const creditValue = parseFloat(row[columnMapping.credit]) || 0;

      let entryType: 'income' | 'expense' = 'expense';
      let amount = 0;

      if (debitValue > 0) {
        entryType = 'expense';
        amount = debitValue;
      } else if (creditValue > 0) {
        entryType = 'income';
        amount = creditValue;
      }

      const rawDate = row[columnMapping.entry_date] || '';
      const parsedDate = parseDDMMYYYYDate(rawDate);

      const entry: MappedEntry = {
        entry_date: parsedDate,
        entry_type: entryType,
        category: row[columnMapping.category] || '',
        description: row[columnMapping.description] || '',
        amount: amount,
        account_name: row[columnMapping.account] || '',
        unit_number: row[columnMapping.unit_number] || '',
        errors: []
      };

      if (!entry.entry_date) entry.errors?.push('Missing date');
      if (!entry.category) entry.errors?.push('Missing category');
      if (!entry.description) entry.errors?.push('Missing description');
      if (!entry.amount || entry.amount <= 0) entry.errors?.push('Invalid amount (both debit and credit are zero or empty)');
      if (!entry.account_name) entry.errors?.push('Missing account');

      const isMaintenanceRelated = entryType === 'income' && (entry.category === 'Maintenance Fee' || entry.category === 'Maintenance Fees' || entry.category === 'Extra Fees');
      if (isMaintenanceRelated && !entry.unit_number) {
        entry.errors?.push('Unit number required for maintenance/extra fees');
      }

      return entry;
    });

    setMappedData(mapped);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!selectedPeriod) {
      alert('Please select a fiscal period');
      return;
    }

    if (!currentSite) {
      alert('No site selected. Please refresh the page.');
      return;
    }

    setStep('importing');
    let successCount = 0;
    let errorCount = 0;
    const errorDetails: string[] = [];

    const validEntries = mappedData.filter(entry => !entry.errors || entry.errors.length === 0);

    console.log('Starting import for', validEntries.length, 'entries');
    console.log('Site ID:', currentSite.id);
    console.log('User ID:', user?.id);
    console.log('Period ID:', selectedPeriod);

    for (const entry of validEntries) {
      try {
        let unitId = null;
        if (entry.unit_number) {
          const unit = units.find(u => u.unit_number === entry.unit_number);
          if (unit) {
            unitId = unit.id;
          } else {
            errorDetails.push(`${entry.description}: Unit "${entry.unit_number}" not found`);
            errorCount++;
            continue;
          }
        }

        let accountId = null;
        if (entry.account_name) {
          const account = accounts.find(a => a.account_name === entry.account_name);
          if (account) {
            accountId = account.id;
          } else {
            errorDetails.push(`${entry.description}: Account "${entry.account_name}" not found`);
            errorCount++;
            continue;
          }
        }

        const isMaintenanceRelated = entry.entry_type === 'income' && (entry.category === 'Maintenance Fee' || entry.category === 'Maintenance Fees' || entry.category === 'Extra Fees');

        if (isMaintenanceRelated && unitId && accountId) {
          console.log('Processing maintenance payment for unit:', unitId);

          const { error } = await supabase.rpc('apply_unit_payment', {
            p_unit_id: unitId,
            p_payment_amount: entry.amount,
            p_payment_date: entry.entry_date,
            p_payment_method: 'bank_transfer',
            p_reference_no: null,
            p_account_id: accountId,
            p_category: entry.category,
          });

          if (error) {
            console.error('Error applying payment to unit:', error);
            errorDetails.push(`${entry.description}: ${error.message}`);
            errorCount++;
            continue;
          }

          console.log('Successfully applied payment to unit');
          successCount++;
        } else {
          console.log('Attempting to insert entry:', {
            site_id: currentSite.id,
            fiscal_period_id: selectedPeriod,
            entry_date: entry.entry_date,
            entry_type: entry.entry_type,
            category: entry.category,
            description: entry.description,
            amount: entry.amount,
            account_id: accountId,
            created_by: user?.id
          });

          const { data, error } = await supabase
            .from('ledger_entries')
            .insert({
              site_id: currentSite.id,
              fiscal_period_id: selectedPeriod,
              entry_date: entry.entry_date,
              entry_type: entry.entry_type,
              category: entry.category,
              description: entry.description,
              amount: entry.amount,
              currency_code: 'TRY',
              exchange_rate: 1.0,
              amount_reporting_try: entry.amount,
              account_id: accountId,
              created_by: user?.id
            })
            .select();

          if (error) {
            console.error('Insert error for entry:', entry, error);
            errorDetails.push(`${entry.description}: ${error.message}`);
            throw error;
          }
          console.log('Successfully inserted:', data);
          successCount++;
        }
      } catch (error: any) {
        console.error('Import error:', error);
        errorCount++;
      }
    }

    console.log('Import complete. Success:', successCount, 'Errors:', errorCount);
    setImportResults({ success: successCount, errors: errorCount, errorDetails });
    setStep('complete');
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Date': '15.01.2024',
        'Account': 'Cash Account',
        'Category': 'Utilities',
        'Description': 'Electric bill payment',
        'Debit': 150.00,
        'Credit': '',
        'Unit Number': ''
      },
      {
        'Date': '16.01.2024',
        'Account': 'Garanti TL Account',
        'Category': 'Maintenance Fee',
        'Description': 'January maintenance payment',
        'Debit': '',
        'Credit': 200.00,
        'Unit Number': '101'
      },
      {
        'Date': '17.01.2024',
        'Account': 'Cash Account',
        'Category': 'Extra Fees',
        'Description': 'Additional fee payment',
        'Debit': '',
        'Credit': 50.00,
        'Unit Number': '102'
      },
      {
        'Date': '20.01.2024',
        'Account': 'Cash Account',
        'Category': 'Water',
        'Description': 'Water bill',
        'Debit': 75.50,
        'Credit': '',
        'Unit Number': ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger Template');
    XLSX.writeFile(wb, 'ledger_import_template.xlsx');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Import Ledger Entries</h1>
        <p className="text-gray-600">Import income and expense transactions from Excel</p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['upload', 'mapping', 'preview', 'complete'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center ${step === s ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === s ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}>
                  {i + 1}
                </div>
                <span className="ml-2 font-medium capitalize">{s}</span>
              </div>
              {i < 3 && <ArrowRight className="text-gray-300" size={20} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 'upload' && (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center mb-6">
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
            >
              <Download size={20} className="mr-2" />
              Download Template
            </button>
            <p className="text-sm text-gray-600 mt-2">
              Download the template to see the expected format
            </p>
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left">
              <p className="text-sm font-medium text-blue-900 mb-2">Important Notes:</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Date format: DD.MM.YYYY (e.g., 15.01.2024)</li>
                <li>Use Debit column for expenses, Credit column for income</li>
                <li>Unit Number is REQUIRED for Maintenance Fee and Extra Fees categories</li>
                <li>Unit Number should be left empty for other categories</li>
              </ul>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Click to upload Excel file
              </p>
              <p className="text-sm text-gray-500">
                Supports .xlsx and .xls files
              </p>
            </label>
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-xl font-semibold mb-4">Map Excel Columns</h2>
          <p className="text-gray-600 mb-6">
            Match your Excel columns to the ledger fields
          </p>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">Detected Columns ({headers.length}):</p>
            <div className="flex flex-wrap gap-2">
              {headers.map(h => (
                <span key={h} className="px-3 py-1 bg-white border border-blue-300 rounded text-sm text-blue-700">
                  {h}
                </span>
              ))}
            </div>
            {headers.length === 0 && (
              <p className="text-sm text-red-600">No columns detected. Please check your Excel file format.</p>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Column (DD.MM.YYYY format) <span className="text-red-500">*</span>
              </label>
              <select
                value={columnMapping.entry_date}
                onChange={(e) => setColumnMapping({ ...columnMapping, entry_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Column <span className="text-red-500">*</span>
              </label>
              <select
                value={columnMapping.account}
                onChange={(e) => setColumnMapping({ ...columnMapping, account: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category Column <span className="text-red-500">*</span>
              </label>
              <select
                value={columnMapping.category}
                onChange={(e) => setColumnMapping({ ...columnMapping, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description Column <span className="text-red-500">*</span>
              </label>
              <select
                value={columnMapping.description}
                onChange={(e) => setColumnMapping({ ...columnMapping, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Debit Column <span className="text-red-500">*</span>
              </label>
              <select
                value={columnMapping.debit}
                onChange={(e) => setColumnMapping({ ...columnMapping, debit: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Credit Column <span className="text-red-500">*</span>
              </label>
              <select
                value={columnMapping.credit}
                onChange={(e) => setColumnMapping({ ...columnMapping, credit: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Number Column (optional)
              </label>
              <select
                value={columnMapping.unit_number}
                onChange={(e) => setColumnMapping({ ...columnMapping, unit_number: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep('upload')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleMapping}
              disabled={!columnMapping.entry_date || !columnMapping.account || !columnMapping.category || !columnMapping.description || !columnMapping.debit || !columnMapping.credit}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Next: Preview Data
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-xl font-semibold mb-4">Preview Import</h2>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Fiscal Period <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select period...</option>
              {fiscalPeriods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.period_name} ({new Date(p.start_date).toLocaleDateString()} - {new Date(p.end_date).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-600">
                  Total rows: {mappedData.length}
                </p>
                <p className="text-sm text-green-600">
                  Valid: {mappedData.filter(e => !e.errors || e.errors.length === 0).length}
                </p>
                <p className="text-sm text-red-600">
                  Errors: {mappedData.filter(e => e.errors && e.errors.length > 0).length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Payment Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Unit Number</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mappedData.map((entry, index) => (
                    <tr key={index} className={entry.errors && entry.errors.length > 0 ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {entry.errors && entry.errors.length > 0 ? (
                          <div className="flex items-center text-red-600">
                            <AlertCircle size={16} className="mr-1" />
                            <span className="text-xs">{entry.errors.join(', ')}</span>
                          </div>
                        ) : (
                          <CheckCircle size={16} className="text-green-600" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{entry.entry_date}</td>
                      <td className="px-4 py-3 text-sm capitalize whitespace-nowrap">{entry.entry_type}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{entry.category}</td>
                      <td className="px-4 py-3 text-sm max-w-xs truncate" title={entry.description}>{entry.description}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">${entry.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{entry.payment_method || '-'}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{entry.unit_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep('mapping')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={!selectedPeriod || mappedData.filter(e => !e.errors || e.errors.length === 0).length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Import Valid Entries
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-900">Importing entries...</p>
          <p className="text-sm text-gray-600 mt-2">Please wait while we process your data</p>
        </div>
      )}

      {step === 'complete' && (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center mb-8">
            <CheckCircle size={64} className={`${importResults.success > 0 ? "text-green-600" : "text-red-600"} mx-auto mb-4`} />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete</h2>
            <p className="text-gray-600">
              Successfully imported {importResults.success} entries
              {importResults.errors > 0 && ` (${importResults.errors} errors)`}
            </p>
          </div>

          {importResults.errorDetails.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-red-900 mb-3">Error Details:</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {importResults.errorDetails.map((error, idx) => (
                  <div key={idx} className="text-sm text-red-800">
                    {idx + 1}. {error}
                  </div>
                ))}
              </div>
              <div className="mt-4 text-sm text-red-900">
                <p className="font-medium">Please check the browser console for more details (press F12)</p>
              </div>
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                setStep('upload');
                setFile(null);
                setExcelData([]);
                setMappedData([]);
                setColumnMapping({
                  entry_date: '',
                  account: '',
                  category: '',
                  description: '',
                  debit: '',
                  credit: '',
                  unit_number: ''
                });
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Import Another File
            </button>
            <button
              onClick={() => navigate('/ledger')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              View Ledger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
