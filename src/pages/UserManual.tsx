import { 
  BookOpen, AlertTriangle, Building2, 
  Wallet, FileText, CheckCircle2, HelpCircle 
} from 'lucide-react';

export default function UserManual() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-[#002561]" />
          Admin User Manual
        </h1>
        <p className="text-gray-600 mt-2 text-lg">
          Guide to managing units, debts, payments, and currency conversions in the KTurkey System.
        </p>
      </div>

      {/* --- SECTION 1: THE GOLDEN RULE (CURRENCY) --- */}
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-amber-900 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          Critical: Cross-Currency Payments
        </h2>
        
        <p className="text-amber-800 mb-6 leading-relaxed">
          The system calculates balances mathematically. When a resident pays in a currency different from the Maintenance Fee currency, you <strong>must</strong> enter the correct Exchange Rate for the math to work.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Scenario A */}
          <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">SCENARIO A</span>
              <h3 className="font-bold text-gray-900">Fee is Euro (€) / Payment is TL (₺)</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              If the debt is in Euro, but the resident pays in TL:
            </p>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm">
              <p className="font-semibold text-[#002561]">Enter the TL-to-Euro Rate</p>
              <p className="text-gray-500 mt-1">Use a decimal (e.g., <strong>0.027</strong>).</p>
              <p className="text-xs text-gray-400 mt-2 italic">Logic: You are converting weak TL into strong Euro.</p>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Example: 3,700 TL × 0.027 = <strong>100 €</strong> credited.
            </div>
          </div>

          {/* Scenario B */}
          <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">SCENARIO B</span>
              <h3 className="font-bold text-gray-900">Fee is TL (₺) / Payment is Euro (€)</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              If the debt is in TL, but the resident pays in Euro:
            </p>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm">
              <p className="font-semibold text-[#002561]">Enter the Euro-to-TL Rate</p>
              <p className="text-gray-500 mt-1">Use the full rate (e.g., <strong>37.50</strong>).</p>
              <p className="text-xs text-gray-400 mt-2 italic">Logic: You are converting strong Euro into many TL.</p>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Example: 100 € × 37.50 = <strong>3,750 TL</strong> credited.
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 2: MANAGING UNITS --- */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
          <Building2 className="w-6 h-6 text-[#002561]" />
          Managing Units
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Viewing Balances</h3>
            <p className="text-sm text-gray-600">
              {/* FIXED LINE BELOW: Changed > to &gt; */}
              Go to the <strong>Units</strong> page. Click the arrow (&gt;) next to any unit to expand details. You will see:
            </p>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li><strong>Opening Balance:</strong> Debt/Credit from previous year.</li>
              <li><strong>Accrued Dues:</strong> Total fees charged this period.</li>
              <li><strong>Total Paid:</strong> All payments (converted to debt currency).</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Editing Owner Info</h3>
            <p className="text-sm text-gray-600">
              Click the <strong>Pencil Icon</strong> on the Units page to update:
            </p>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li>Owner Name & Phone</li>
              <li>Tenant details (if rented)</li>
              <li>Share Ratio (Arsa Payı)</li>
              <li>Opening Balance adjustments</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Understanding Colors</h3>
            <div className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-gray-600"><strong>Red:</strong> Debt (Resident owes money)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-gray-600"><strong>Green:</strong> Credit (Resident overpaid)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 3: LEDGER & PAYMENTS --- */}
      <section className="space-y-4 pt-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
          <Wallet className="w-6 h-6 text-[#002561]" />
          Recording Payments (Ledger)
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-6 grid gap-6">
            <div>
              <h3 className="font-bold text-gray-900 mb-2">How to Record an Income</h3>
              <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-2">
                <li>Go to the <strong>Ledger</strong> page.</li>
                <li>Click the <span className="text-green-600 font-bold">Income</span> button.</li>
                <li>Select the <strong>Date</strong> the money arrived in the bank.</li>
                <li>Choose the <strong>Category</strong> (e.g., Maintenance Fees).</li>
                <li><strong>Select the Unit</strong> that made the payment.</li>
                <li>Enter the <strong>Amount</strong> exactly as shown on the receipt.</li>
                <li>Select the <strong>Currency</strong> of the payment.</li>
                <li>
                  <strong>Check the Rate:</strong> If payment currency ≠ debt currency, refer to the "Golden Rule" above.
                </li>
                <li>Click <strong>Save</strong>.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 4: STATEMENTS --- */}
      <section className="space-y-4 pt-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
          <FileText className="w-6 h-6 text-[#002561]" />
          Resident Statements
        </h2>
        <p className="text-gray-600">
          When a resident asks "How much do I owe?" or "Can I see my history?", use this page.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-2">Generating a Statement</h3>
            <p className="text-sm text-gray-600 mb-2">
              1. Go to <strong>Resident Statement</strong>.
            </p>
            <p className="text-sm text-gray-600 mb-2">
              2. Select the Unit from the dropdown.
            </p>
            <p className="text-sm text-gray-600">
              3. The system generates a formal table showing Accruals vs. Payments and the running balance.
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-2">Printing / PDF</h3>
            <p className="text-sm text-gray-600">
              Click the <strong>Print</strong> button at the top right. 
              This opens your browser's print dialog where you can save the document as a <strong>PDF</strong> to send via WhatsApp or Email.
            </p>
          </div>
        </div>
      </section>

      {/* --- SECTION 5: TROUBLESHOOTING --- */}
      <section className="bg-gray-100 rounded-2xl p-6 mt-8">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
          <HelpCircle className="w-6 h-6 text-gray-700" />
          Troubleshooting Common Issues
        </h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="mt-1"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">"Total Paid" looks huge on the Units page?</h4>
              <p className="text-sm text-gray-600 mt-1">
                You likely entered a TL payment for a Euro debt but left the Exchange Rate as <strong>1</strong>.
                <br />
                <strong>Fix:</strong> Go to the Ledger, find that payment entry, click Edit, and change the rate to the decimal format (e.g., 0.02).
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="mt-1"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">"Balance" is Negative?</h4>
              <p className="text-sm text-gray-600 mt-1">
                This is good! A negative balance (Green) means the resident has <strong>Credit</strong> (they paid in advance). 
                A positive balance (Red) means they <strong>Owe</strong> money.
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}