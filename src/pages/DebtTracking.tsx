import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  AlertTriangle, Scale, FileText, Send, Search, Filter,
  ChevronDown, Loader2, Download, Clock, Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import type { DebtAlert } from '../types/database';
import { DEBT_STAGES } from '../lib/constants';

export default function DebtTracking() {
  const { currentSite, currentRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [debts, setDebts] = useState<DebtAlert[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<DebtAlert | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = currentRole?.role === 'admin';

  useEffect(() => {
    if (currentSite) {
      fetchDebts();
    }
  }, [currentSite]);

  const fetchDebts = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('debt_alerts')
      .select('*')
      .eq('site_id', currentSite.id)
      .order('stage', { ascending: false })
      .order('total_debt_amount', { ascending: false });

    if (!error && data) {
      setDebts(data);
    }
    setLoading(false);
  };

  const updateDebtStages = async () => {
    if (!currentSite) return;
    setActionLoading(true);

    await supabase.rpc('update_debt_workflow_stages', {
      p_site_id: currentSite.id,
    });

    await fetchDebts();
    setActionLoading(false);
  };

  const markWarningSent = async (workflowId: string) => {
    setActionLoading(true);
    await supabase
      .from('debt_workflows')
      .update({ warning_sent_at: new Date().toISOString() })
      .eq('id', workflowId);
    await fetchDebts();
    setActionLoading(false);
    setSelectedDebt(null);
  };

  const markLetterGenerated = async (workflowId: string) => {
    setActionLoading(true);
    await supabase
      .from('debt_workflows')
      .update({
        letter_generated_at: new Date().toISOString(),
        stage: 3,
        stage_changed_at: new Date().toISOString(),
      })
      .eq('id', workflowId);
    await fetchDebts();
    setActionLoading(false);
    setSelectedDebt(null);
  };

  const initiateLegalAction = async (workflowId: string, caseNumber: string) => {
    setActionLoading(true);
    await supabase
      .from('debt_workflows')
      .update({
        legal_action_at: new Date().toISOString(),
        legal_case_number: caseNumber,
        stage: 4,
        stage_changed_at: new Date().toISOString(),
      })
      .eq('id', workflowId);
    await fetchDebts();
    setActionLoading(false);
    setSelectedDebt(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const filteredDebts = debts.filter(debt => {
    const matchesSearch =
      debt.unit_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      debt.owner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      debt.block?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStage = stageFilter === null || debt.stage === stageFilter;

    return matchesSearch && matchesStage;
  });

  const stageStats = {
    total: debts.length,
    stage2: debts.filter(d => d.stage === 2).length,
    stage3: debts.filter(d => d.stage === 3).length,
    stage4: debts.filter(d => d.stage === 4).length,
    totalDebt: debts.reduce((sum, d) => sum + d.total_debt_amount, 0),
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debt Tracking</h1>
          <p className="text-gray-600">Monitor and manage overdue accounts</p>
        </div>
        {isAdmin && (
          <button
            onClick={updateDebtStages}
            disabled={actionLoading}
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380] transition-colors disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Clock className="w-4 h-4 mr-2" />
            )}
            Update Stages
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Total Alerts</p>
          <p className="text-2xl font-bold text-gray-900">{stageStats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <p className="text-sm text-yellow-700">Warning (Stage 2)</p>
          <p className="text-2xl font-bold text-yellow-800">{stageStats.stage2}</p>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
          <p className="text-sm text-orange-700">Letter Sent (Stage 3)</p>
          <p className="text-2xl font-bold text-orange-800">{stageStats.stage3}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <p className="text-sm text-red-700">Legal Action (Stage 4)</p>
          <p className="text-2xl font-bold text-red-800">{stageStats.stage4}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Total Outstanding</p>
          <p className="text-2xl font-bold text-[#002561]">{formatCurrency(stageStats.totalDebt)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by unit, owner, or block..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561]"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={stageFilter ?? ''}
              onChange={(e) => setStageFilter(e.target.value ? Number(e.target.value) : null)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#002561] focus:border-[#002561] appearance-none bg-white"
            >
              <option value="">All Stages</option>
              <option value="2">Stage 2 - Warning</option>
              <option value="3">Stage 3 - Letter Sent</option>
              <option value="4">Stage 4 - Legal Action</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {filteredDebts.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No debt alerts found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredDebts.map((debt) => (
              <div
                key={debt.workflow_id}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedDebt(debt)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        debt.stage === 4
                          ? 'bg-red-100'
                          : debt.stage === 3
                          ? 'bg-orange-100'
                          : 'bg-yellow-100'
                      }`}
                    >
                      {debt.stage === 4 ? (
                        <Scale className="w-6 h-6 text-red-600" />
                      ) : debt.stage === 3 ? (
                        <FileText className="w-6 h-6 text-orange-600" />
                      ) : (
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {debt.block ? `${debt.block}-` : ''}
                        {debt.unit_number}
                      </p>
                      <p className="text-sm text-gray-500">{debt.owner_name || 'Unknown Owner'}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm text-gray-500">{debt.months_overdue} months overdue</p>
                      <p className="text-xs text-gray-400">
                        Since {debt.oldest_unpaid_date ? format(new Date(debt.oldest_unpaid_date), 'MMM d, yyyy') : 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900">
                        {formatCurrency(debt.total_debt_amount)}
                      </p>
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          DEBT_STAGES[debt.stage as keyof typeof DEBT_STAGES].color
                        }`}
                      >
                        {DEBT_STAGES[debt.stage as keyof typeof DEBT_STAGES].name}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                  {debt.warning_sent_at && (
                    <span className="flex items-center">
                      <Send className="w-3 h-3 mr-1" />
                      Warning: {format(new Date(debt.warning_sent_at), 'MMM d')}
                    </span>
                  )}
                  {debt.letter_generated_at && (
                    <span className="flex items-center">
                      <FileText className="w-3 h-3 mr-1" />
                      Letter: {format(new Date(debt.letter_generated_at), 'MMM d')}
                    </span>
                  )}
                  {debt.legal_action_at && (
                    <span className="flex items-center">
                      <Scale className="w-3 h-3 mr-1" />
                      Legal: {format(new Date(debt.legal_action_at), 'MMM d')}
                    </span>
                  )}
                  {debt.legal_case_number && (
                    <span className="flex items-center font-mono">
                      Case: {debt.legal_case_number}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedDebt && isAdmin && (
        <DebtActionModal
          debt={selectedDebt}
          onClose={() => setSelectedDebt(null)}
          onWarningSent={() => markWarningSent(selectedDebt.workflow_id)}
          onLetterGenerated={() => markLetterGenerated(selectedDebt.workflow_id)}
          onLegalAction={(caseNumber) => initiateLegalAction(selectedDebt.workflow_id, caseNumber)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

interface DebtActionModalProps {
  debt: DebtAlert;
  onClose: () => void;
  onWarningSent: () => void;
  onLetterGenerated: () => void;
  onLegalAction: (caseNumber: string) => void;
  loading: boolean;
}

function DebtActionModal({
  debt,
  onClose,
  onWarningSent,
  onLetterGenerated,
  onLegalAction,
  loading,
}: DebtActionModalProps) {
  const [caseNumber, setCaseNumber] = useState('');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900">Debt Actions</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-900">
                {debt.block ? `${debt.block}-` : ''}{debt.unit_number}
              </span>
              <span className={`px-2 py-1 text-xs rounded-full ${DEBT_STAGES[debt.stage as keyof typeof DEBT_STAGES].color}`}>
                {DEBT_STAGES[debt.stage as keyof typeof DEBT_STAGES].name}
              </span>
            </div>
            <p className="text-sm text-gray-600">{debt.owner_name}</p>
            <p className="text-2xl font-bold text-[#002561] mt-2">
              {formatCurrency(debt.total_debt_amount)}
            </p>
            <p className="text-sm text-gray-500">{debt.months_overdue} months overdue</p>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Workflow Timeline</h4>

            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200" />

              <TimelineItem
                title="Stage 1: Standard Notification"
                date={debt.stage_changed_at}
                completed={debt.stage >= 1}
                current={debt.stage === 1}
              />

              <TimelineItem
                title="Stage 2: Warning Sent"
                date={debt.warning_sent_at}
                completed={!!debt.warning_sent_at}
                current={debt.stage === 2 && !debt.warning_sent_at}
                action={
                  debt.stage >= 2 && !debt.warning_sent_at ? (
                    <button
                      onClick={onWarningSent}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 disabled:opacity-50"
                    >
                      Mark Sent
                    </button>
                  ) : null
                }
              />

              <TimelineItem
                title="Stage 3: Warning Letter Generated"
                date={debt.letter_generated_at}
                completed={!!debt.letter_generated_at}
                current={debt.stage === 2 && !!debt.warning_sent_at}
                action={
                  debt.stage >= 2 && debt.warning_sent_at && !debt.letter_generated_at ? (
                    <button
                      onClick={onLetterGenerated}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50"
                    >
                      Generate Letter
                    </button>
                  ) : null
                }
              />

              <TimelineItem
                title="Stage 4: Legal Action (Icra)"
                date={debt.legal_action_at}
                completed={!!debt.legal_action_at}
                current={debt.stage === 3}
                action={
                  debt.stage >= 3 && !debt.legal_action_at ? (
                    <div className="flex items-center space-x-2 mt-2">
                      <input
                        type="text"
                        value={caseNumber}
                        onChange={(e) => setCaseNumber(e.target.value)}
                        placeholder="Case number"
                        className="text-xs px-2 py-1 border border-gray-300 rounded"
                      />
                      <button
                        onClick={() => onLegalAction(caseNumber)}
                        disabled={loading || !caseNumber}
                        className="text-xs px-3 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50"
                      >
                        Initiate
                      </button>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>

          {debt.legal_case_number && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-medium text-red-800">Legal Case Number</p>
              <p className="font-mono text-lg text-red-900">{debt.legal_case_number}</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Close
          </button>
          <button
            className="flex items-center px-4 py-2 bg-[#002561] text-white rounded-lg hover:bg-[#003380]"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}

interface TimelineItemProps {
  title: string;
  date: string | null;
  completed: boolean;
  current: boolean;
  action?: React.ReactNode;
}

function TimelineItem({ title, date, completed, current, action }: TimelineItemProps) {
  return (
    <div className="relative">
      <div
        className={`absolute -left-4 w-4 h-4 rounded-full border-2 ${
          completed
            ? 'bg-green-500 border-green-500'
            : current
            ? 'bg-white border-[#002561]'
            : 'bg-white border-gray-300'
        }`}
      />
      <div className="ml-4">
        <p className={`font-medium ${completed ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </p>
        {date && (
          <p className="text-xs text-gray-500">
            {format(new Date(date), 'MMM d, yyyy h:mm a')}
          </p>
        )}
        {action}
      </div>
    </div>
  );
}
