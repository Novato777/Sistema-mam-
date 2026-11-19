import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Landmark,
  BookOpen,
  Scale,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Unlock,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Ban,
  FileCode2,
  Settings2,
  Trash2,
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import { getTodayString } from '../utils/date';

async function apiRequest(method: string, path: string, body?: unknown) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Error HTTP ${res.status}`);
  }
  return data;
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

interface AccountingAccount {
  id: number;
  code: string;
  name: string;
  account_class: string;
  nature: string;
  level: number;
  parent_code: string;
  is_detail: number;
  active: number;
}

interface AccountingRule {
  id: number;
  event_code: string;
  event_name: string;
  description: string;
  debit_account_code: string;
  credit_account_code: string;
  active: number;
}

interface AccountingPeriod {
  id: number;
  period_code: string;
  year: number;
  month: number;
  status: string;
  closed_by_name: string | null;
  closed_at: string | null;
  closing_notes: string | null;
}

interface JournalLine {
  id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  third_party_name: string;
  description: string;
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: number;
  entry_number: string;
  entry_type: string;
  entry_date: string;
  period_code: string;
  description: string;
  reference: string;
  total_debit: number;
  total_credit: number;
  status: string;
  void_reason: string | null;
  created_by_name: string | null;
  lines: JournalLine[];
}

interface ArApRecord {
  id: number;
  doc_type: 'CXC' | 'CXP';
  doc_number: string;
  third_party_type: string;
  third_party_name: string;
  third_party_doc: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  notes: string;
}

interface ReconciliationRow {
  id: number;
  account_code: string;
  account_name: string;
  period_from: string;
  period_to: string;
  statement_balance: number;
  book_balance: number;
  difference: number;
  status: string;
  notes: string;
  reconciled_by_name: string | null;
}

interface FinancialStatementsData {
  period: { from_date: string; to_date: string };
  trial_balance: {
    rows: {
      code: string;
      name: string;
      opening_debit: number;
      opening_credit: number;
      period_debit: number;
      period_credit: number;
      closing_debit: number;
      closing_credit: number;
    }[];
    totals: {
      opening_debit: number;
      opening_credit: number;
      period_debit: number;
      period_credit: number;
      closing_debit: number;
      closing_credit: number;
      is_balanced: boolean;
    };
  };
  income_statement: {
    income: { code: string; name: string; amount: number }[];
    costs: { code: string; name: string; amount: number }[];
    expenses: { code: string; name: string; amount: number }[];
    total_income: number;
    total_costs: number;
    gross_profit: number;
    total_expenses: number;
    net_profit: number;
  };
  balance_sheet: {
    assets: { code: string; name: string; amount: number }[];
    liabilities: { code: string; name: string; amount: number }[];
    equity: { code: string; name: string; amount: number }[];
    cumulative_net_result: number;
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
    liabilities_plus_equity: number;
    is_balanced: boolean;
  };
}

interface LedgerAccountBlock {
  account: AccountingAccount;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  movements: {
    id: number;
    entry_number: string;
    entry_date: string;
    description: string;
    debit: number;
    credit: number;
    running_balance: number;
  }[];
}

interface ElectronicInvoice {
  id: number;
  invoice_number: string;
  doc_type: string;
  customer_name: string;
  customer_doc: string;
  issue_date: string;
  total_amount: number;
  cufe: string;
  provider_name: string;
  provider_status: string;
  xml_ubl_preview: string;
}

export default function Contabilidad() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const canManage = hasPermission('accounting.manage');

  const today = getTodayString();
  const monthStart = `${today.substring(0, 7)}-01`;

  const [activeTab, setActiveTab] = useState<
    'DIARIO' | 'ESTADOS' | 'CARTERA' | 'CONCILIACION' | 'PUC' | 'DIAN'
  >('DIARIO');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [rules, setRules] = useState<AccountingRule[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [arApList, setArApList] = useState<ArApRecord[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationRow[]>([]);
  const [kpis, setKpis] = useState({
    current_period: today.substring(0, 7),
    current_period_status: 'ABIERTO',
    total_assets: 0,
    total_liabilities: 0,
    total_equity: 0,
    month_income: 0,
    month_costs_expenses: 0,
    month_net_profit: 0,
    cxc_pending: 0,
    cxp_pending: 0,
    entries_count: 0
  });

  // Estados Financieros & Libro Mayor
  const [stmtDates, setStmtDates] = useState({ from_date: monthStart, to_date: today });
  const [statements, setStatements] = useState<FinancialStatementsData | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerAccountBlock[]>([]);
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState('ALL');
  const [stmtSubTab, setStmtSubTab] = useState<'PYG' | 'BALANCE' | 'COMPROBACION' | 'MAYOR'>('PYG');

  // Modales Comprobante Manual / Anulación
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({
    entry_date: today,
    entry_type: 'MANUAL',
    description: '',
    reference: ''
  });
  const [entryLines, setEntryLines] = useState<
    { account_code: string; description: string; third_party_name: string; debit: string; credit: string }[]
  >([]);
  const [voidTarget, setVoidTarget] = useState<JournalEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Modal PUC
  const [pucModalOpen, setPucModalOpen] = useState(false);
  const [pucForm, setPucForm] = useState({
    code: '',
    name: '',
    account_class: 'GASTOS',
    nature: 'DEBITO',
    level: '4',
    parent_code: '',
    is_detail: true
  });

  // Modal CXC / CXP y Pago
  const [arApModalOpen, setArApModalOpen] = useState(false);
  const [arApForm, setArApForm] = useState({
    doc_type: 'CXC',
    third_party_type: 'AGENCIA',
    third_party_name: '',
    third_party_doc: '',
    issue_date: today,
    due_date: today,
    total_amount: '',
    notes: ''
  });
  const [payTarget, setPayTarget] = useState<ArApRecord | null>(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_method: 'Efectivo',
    reference: '',
    register_in_cash: true
  });

  // Conciliación y Cierre de Periodo
  const [recForm, setRecForm] = useState({
    account_code: '110505',
    period_from: monthStart,
    period_to: today,
    statement_balance: '',
    notes: ''
  });
  const [closePeriodCode, setClosePeriodCode] = useState(today.substring(0, 7));
  const [closeNotes, setCloseNotes] = useState('');

  // Adaptador DIAN
  const [dianState, setDianState] = useState<{
    supported_providers: { code: string; name: string; supports_live_transmission: boolean }[];
    config_status: {
      ready_for_draft_ubl: boolean;
      ready_for_live_transmission: boolean;
      issues: string[];
    };
    dian_config: {
      dian_environment: string;
      dian_provider: string;
      dian_resolution: string;
      dian_prefix: string;
      dian_api_url: string;
    };
    invoices: ElectronicInvoice[];
  } | null>(null);
  const [dianInvForm, setDianInvForm] = useState({
    customer_name: '',
    customer_doc_type: 'CC',
    customer_doc: '',
    customer_email: '',
    subtotal: '',
    tax_amount: '0'
  });
  const [xmlPreviewTarget, setXmlPreviewTarget] = useState<ElectronicInvoice | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const detailAccounts = useMemo(
    () => accounts.filter((a) => Number(a.is_detail) === 1 && Number(a.active) === 1),
    [accounts]
  );

  const fetchOverview = useCallback(async () => {
    if (!activeHotelId) return;
    setLoading(true);
    try {
      const [ov, arAp, recs] = await Promise.all([
        apiRequest('GET', `/hotels/${activeHotelId}/accounting/overview`),
        apiRequest('GET', `/hotels/${activeHotelId}/accounting/ar-ap`),
        apiRequest('GET', `/hotels/${activeHotelId}/accounting/reconciliations`)
      ]);
      setAccounts(ov.accounts || []);
      setRules(ov.rules || []);
      setPeriods(ov.periods || []);
      setEntries(ov.recent_entries || []);
      if (ov.kpis) setKpis(ov.kpis);
      setArApList(arAp || []);
      setReconciliations(recs || []);
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al cargar contabilidad.');
    } finally {
      setLoading(false);
    }
  }, [activeHotelId]);

  const fetchStatementsAndLedger = useCallback(async () => {
    if (!activeHotelId) return;
    try {
      const [st, led] = await Promise.all([
        apiRequest(
          'GET',
          `/hotels/${activeHotelId}/accounting/statements?from_date=${stmtDates.from_date}&to_date=${stmtDates.to_date}`
        ),
        apiRequest(
          'GET',
          `/hotels/${activeHotelId}/accounting/ledger?from_date=${stmtDates.from_date}&to_date=${stmtDates.to_date}&account_code=${ledgerAccountFilter}`
        )
      ]);
      setStatements(st);
      setLedgerData(led.ledger || []);
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al cargar estados financieros.');
    }
  }, [activeHotelId, stmtDates, ledgerAccountFilter]);

  const fetchDian = useCallback(async () => {
    if (!activeHotelId) return;
    try {
      const d = await apiRequest('GET', `/hotels/${activeHotelId}/accounting/dian`);
      setDianState(d);
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al cargar adaptador DIAN.');
    }
  }, [activeHotelId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'ESTADOS') fetchStatementsAndLedger();
    if (activeTab === 'DIAN') fetchDian();
  }, [activeTab, fetchStatementsAndLedger, fetchDian]);

  // Totales en vivo del modal de asiento manual
  const draftDebitSum = useMemo(
    () => entryLines.reduce((acc, l) => acc + Number(l.debit || 0), 0),
    [entryLines]
  );
  const draftCreditSum = useMemo(
    () => entryLines.reduce((acc, l) => acc + Number(l.credit || 0), 0),
    [entryLines]
  );
  const draftBalanced = draftDebitSum > 0 && Math.abs(draftDebitSum - draftCreditSum) < 0.01;

  const openNewEntryModal = () => {
    const firstCode = detailAccounts[0]?.code || '110505';
    const secondCode = detailAccounts[1]?.code || '414005';
    setEntryForm({ entry_date: today, entry_type: 'MANUAL', description: '', reference: '' });
    setEntryLines([
      { account_code: firstCode, description: '', third_party_name: '', debit: '0', credit: '0' },
      { account_code: secondCode, description: '', third_party_name: '', debit: '0', credit: '0' }
    ]);
    setEntryModalOpen(true);
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftBalanced) {
      showMsg('error', 'La suma de Débitos debe ser exactamente igual a la de Créditos y mayor a 0.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/journal`, {
        ...entryForm,
        lines: entryLines.map((l) => ({
          account_code: l.account_code,
          description: l.description,
          third_party_name: l.third_party_name,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0)
        }))
      });
      showMsg('success', res.message || 'Comprobante contabilizado.');
      setEntryModalOpen(false);
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al contabilizar comprobante.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncOperations = async () => {
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/sync-operations`, {});
      showMsg('success', res.message);
      await fetchOverview();
      if (activeTab === 'ESTADOS') await fetchStatementsAndLedger();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al sincronizar operaciones.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget || !voidReason.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiRequest(
        'POST',
        `/hotels/${activeHotelId}/accounting/journal/${voidTarget.id}/void`,
        { void_reason: voidReason.trim() }
      );
      showMsg('success', res.message);
      setVoidTarget(null);
      setVoidReason('');
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al anular comprobante.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/accounts`, {
        ...pucForm,
        level: Number(pucForm.level || 4)
      });
      showMsg('success', res.message);
      setPucModalOpen(false);
      setPucForm({
        code: '',
        name: '',
        account_class: 'GASTOS',
        nature: 'DEBITO',
        level: '4',
        parent_code: '',
        is_detail: true
      });
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al crear cuenta PUC.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRule = async (rule: AccountingRule, debitCode: string, creditCode: string, active: number) => {
    try {
      await apiRequest('PUT', `/hotels/${activeHotelId}/accounting/rules/${rule.id}`, {
        debit_account_code: debitCode,
        credit_account_code: creditCode,
        active: active === 1
      });
      showMsg('success', `Regla "${rule.event_name}" actualizada.`);
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al actualizar regla.');
    }
  };

  const handleCreateArAp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/ar-ap`, {
        ...arApForm,
        total_amount: Number(arApForm.total_amount)
      });
      showMsg('success', res.message);
      setArApModalOpen(false);
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al registrar CXC/CXP.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterArApPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setSubmitting(true);
    try {
      const res = await apiRequest(
        'POST',
        `/hotels/${activeHotelId}/accounting/ar-ap/${payTarget.id}/payments`,
        { ...payForm, amount: Number(payForm.amount) }
      );
      showMsg('success', res.message);
      setPayTarget(null);
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al registrar pago.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/reconciliations`, {
        ...recForm,
        statement_balance: Number(recForm.statement_balance || 0)
      });
      showMsg('success', res.message);
      setRecForm((f) => ({ ...f, statement_balance: '', notes: '' }));
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al registrar conciliación.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/periods/close`, {
        period_code: closePeriodCode,
        closing_notes: closeNotes
      });
      showMsg('success', res.message);
      setCloseNotes('');
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al cerrar periodo contable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenPeriod = async (periodCode: string) => {
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/periods/reopen`, {
        period_code: periodCode
      });
      showMsg('success', res.message);
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al reabrir periodo.');
    }
  };

  const handleSaveDianConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dianState) return;
    setSubmitting(true);
    try {
      const res = await apiRequest(
        'PUT',
        `/hotels/${activeHotelId}/accounting/dian/config`,
        dianState.dian_config
      );
      showMsg('success', res.message);
      await fetchDian();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al guardar config DIAN.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrepareDianInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest('POST', `/hotels/${activeHotelId}/accounting/dian/invoices`, {
        ...dianInvForm,
        subtotal: Number(dianInvForm.subtotal),
        tax_amount: Number(dianInvForm.tax_amount || 0)
      });
      showMsg('success', res.message);
      setDianInvForm({
        customer_name: '',
        customer_doc_type: 'CC',
        customer_doc: '',
        customer_email: '',
        subtotal: '',
        tax_amount: '0'
      });
      await fetchDian();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al generar factura electrónica.');
    } finally {
      setSubmitting(false);
    }
  };

  const exportFinancialStatementsPdf = () => {
    if (!statements) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${activeHotel?.name || 'Hotel PMS'} — Estados Financieros`, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Periodo: ${statements.period.from_date} al ${statements.period.to_date} | Utilidad Neta: ${formatCOP(
        statements.income_statement.net_profit
      )}`,
      14,
      23
    );

    autoTable(doc, {
      startY: 29,
      head: [['Cuenta', 'Nombre', 'Débito Periodo', 'Crédito Periodo', 'Saldo Débito', 'Saldo Crédito']],
      body: statements.trial_balance.rows.map((r) => [
        r.code,
        r.name,
        formatCOP(r.period_debit),
        formatCOP(r.period_credit),
        formatCOP(r.closing_debit),
        formatCOP(r.closing_credit)
      ])
    });

    doc.save(`estados-financieros-${statements.period.from_date}-a-${statements.period.to_date}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Contabilidad y Administración Financiera
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Partida Doble, PUC, Libros Oficiales, CXC/CXP, Conciliación, Cierres y Adaptador DIAN ·{' '}
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {activeHotel?.name}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
              kpis.current_period_status === 'CERRADO'
                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300'
            }`}
          >
            {kpis.current_period_status === 'CERRADO' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            Periodo {kpis.current_period}: {kpis.current_period_status}
          </span>
          {canManage && (
            <button
              onClick={handleSyncOperations}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <RefreshCw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
              Contabilizar Pendientes
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/15 dark:border-emerald-500 dark:text-emerald-200'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/15 dark:border-rose-500 dark:text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="shrink-0 min-h-10 px-3 ml-3 rounded-lg bg-white/70 dark:bg-slate-800 text-xs font-bold">
            Cerrar
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Ingresos del Mes</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCOP(kpis.month_income)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Costos y gastos: {formatCOP(kpis.month_costs_expenses)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Utilidad Neta del Mes</p>
          <p
            className={`text-xl font-bold mt-1 ${
              kpis.month_net_profit >= 0
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatCOP(kpis.month_net_profit)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Estado de Resultados (P&G)</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Activos / Patrimonio</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {formatCOP(kpis.total_assets)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Pasivos: {formatCOP(kpis.total_liabilities)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Cartera CXC / Deuda CXP</p>
          <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">
            CXC: {formatCOP(kpis.cxc_pending)}
          </p>
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
            CXP: {formatCOP(kpis.cxp_pending)}
          </p>
        </div>
      </div>

      {/* Navegación */}
      <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800">
        {[
          { id: 'DIARIO', label: 'Libro Diario y Asientos', icon: BookOpen },
          { id: 'ESTADOS', label: 'Estados Financieros y Mayor', icon: FileSpreadsheet },
          { id: 'CARTERA', label: 'CXC y CXP', icon: Scale },
          { id: 'CONCILIACION', label: 'Conciliación y Cierres', icon: Lock },
          { id: 'PUC', label: 'PUC y Reglas Automáticas', icon: Settings2 },
          { id: 'DIAN', label: 'Facturación DIAN (Adaptador)', icon: FileCode2 }
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: LIBRO DIARIO */}
      {activeTab === 'DIARIO' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Comprobantes Contables — Libro Diario ({entries.length})</h2>
            {canManage && (
              <button
                onClick={openNewEntryModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Nuevo Comprobante Manual
              </button>
            )}
          </div>

          <div className="space-y-3">
            {entries.map((je) => (
              <div
                key={je.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {je.entry_number}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {je.entry_type}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          je.status === 'CONTABILIZADO'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
                        }`}
                      >
                        {je.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">
                      {je.entry_date} · {je.description}
                    </p>
                    {je.void_reason && (
                      <p className="text-[11px] text-rose-500 font-semibold">Motivo anulación: {je.void_reason}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Débito: {formatCOP(je.total_debit)} | Crédito: {formatCOP(je.total_credit)}
                    </p>
                    {canManage && je.status === 'CONTABILIZADO' && (
                      <button
                        onClick={() => {
                          setVoidTarget(je);
                          setVoidReason('');
                        }}
                        className="mt-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 text-[11px] font-bold"
                      >
                        Anular / Reversar
                      </button>
                    )}
                  </div>
                </div>

                <div className="table-scroll bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase">
                      <tr>
                        <th className="px-3 py-1.5">Cuenta</th>
                        <th className="px-3 py-1.5">Tercero / Detalle</th>
                        <th className="px-3 py-1.5 text-right">Débito</th>
                        <th className="px-3 py-1.5 text-right">Crédito</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {je.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-1.5 font-mono">
                            <b>{l.account_code}</b> — {l.account_name}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">
                            {l.third_party_name ? `${l.third_party_name} · ` : ''}
                            {l.description}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">
                            {l.debit > 0 ? formatCOP(l.debit) : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">
                            {l.credit > 0 ? formatCOP(l.credit) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">
                No hay comprobantes contables registrados aún. Haz clic en &quot;Contabilizar Pendientes&quot; o crea uno manual.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ESTADOS FINANCIEROS Y LIBRO MAYOR */}
      {activeTab === 'ESTADOS' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-3 items-end text-xs">
              <div>
                <label className="font-bold text-slate-500 block mb-1">Desde</label>
                <input
                  type="date"
                  value={stmtDates.from_date}
                  onChange={(e) => setStmtDates((d) => ({ ...d, from_date: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="font-bold text-slate-500 block mb-1">Hasta</label>
                <input
                  type="date"
                  value={stmtDates.to_date}
                  onChange={(e) => setStmtDates((d) => ({ ...d, to_date: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <button
                onClick={fetchStatementsAndLedger}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
              >
                Generar
              </button>
              <button
                onClick={exportFinancialStatementsPdf}
                disabled={!statements}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-bold disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>

            <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              {[
                { id: 'PYG', label: 'Estado Resultados (P&G)' },
                { id: 'BALANCE', label: 'Balance General' },
                { id: 'COMPROBACION', label: 'Balance Comprobación' },
                { id: 'MAYOR', label: 'Libro Mayor' }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStmtSubTab(st.id as typeof stmtSubTab)}
                  className={`px-3 py-1.5 rounded-lg ${
                    stmtSubTab === st.id
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {statements && stmtSubTab === 'PYG' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
              <h3 className="text-base font-bold">
                Estado de Resultados (P&G) · {statements.period.from_date} al {statements.period.to_date}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500 space-y-2">
                  <p className="font-bold text-emerald-700 dark:text-emerald-300 uppercase">Ingresos Operacionales</p>
                  {statements.income_statement.income.map((r) => (
                    <div key={r.code} className="flex justify-between">
                      <span>{r.code} · {r.name}</span>
                      <b>{formatCOP(r.amount)}</b>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-emerald-200 flex justify-between font-extrabold text-sm">
                    <span>Total Ingresos</span>
                    <span>{formatCOP(statements.income_statement.total_income)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500 space-y-2">
                  <p className="font-bold text-amber-700 dark:text-amber-300 uppercase">Costos y Gastos</p>
                  {[...statements.income_statement.costs, ...statements.income_statement.expenses].map((r) => (
                    <div key={r.code} className="flex justify-between">
                      <span>{r.code} · {r.name}</span>
                      <b>{formatCOP(r.amount)}</b>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-amber-200 flex justify-between font-extrabold text-sm">
                    <span>Total Costos + Gastos</span>
                    <span>
                      {formatCOP(statements.income_statement.total_costs + statements.income_statement.total_expenses)}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500 flex flex-col justify-center items-center text-center space-y-2">
                  <p className="font-bold text-indigo-700 dark:text-indigo-300 uppercase">Resultado Neto del Periodo</p>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {formatCOP(statements.income_statement.net_profit)}
                  </p>
                  <p className="text-slate-500">
                    Utilidad Bruta: {formatCOP(statements.income_statement.gross_profit)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {statements && stmtSubTab === 'BALANCE' && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Balance General al {statements.period.to_date}</h3>
                <span
                  className={`px-3 py-1 rounded-xl font-bold ${
                    statements.balance_sheet.is_balanced
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {statements.balance_sheet.is_balanced
                    ? 'Ecuación Patrimonial Cuadrada (A = P + Pt)'
                    : 'Revisar Cuadre Patrimonial'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="font-bold uppercase text-indigo-600">Activos</p>
                  {statements.balance_sheet.assets.map((r) => (
                    <div key={r.code} className="flex justify-between">
                      <span>{r.code} · {r.name}</span>
                      <b>{formatCOP(r.amount)}</b>
                    </div>
                  ))}
                  <div className="pt-2 border-t flex justify-between font-extrabold text-sm">
                    <span>TOTAL ACTIVOS</span>
                    <span>{formatCOP(statements.balance_sheet.total_assets)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="font-bold uppercase text-violet-600">Pasivos y Patrimonio</p>
                  {statements.balance_sheet.liabilities.map((r) => (
                    <div key={r.code} className="flex justify-between">
                      <span>{r.code} · {r.name}</span>
                      <b>{formatCOP(r.amount)}</b>
                    </div>
                  ))}
                  {statements.balance_sheet.equity.map((r) => (
                    <div key={r.code} className="flex justify-between">
                      <span>{r.code} · {r.name}</span>
                      <b>{formatCOP(r.amount)}</b>
                    </div>
                  ))}
                  <div className="flex justify-between text-indigo-600 font-semibold">
                    <span>Resultado del Ejercicio Acumulado</span>
                    <b>{formatCOP(statements.balance_sheet.cumulative_net_result)}</b>
                  </div>
                  <div className="pt-2 border-t flex justify-between font-extrabold text-sm">
                    <span>TOTAL PASIVO + PATRIMONIO</span>
                    <span>{formatCOP(statements.balance_sheet.liabilities_plus_equity)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {statements && stmtSubTab === 'COMPROBACION' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 table-scroll">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3 text-right">Saldo Inicial D</th>
                    <th className="px-4 py-3 text-right">Saldo Inicial C</th>
                    <th className="px-4 py-3 text-right">Mov. Débito</th>
                    <th className="px-4 py-3 text-right">Mov. Crédito</th>
                    <th className="px-4 py-3 text-right">Saldo Final D</th>
                    <th className="px-4 py-3 text-right">Saldo Final C</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {statements.trial_balance.rows.map((r) => (
                    <tr key={r.code}>
                      <td className="px-4 py-2.5 font-mono">
                        <b>{r.code}</b> — {r.name}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatCOP(r.opening_debit)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCOP(r.opening_credit)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCOP(r.period_debit)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCOP(r.period_credit)}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{formatCOP(r.closing_debit)}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{formatCOP(r.closing_credit)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 dark:bg-slate-800 font-extrabold">
                    <td className="px-4 py-3">SUMAS IGUALES</td>
                    <td className="px-4 py-3 text-right">{formatCOP(statements.trial_balance.totals.opening_debit)}</td>
                    <td className="px-4 py-3 text-right">{formatCOP(statements.trial_balance.totals.opening_credit)}</td>
                    <td className="px-4 py-3 text-right">{formatCOP(statements.trial_balance.totals.period_debit)}</td>
                    <td className="px-4 py-3 text-right">{formatCOP(statements.trial_balance.totals.period_credit)}</td>
                    <td className="px-4 py-3 text-right">{formatCOP(statements.trial_balance.totals.closing_debit)}</td>
                    <td className="px-4 py-3 text-right">{formatCOP(statements.trial_balance.totals.closing_credit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {stmtSubTab === 'MAYOR' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
                <label className="font-bold">Filtrar cuenta:</label>
                <select
                  value={ledgerAccountFilter}
                  onChange={(e) => setLedgerAccountFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="ALL">Todas las cuentas con movimiento</option>
                  {detailAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              {ledgerData.map((blk) => (
                <div
                  key={blk.account.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs"
                >
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap justify-between gap-2 font-bold">
                    <span>
                      {blk.account.code} — {blk.account.name} ({blk.account.nature})
                    </span>
                    <span>
                      Inicial: {formatCOP(blk.opening_balance)} | Final: {formatCOP(blk.closing_balance)}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-left">
                      <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Comprobante</th>
                          <th className="px-3 py-2">Descripción</th>
                          <th className="px-3 py-2 text-right">Débito</th>
                          <th className="px-3 py-2 text-right">Crédito</th>
                          <th className="px-3 py-2 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {blk.movements.map((m) => (
                          <tr key={m.id}>
                            <td className="px-3 py-2">{m.entry_date}</td>
                            <td className="px-3 py-2 font-mono">{m.entry_number}</td>
                            <td className="px-3 py-2">{m.description}</td>
                            <td className="px-3 py-2 text-right">{m.debit > 0 ? formatCOP(m.debit) : '-'}</td>
                            <td className="px-3 py-2 text-right">{m.credit > 0 ? formatCOP(m.credit) : '-'}</td>
                            <td className="px-3 py-2 text-right font-bold">{formatCOP(m.running_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CXC Y CXP */}
      {activeTab === 'CARTERA' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Cuentas por Cobrar (Agencias/Empresas) y Cuentas por Pagar (Proveedores)</h2>
            {canManage && (
              <button
                onClick={() => setArApModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Registrar CXC / CXP
              </button>
            )}
          </div>

          <div className="table-scroll">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Documento</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Tercero</th>
                  <th className="px-3 py-2.5">Emisión / Vence</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">Pagado</th>
                  <th className="px-3 py-2.5 text-right">Saldo</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {arApList.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 font-mono font-bold">{r.doc_number}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          r.doc_type === 'CXC'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {r.doc_type === 'CXC' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {r.doc_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold">
                      {r.third_party_name} <span className="text-slate-400">({r.third_party_type})</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.issue_date} → {r.due_date}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatCOP(r.total_amount)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCOP(r.paid_amount)}</td>
                    <td className="px-3 py-2.5 text-right font-extrabold">{formatCOP(r.balance)}</td>
                    <td className="px-3 py-2.5 font-bold">{r.status}</td>
                    <td className="px-3 py-2.5 text-right">
                      {canManage && r.balance > 0 && (
                        <button
                          onClick={() => {
                            setPayTarget(r);
                            setPayForm({
                              amount: String(r.balance),
                              payment_method: 'Efectivo',
                              reference: '',
                              register_in_cash: true
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold"
                        >
                          {r.doc_type === 'CXC' ? 'Recaudar' : 'Pagar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {arApList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No hay cuentas por cobrar o por pagar registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CONCILIACIÓN Y CIERRE CONTABLE */}
      {activeTab === 'CONCILIACION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h2 className="text-base font-bold">Conciliación de Cajas y Bancos</h2>
            {canManage && (
              <form onSubmit={handleCreateReconciliation} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div>
                  <label className="font-bold block mb-1">Cuenta</label>
                  <select
                    value={recForm.account_code}
                    onChange={(e) => setRecForm((f) => ({ ...f, account_code: e.target.value }))}
                    className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="110505">110505 · Caja General</option>
                    <option value="111005">111005 · Bancos Nacionales</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">Fecha Corte</label>
                  <input
                    type="date"
                    value={recForm.period_to}
                    onChange={(e) => setRecForm((f) => ({ ...f, period_to: e.target.value }))}
                    className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Saldo Extracto / Físico</label>
                  <input
                    type="number"
                    required
                    value={recForm.statement_balance}
                    onChange={(e) => setRecForm((f) => ({ ...f, statement_balance: e.target.value }))}
                    className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <button type="submit" disabled={submitting} className="py-2 px-3 rounded-xl bg-indigo-600 text-white font-bold">
                  Conciliar
                </button>
              </form>
            )}

            <div className="space-y-2">
              {reconciliations.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <div>
                    <p className="font-bold">
                      {r.account_code} — {r.account_name} (Corte: {r.period_to})
                    </p>
                    <p className="text-slate-500">
                      Libro: {formatCOP(r.book_balance)} · Extracto: {formatCOP(r.statement_balance)} · Dif:{' '}
                      <b>{formatCOP(r.difference)}</b>
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      r.status === 'CONCILIADA'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <h2 className="text-base font-bold">Cierre de Periodos Contables</h2>
            <p className="text-slate-500">
              Separado estrictamente del cierre de turno de caja: al cerrar un periodo mensual (`YYYY-MM`), el sistema bloquea nuevos asientos en ese mes para proteger la integridad de los estados financieros.
            </p>
            {canManage && (
              <form onSubmit={handleClosePeriod} className="space-y-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold block mb-1">Periodo (YYYY-MM)</label>
                    <input
                      value={closePeriodCode}
                      onChange={(e) => setClosePeriodCode(e.target.value)}
                      pattern="\d{4}-\d{2}"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" disabled={submitting} className="w-full py-2 px-3 rounded-xl bg-rose-600 text-white font-bold">
                      Cerrar Periodo
                    </button>
                  </div>
                </div>
                <input
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Notas del cierre contable..."
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </form>
            )}
            <div className="space-y-2">
              {periods.map((p) => (
                <div key={p.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-sm">{p.period_code}</span>
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        p.status === 'CERRADO' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  {canManage && p.status === 'CERRADO' && (
                    <button
                      onClick={() => handleReopenPeriod(p.period_code)}
                      className="text-indigo-600 hover:underline font-bold"
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PUC Y REGLAS AUTOMÁTICAS */}
      {activeTab === 'PUC' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Plan Único de Cuentas (PUC)</h2>
              {canManage && (
                <button
                  onClick={() => setPucModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva Cuenta
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.map((a) => (
                <div key={a.id} className="py-2 flex items-center justify-between">
                  <span className={Number(a.is_detail) === 0 ? 'font-extrabold text-slate-900 dark:text-white' : 'pl-3'}>
                    <span className="font-mono">{a.code}</span> · {a.name}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {a.account_class} · {a.nature}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-base font-bold">Reglas de Contabilización Automática</h2>
            <div className="max-h-96 overflow-y-auto space-y-2.5">
              {rules.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{r.event_name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{r.event_code}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      disabled={!canManage}
                      value={r.debit_account_code}
                      onChange={(e) => handleUpdateRule(r, e.target.value, r.credit_account_code, r.active)}
                      className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      {detailAccounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          D: {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      disabled={!canManage}
                      value={r.credit_account_code}
                      onChange={(e) => handleUpdateRule(r, r.debit_account_code, e.target.value, r.active)}
                      className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      {detailAccounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          C: {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: ADAPTADOR DIAN */}
      {activeTab === 'DIAN' && dianState && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-base font-bold">Configuración Proveedor Tecnológico DIAN</h2>
            <div
              className={`p-3 rounded-xl border ${
                dianState.config_status.ready_for_live_transmission
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
              }`}
            >
              <p className="font-bold">
                {dianState.config_status.ready_for_live_transmission
                  ? 'Adaptador listo para transmisión en Producción'
                  : 'Modo Preparación UBL 2.1 (Sin envío automático en producción)'}
              </p>
              {dianState.config_status.issues.map((iss, idx) => (
                <p key={idx} className="text-[11px] mt-0.5">
                  • {iss}
                </p>
              ))}
            </div>

            <form onSubmit={handleSaveDianConfig} className="space-y-3">
              <div>
                <label className="font-bold block mb-1">Proveedor Tecnológico</label>
                <select
                  value={dianState.dian_config.dian_provider}
                  onChange={(e) =>
                    setDianState((s) =>
                      s ? { ...s, dian_config: { ...s.dian_config, dian_provider: e.target.value } } : s
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {dianState.supported_providers.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Ambiente</label>
                  <select
                    value={dianState.dian_config.dian_environment}
                    onChange={(e) =>
                      setDianState((s) =>
                        s ? { ...s, dian_config: { ...s.dian_config, dian_environment: e.target.value } } : s
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="HABILITACION">HABILITACIÓN / PRUEBAS</option>
                    <option value="PRODUCCION">PRODUCCIÓN</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">Prefijo DIAN</label>
                  <input
                    value={dianState.dian_config.dian_prefix}
                    onChange={(e) =>
                      setDianState((s) =>
                        s ? { ...s, dian_config: { ...s.dian_config, dian_prefix: e.target.value } } : s
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
              <input
                placeholder="Número de Resolución DIAN (ej. 18764000001)"
                value={dianState.dian_config.dian_resolution}
                onChange={(e) =>
                  setDianState((s) =>
                    s ? { ...s, dian_config: { ...s.dian_config, dian_resolution: e.target.value } } : s
                  )
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <input
                placeholder="URL Endpoint Proveedor Tecnológico (https://...)"
                value={dianState.dian_config.dian_api_url}
                onChange={(e) =>
                  setDianState((s) =>
                    s ? { ...s, dian_config: { ...s.dian_config, dian_api_url: e.target.value } } : s
                  )
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              {canManage && (
                <button type="submit" disabled={submitting} className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">
                  Guardar Configuración DIAN
                </button>
              )}
            </form>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-base font-bold">Generador UBL 2.1 y Documentos Electrónicos</h2>
            {canManage && (
              <form onSubmit={handlePrepareDianInvoice} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <input
                  required
                  placeholder="Nombre / Razón social cliente"
                  value={dianInvForm.customer_name}
                  onChange={(e) => setDianInvForm((f) => ({ ...f, customer_name: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <input
                  placeholder="NIT / Cédula"
                  value={dianInvForm.customer_doc}
                  onChange={(e) => setDianInvForm((f) => ({ ...f, customer_doc: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Subtotal base"
                  value={dianInvForm.subtotal}
                  onChange={(e) => setDianInvForm((f) => ({ ...f, subtotal: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="IVA / Impuesto"
                  value={dianInvForm.tax_amount}
                  onChange={(e) => setDianInvForm((f) => ({ ...f, tax_amount: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <input
                  type="email"
                  placeholder="Email adquirente"
                  value={dianInvForm.customer_email}
                  onChange={(e) => setDianInvForm((f) => ({ ...f, customer_email: e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <button type="submit" disabled={submitting} className="py-2 px-3 rounded-xl bg-emerald-600 text-white font-bold">
                  Preparar Factura UBL 2.1
                </button>
              </form>
            )}

            <div className="space-y-2">
              {dianState.invoices.map((inv) => (
                <div key={inv.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-bold">
                      {inv.invoice_number} · {inv.customer_name} ({formatCOP(inv.total_amount)})
                    </p>
                    <p className="text-[10px] text-slate-400 truncate max-w-md">
                      CUFE Preview: {inv.cufe}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      {inv.provider_status}
                    </span>
                    <button
                      onClick={() => setXmlPreviewTarget(inv)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold"
                    >
                      Ver XML UBL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo Comprobante Manual */}
      {entryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleCreateEntry}
            className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto text-xs"
          >
            <h3 className="text-base font-bold">Nuevo Comprobante Contable (Partida Doble)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="date"
                value={entryForm.entry_date}
                onChange={(e) => setEntryForm((f) => ({ ...f, entry_date: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <input
                required
                placeholder="Concepto / Descripción general"
                value={entryForm.description}
                onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div className="space-y-2">
              {entryLines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={l.account_code}
                    onChange={(e) =>
                      setEntryLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, account_code: e.target.value } : x))
                      )
                    }
                    className="col-span-5 px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    {detailAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Detalle línea"
                    value={l.description}
                    onChange={(e) =>
                      setEntryLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                      )
                    }
                    className="col-span-2 px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Débito"
                    value={l.debit}
                    onChange={(e) =>
                      setEntryLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, debit: e.target.value, credit: Number(e.target.value) > 0 ? '0' : x.credit } : x))
                      )
                    }
                    className="col-span-2 px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Crédito"
                    value={l.credit}
                    onChange={(e) =>
                      setEntryLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, credit: e.target.value, debit: Number(e.target.value) > 0 ? '0' : x.debit } : x))
                      )
                    }
                    className="col-span-2 px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setEntryLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 text-rose-500 flex justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setEntryLines((prev) => [
                    ...prev,
                    { account_code: detailAccounts[0]?.code || '110505', description: '', third_party_name: '', debit: '0', credit: '0' }
                  ])
                }
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
              >
                + Agregar Línea
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center font-bold">
              <span>
                Débitos: {formatCOP(draftDebitSum)} | Créditos: {formatCOP(draftCreditSum)}
              </span>
              <span className={draftBalanced ? 'text-emerald-600' : 'text-rose-600'}>
                {draftBalanced ? 'Partida Doble Cuadrada ✓' : `Diferencia: ${formatCOP(Math.abs(draftDebitSum - draftCreditSum))}`}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEntryModalOpen(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800">
                Cancelar
              </button>
              <button type="submit" disabled={submitting || !draftBalanced} className="px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white disabled:opacity-50">
                Contabilizar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Nueva Cuenta PUC */}
      {pucModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleCreateAccount} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h3 className="text-base font-bold">Nueva Cuenta PUC</h3>
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Código (ej. 519510)" value={pucForm.code} onChange={(e) => setPucForm((f) => ({ ...f, code: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <select value={pucForm.account_class} onChange={(e) => setPucForm((f) => ({ ...f, account_class: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <option value="ACTIVO">ACTIVO</option>
                <option value="PASIVO">PASIVO</option>
                <option value="PATRIMONIO">PATRIMONIO</option>
                <option value="INGRESOS">INGRESOS</option>
                <option value="GASTOS">GASTOS</option>
                <option value="COSTOS">COSTOS</option>
              </select>
            </div>
            <input required placeholder="Nombre de la cuenta" value={pucForm.name} onChange={(e) => setPucForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <div className="grid grid-cols-2 gap-2">
              <select value={pucForm.nature} onChange={(e) => setPucForm((f) => ({ ...f, nature: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <option value="DEBITO">Naturaleza DÉBITO</option>
                <option value="CREDITO">Naturaleza CRÉDITO</option>
              </select>
              <label className="flex items-center gap-2 px-3 py-2">
                <input type="checkbox" checked={pucForm.is_detail} onChange={(e) => setPucForm((f) => ({ ...f, is_detail: e.target.checked }))} />
                Cuenta de detalle
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPucModalOpen(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Crear CXC / CXP */}
      {arApModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleCreateArAp} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h3 className="text-base font-bold">Registrar Cuenta por Cobrar / Pagar</h3>
            <div className="grid grid-cols-2 gap-2">
              <select value={arApForm.doc_type} onChange={(e) => setArApForm((f) => ({ ...f, doc_type: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <option value="CXC">CXC (Por Cobrar)</option>
                <option value="CXP">CXP (Por Pagar)</option>
              </select>
              <select value={arApForm.third_party_type} onChange={(e) => setArApForm((f) => ({ ...f, third_party_type: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <option value="AGENCIA">Agencia</option>
                <option value="EMPRESA">Empresa Corporativa</option>
                <option value="PROVEEDOR">Proveedor</option>
              </select>
            </div>
            <input required placeholder="Nombre Tercero" value={arApForm.third_party_name} onChange={(e) => setArApForm((f) => ({ ...f, third_party_name: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="NIT / Documento" value={arApForm.third_party_doc} onChange={(e) => setArApForm((f) => ({ ...f, third_party_doc: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="number" required min="1" placeholder="Valor Total" value={arApForm.total_amount} onChange={(e) => setArApForm((f) => ({ ...f, total_amount: e.target.value }))} className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>
            <input type="date" value={arApForm.due_date} onChange={(e) => setArApForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <textarea rows={2} placeholder="Notas / Factura referencia" value={arApForm.notes} onChange={(e) => setArApForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setArApModalOpen(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Pago CXC / CXP */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleRegisterArApPayment} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h3 className="text-base font-bold">
              {payTarget.doc_type === 'CXC' ? 'Recaudar' : 'Pagar'} {payTarget.doc_number}
            </h3>
            <p className="text-slate-500">Saldo pendiente: <b>{formatCOP(payTarget.balance)}</b></p>
            <input type="number" required min="1" max={payTarget.balance} value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <select value={payForm.payment_method} onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia Bancaria">Transferencia Bancaria</option>
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={payForm.register_in_cash} onChange={(e) => setPayForm((f) => ({ ...f, register_in_cash: e.target.checked }))} />
              Registrar movimiento en Caja abierta
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl font-bold bg-emerald-600 text-white">Confirmar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Anular Comprobante */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleVoidEntry} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <h3 className="text-base font-bold text-rose-600 flex items-center gap-2"><Ban className="w-4 h-4" /> Reversar {voidTarget.entry_number}</h3>
            <textarea required rows={3} placeholder="Motivo de la anulación contable..." value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVoidTarget(null)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl font-bold bg-rose-600 text-white">Confirmar Reversión</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: XML UBL 2.1 Preview */}
      {xmlPreviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold">XML UBL 2.1 — {xmlPreviewTarget.invoice_number}</h3>
              <button onClick={() => setXmlPreviewTarget(null)} className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold">Cerrar</button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-950 text-emerald-300 overflow-x-auto max-h-96 text-[11px]">
              {xmlPreviewTarget.xml_ubl_preview}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

