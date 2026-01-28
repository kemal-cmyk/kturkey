import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, AlertCircle, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
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
  currency_code: string;
  exchange_rate: number;
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
  
  // Updated Mapping State
  const [columnMapping, setColumnMapping] = useState({
    entry_date: '',
    account: '',
    category: '',
    description: '',
    debit: '',
    credit: '',
    unit_number: '',
    currency: '',
    exchange_rate: ''
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
      .select('id, unit_number, block')
      .eq('site_id', currentSite.id);
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
      .select('id, account_name, account_type, currency_code')
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
        // Use cellDates: true to let SheetJS try to identify dates automatically
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
          raw: false, // Attempt to format data as strings to preserve user input look
          defval: '',
          blankrows: false
        });

        if (jsonData.length > 0) {
          const detectedHeaders = Object.keys(jsonData[0]);
          setExcelData(jsonData as ExcelRow[]);
          setHeaders(detectedHeaders);
          setStep('mapping');
          
          // Auto-map common headers
          const newMapping = { ...columnMapping };
          detectedHeaders.forEach(header => {
            const h = header.toLowerCase();
            if (h.includes('date')) newMapping.entry_date = header;
            else if (h.includes('account')) newMapping.account = header;
            else if (h.includes('category')) newMapping.category = header;
            else if (h.includes('desc')) newMapping.description = header;
            else if (h.includes('debit') || h.includes('expense') || h.includes('out')) newMapping.debit = header;
            else if (h.includes('credit') || h.includes('income') || h.includes('in')) newMapping.credit = header;
            else if (h.includes('unit')) newMapping.unit_number = header;
            else if (h.includes('curr')) newMapping.currency = header;
            else if (h.includes('rate')) newMapping.exchange_rate = header;
          });
          setColumnMapping(newMapping);
        } else {
          alert('No data found in the Excel file.');
        }
      } catch (error) {
        console.error('Error reading Excel file:', error);
        alert('Error reading Excel file.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // ✅ NEW: Robust Date Parser that handles Serial, MM/DD/YYYY, and DD.MM.YYYY
  const parseFlexibleDate = (dateVal: any): string => {
    if (!dateVal) return '';

    // 1. Handle JS Date Objects (from XLSX cellDates: true)
    if (dateVal instanceof Date) {
        return dateVal.toISOString().split('T')[0];
    }

    // 2. Handle Excel Serial Numbers (e.g., 45306)
    // Check if it's a number, or a string that is purely numeric
    if (typeof dateVal === 'number' || (!isNaN(Number(dateVal)) && !String(dateVal).includes('.') && !String(dateVal).includes('/') && !String(dateVal).includes('-'))) {
      const serial = Number(dateVal);
      // Excel base date is Dec 30, 1899. This formula converts it to JS Date.
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      // Fix for timezone offset issues causing "one day off" errors
      const offset = date.getTimezoneOffset() * 60 * 1000;
      const adjustedDate = new Date(date.getTime() + offset); 
      return adjustedDate.toISOString().split('T')[0];
    }

    const dateStr = String(dateVal).trim();

    // 3. Handle "DD.MM.YYYY" (Turkish/European standard)
    if (dateStr.includes('.')) {
      const parts = dateStr.split('.');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    // 4. Handle "MM/DD/YYYY" (US/Excel Default standard - as requested)
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        // Assume MM/DD/YYYY
        const [month, day, year] = parts;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    // 5. Handle ISO "YYYY-MM-DD"
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    
    return ''; // Invalid
  };

  const handleMapping = () => {
    const mapped = excelData.map((row) => {
      // Logic to determine Income/Expense and Amount
      const debitVal = parseFloat(String(row[columnMapping.debit]).replace(/[^0-9.-]+/g,"")) || 0;
      const creditVal = parseFloat(String(row[columnMapping.credit]).replace(/[^0-9.-]+/g,"")) || 0;

      let entryType: 'income' | 'expense' = 'expense';
      let amount = 0;

      if (debitVal > 0) {
        entryType = 'expense';
        amount = debitVal;
      } else if (creditVal > 0) {
        entryType = 'income';
        amount = creditVal;
      }

      // Currency Logic
      const currency = columnMapping.currency ? (row[columnMapping.currency] || 'TRY') : 'TRY';
      const rate = columnMapping.exchange_rate ? (parseFloat(row[columnMapping.exchange_rate]) || 1.0) : 1.0;

      const rawDate = row[columnMapping.entry_date]; // Don't stringify yet, preserve types
      
      // ✅ USE NEW PARSER
      const parsedDate = parseFlexibleDate(rawDate);

      const entry: MappedEntry = {
        entry_date: parsedDate,
        entry_type: entryType,
        category: row[columnMapping.category] || '',
        description: row[columnMapping.description] || '',
        amount: amount,
        currency_code: currency,
        exchange_rate: rate,
        account_name: row[columnMapping.account] || '',
        unit_number: row[columnMapping.unit_number] ? String(row[columnMapping.unit_number]) : '',
        errors: []
      };

      // Validation
      if (!entry.entry_date) entry.errors?.push('Missing/Invalid date');
      if (!entry.category) entry.errors?.push('Missing category');
      if (!entry.description) entry.errors?.push('Missing description');
      if (!entry.amount || entry.amount <= 0) entry.errors?.push('Amount is 0');
      if (!entry.account_name) entry.errors?.push('Missing account name');

      // Account Matching Check
      const matchedAccount = accounts.find(a => 
        a.account_name.toLowerCase().trim() === entry.account_name?.toLowerCase().trim()
      );
      if (!matchedAccount) {
          entry.errors?.push(`Account '${entry.account_name}' not found in system`);
      }

      // Unit Matching Check (Only if Unit Number is provided)
      if (entry.unit_number) {
          // Smart Match: Try exact, then try combining block+number
          const matchedUnit = units.find(u => 
              String(u.unit_number) === entry.unit_number ||
              `${u.block}-${u.unit_number}` === entry.unit_number ||
              `Unit ${u.unit_number}` === entry.unit_number
          );
          if (!matchedUnit) {
              entry.errors?.push(`Unit '${entry.unit_number}' not found`);
          }
      }

      // Maintenance Fee Requirement
      const isMaintenance = entryType === 'income' && 
        ['Maintenance Fee', 'Maintenance Fees', 'Extra Fees'].includes(entry.category);
      
      if (isMaintenance && !entry.unit_number) {
        entry.errors?.push('Maintenance Fees require a Unit Number');
      }

      return entry;
    });

    setMappedData(mapped);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!selectedPeriod || !currentSite) return;

    setStep('importing');
    let successCount = 0;
    let errorCount = 0;
    const errorDetails: string[] = [];

    const validEntries = mappedData.filter(entry => !entry.errors || entry.errors.length === 0);

    for (const entry of validEntries) {
      try {
        // Resolve IDs again safely
        let unitId = null;
        if (entry.unit_number) {
             const matchedUnit = units.find(u => 
                String(u.unit_number) === entry.unit_number ||
                `${u.block}-${u.unit_number}` === entry.unit_number ||
                `Unit ${u.unit_number}` === entry.unit_number
            );
            if (matchedUnit) unitId = matchedUnit.id;
        }

        const account = accounts.find(a => a.account_name.toLowerCase().trim() === entry.account_name?.toLowerCase().trim());
        if (!account) throw new Error(`Account ${entry.account_name} not found`);

        const isMaintenance = entry.entry_type === 'income' && 
            ['Maintenance Fee', 'Maintenance Fees', 'Extra Fees'].includes(entry.category);

        if (isMaintenance && unitId) {
          // Use Payment RPC for logic
          const { error } = await supabase.rpc('apply_unit_payment', {
            p_unit_id: unitId,
            p_payment_amount: entry.amount,
            p_payment_date: entry.entry_date,
            p_payment_method: 'bank_transfer', // Default for imports
            p_reference_no: `Import: ${entry.description.substring(0, 20)}`,
            p_account_id: account.id,
            p_category: entry.category,
            p_currency_code: entry.currency_code,
            p_exchange_rate: entry.exchange_rate
          });
          if (error) throw error;
        } else {
          // Standard Ledger Insert
          const amountReportingTry = entry.currency_code === 'TRY' 
            ? entry.amount 
            : entry.amount * entry.exchange_rate;

          const { error } = await supabase
            .from('ledger_entries')
            .insert({
              site_id: currentSite.id,
              fiscal_period_id: selectedPeriod,
              entry_date: entry.entry_date,
              entry_type: entry.entry_type,
              category: entry.category,
              description: entry.description,
              amount: entry.amount,
              currency_code: entry.currency_code,
              exchange_rate: entry.exchange_rate,
              amount_reporting_try: amountReportingTry,
              account_id: account.id,
              created_by: user?.id
            });
          if (error) throw error;
        }
        successCount++;
      } catch (error: any) {
        console.error('Import error:', error);
        errorDetails.push(`${entry.description}: ${error.message}`);
        errorCount++;
      }
    }

    setImportResults({ success: successCount, errors: errorCount, errorDetails });
    setStep('complete');
  };

  const downloadTemplate = () => {
    // ✅ Updated Template to use MM/DD/YYYY format clearly
    const template = [
      {
        'Date': '01/15/2024',
        'Account': 'Cash Account',
        'Category': 'Utilities',
        'Description': 'Electric bill',
        'Debit (Out)': 150.00,
        'Credit (In)': 0,
        'Unit Number': '',
        'Currency': 'TRY',
        'Rate': 1
      },
      {
        'Date': '01/16/2024',
        'Account': 'Garanti EUR',
        'Category': 'Maintenance Fees',
        'Description': 'Jan Fee',
        'Debit (Out)': 0,
        'Credit (In)': 100.00,
        'Unit Number': '101',
        'Currency': 'EUR',
        'Rate': 35.5
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template');
    XLSX.writeFile(wb, 'ledger_import_template.xlsx');
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Import Ledger Entries</h1>
        <p className="text-gray-600">Bulk upload income and expenses from Excel</p>
      </div>

      {/* Progress Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['upload', 'mapping', 'preview', 'complete'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center ${step === s ? 'text-[#002561] font-bold' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === s ? 'bg-[#002561] text-white' : 'bg-gray-200'
                }`}>
                  {i + 1}
                </div>
                <span className="ml-2 capitalize">{s}</span>
              </div>
              {i < 3 && <ArrowRight className="text-gray-300" size={20} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 'upload' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-8">
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
            >
              <Download size={20} className="mr-2" />
              Download Template
            </button>
            
            <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg text-left max-w-2xl mx-auto">
              <p className="text-sm font-semibold text-blue-900 mb-2">Instructions:</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Date format: <strong>MM/DD/YYYY</strong> (e.g. 01/25/2024)</li>
                <li><strong>Account Name</strong> must match exactly what is in your System.</li>
                <li><strong>Currency</strong>: TRY, USD, EUR, GBP (Default: TRY).</li>
                <li><strong>Rate</strong>: Exchange rate to TRY (Required for non-TRY).</li>
                <li><strong>Maintenance Fees</strong>: You MUST provide a <strong>Unit Number</strong>.</li>
              </ul>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-[#002561] hover:bg-blue-50/30 transition-all cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700">Drop your Excel file here</p>
            <p className="text-sm text-gray-500 mt-1">or click to browse</p>
          </div>
        </div>
      )}

      {step === 'mapping' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Map Excel Columns</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
              <select 
                value={columnMapping.entry_date} 
                onChange={e => setColumnMapping({...columnMapping, entry_date: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">Select...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Name *</label>
              <select 
                value={columnMapping.account} 
                onChange={e => setColumnMapping({...columnMapping, account: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">Select...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
              <select 
                value={columnMapping.category} 
                onChange={e => setColumnMapping({...columnMapping, category: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">Select...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
              <select 
                value={columnMapping.description} 
                onChange={e => setColumnMapping({...columnMapping, description: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">Select...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Debit (Expense) *</label>
              <select 
                value={columnMapping.debit} 
                onChange={e => setColumnMapping({...columnMapping, debit: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">Select...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Credit (Income) *</label>
              <select 
                value={columnMapping.credit} 
                onChange={e => setColumnMapping({...columnMapping, credit: e.target.value})}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">Select...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency (Optional)</label>
              <select 
                value={columnMapping.currency} 
                onChange={e => setColumnMapping({...columnMapping, currency: e.target.value})}
                className="w-full p-2 border rounded-lg bg-gray-50"
              >
                <option value="">(Default: TRY)</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Exchange Rate (Optional)</label>
              <select 
                value={columnMapping.exchange_rate} 
                onChange={e => setColumnMapping({...columnMapping, exchange_rate: e.target.value})}
                className="w-full p-2 border rounded-lg bg-gray-50"
              >
                <option value="">(Default: 1.0)</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unit Number (For Dues)</label>
              <select 
                value={columnMapping.unit_number} 
                onChange={e => setColumnMapping({...columnMapping, unit_number: e.target.value})}
                className="w-full p-2 border rounded-lg bg-gray-50"
              >
                <option value="">(Optional)</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setStep('upload')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
            <button 
              onClick={handleMapping}
              disabled={!columnMapping.entry_date || !columnMapping.account || !columnMapping.category}
              className="px-6 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50"
            >
              Preview Data
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Preview Data</h2>
            <div className="flex gap-4 text-sm">
               <span className="text-green-600 font-medium">{mappedData.filter(e => !e.errors?.length).length} Valid</span>
               <span className="text-red-600 font-medium">{mappedData.filter(e => e.errors?.length).length} Errors</span>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Fiscal Period *</label>
            <select 
              value={selectedPeriod} 
              onChange={e => setSelectedPeriod(e.target.value)}
              className="w-full max-w-md p-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select Fiscal Period...</option>
              {fiscalPeriods.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({new Date(p.start_date).toLocaleDateString()} - {new Date(p.end_date).toLocaleDateString()})</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[500px] mb-6">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Account</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Cat / Desc</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Curr / Rate</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mappedData.map((row, i) => (
                  <tr key={i} className={row.errors?.length ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2">
                      {row.errors?.length ? (
                        <div className="group relative">
                          <AlertCircle className="w-5 h-5 text-red-500 cursor-help" />
                          <div className="absolute left-6 top-0 w-64 p-2 bg-black text-white text-xs rounded hidden group-hover:block z-50">
                            {row.errors.join(', ')}
                          </div>
                        </div>
                      ) : <CheckCircle className="w-5 h-5 text-green-500" />}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{row.entry_date}</td>
                    <td className="px-4 py-2">{row.account_name}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{row.category}</div>
                      <div className="text-gray-500 text-xs truncate max-w-[200px]">{row.description}</div>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${row.entry_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {row.entry_type === 'income' ? '+' : '-'}{row.amount}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      {row.currency_code}<br/>
                      <span className="text-gray-400">@ {row.exchange_rate}</span>
                    </td>
                    <td className="px-4 py-2">{row.unit_number || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setStep('mapping')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
            <button 
              onClick={handleImport}
              disabled={!selectedPeriod || mappedData.filter(e => !e.errors?.length).length === 0}
              className="px-6 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] disabled:opacity-50"
            >
              Import Valid Rows
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Loader2 className="w-12 h-12 text-[#002561] animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Importing Data...</h2>
          <p className="text-gray-500">Please wait while we process your entries.</p>
        </div>
      )}

      {step === 'complete' && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Finished</h2>
          <p className="text-gray-600 mb-6">
            Successfully imported <strong>{importResults.success}</strong> entries.
            {importResults.errors > 0 && <span className="text-red-600 ml-2">({importResults.errors} failed)</span>}
          </p>
          
          {importResults.errorDetails.length > 0 && (
            <div className="bg-red-50 p-4 rounded-lg text-left max-w-xl mx-auto mb-6 max-h-40 overflow-y-auto">
              <p className="font-bold text-red-800 text-sm mb-2">Errors:</p>
              <ul className="list-disc list-inside text-xs text-red-700">
                {importResults.errorDetails.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <button onClick={() => window.location.reload()} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Import More</button>
            <button onClick={() => navigate('/ledger')} className="px-6 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380]">Go to Ledger</button>
          </div>
        </div>
      )}
    </div>
  );
}