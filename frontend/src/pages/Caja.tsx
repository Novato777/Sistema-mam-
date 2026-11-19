import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Lock,
  Unlock,
  FileText,
  Ban,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Clock,
  Users,
  Calendar,
  Banknote,
  Smartphone,
  ChevronDown,
  ChevronRight,
  History
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import {
  INPUT,
  money,
  StatCard,
  Field,
  MoneyInput,
  Row,
  Panel,
  EmptyText,
  Notice,
  SecondaryBtn,
  PrimaryBtn,
  Modal,
  Segmented,
  PayMethodPicker,
  flat,
  toneFromBg,
  SECTION,
  SECTION_HEAD,
  HeadIcon,
  ModuleHeader
} from '../components/ModuleUI';
import type { Tone } from '../components/ModuleUI';

/* =========================================================================
   TIPOS
========================================================================= */

type MovementSubtype =
  | 'INGRESO'
  | 'EGRESO'
  | 'PAGO_HUESPED'
  | 'ABONO'
  | 'ANTICIPO'
  | 'PAGO_SERVICIO'
  | 'DEVOLUCION';

interface RegisterSummary {
  register_id: number;
  opening_balance: number;
  active_income: number;
  active_expense: number;
  expected_cash: number;
  expected_transfer: number;
  expected_card: number;
  expected_other: number;
  expected_total: number;
  voided_count: number;
  voided_amount: number;
  movements_count: number;
}

interface CashRegisterItem {
  id: number;
  hotel_id: number;
  user_id: number;
  operator_name: string;
  closed_by_name?: string | null;
  name: string;
  shift: string;
  operation_point: string;
  opening_time: string;
  closing_time: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number;
  difference: number;
  status: 'ABIERTA' | 'CERRADA';
  observations: string;
  summary: RegisterSummary;
}

interface CashAuditItem {
  id: number;
  register_id: number;
  register_name: string;
  shift: string;
  operation_point: string;
  auditor_name: string;
  audit_type: string;
  expected_cash: number;
  counted_cash: number;
  cash_difference: number;
  expected_transfer: number;
  counted_transfer: number;
  expected_card: number;
  counted_card: number;
  total_expected: number;
  total_counted: number;
  total_difference: number;
  notes: string;
  created_at: string;
}

interface CashMovementItem {
  id: number;
  register_id: number;
  register_name: string;
  shift: string;
  operation_point: string;
  receipt_number: string;
  type: string;
  movement_subtype: string;
  amount: number;
  category: string;
  payment_method: string;
  description: string;
  reference: string;
  date: string;
  cashier_name: string;
  voided: number;
  is_compensating?: number;
  void_reason?: string;
  voided_at?: string;
  voided_by_name?: string;
  compensating_movement_id?: number;
}

interface ReportData {
  totals: {
    total_income: number;
    total_expense: number;
    net_balance: number;
    voided_count: number;
    movements_count: number;
  };
  movements: CashMovementItem[];
  report_by_user: any[];
  report_by_shift: any[];
  report_by_date: any[];
  report_by_method: any[];
}

type Direction = 'IN' | 'OUT';
type Period = 'HOY' | 'SEMANA' | 'MES' | 'FECHAS';
type CountMode = 'AUDIT' | 'CLOSE';

const EMPTY_REPORT: ReportData = {
  totals: { total_income: 0, total_expense: 0, net_balance: 0, voided_count: 0, movements_count: 0 },
  movements: [],
  report_by_user: [],
  report_by_shift: [],
  report_by_date: [],
  report_by_method: []
};

/* =========================================================================
   CONCEPTOS RÁPIDOS
   Cada concepto ya sabe qué tipo de movimiento es, así el usuario solo
   decide "entra" o "sale" y toca el concepto.
========================================================================= */

const IN_CONCEPTS: Array<{ label: string; category: string; subtype: MovementSubtype }> = [
  { label: 'Agua / Bebidas', category: 'Venta de Bebidas', subtype: 'PAGO_SERVICIO' },
  { label: 'Desayuno / Comida', category: 'Venta Restaurante', subtype: 'PAGO_SERVICIO' },
  { label: 'Lavandería', category: 'Servicio Lavandería', subtype: 'PAGO_SERVICIO' },
  { label: 'Parqueadero', category: 'Parqueadero', subtype: 'PAGO_SERVICIO' },
  { label: 'Otro ingreso', category: 'Ingreso Operativo', subtype: 'INGRESO' }
];

const OUT_CONCEPTS: Array<{ label: string; category: string; subtype: MovementSubtype }> = [
  { label: 'Insumos / Aseo', category: 'Insumos y Aseo', subtype: 'EGRESO' },
  { label: 'Pago Proveedor', category: 'Pago a Proveedores', subtype: 'EGRESO' },
  { label: 'Servicios Públicos', category: 'Servicios Públicos', subtype: 'EGRESO' },
  { label: 'Adelanto Personal', category: 'Adelanto Personal', subtype: 'EGRESO' },
  { label: 'Domicilio / Transp.', category: 'Transporte y Varios', subtype: 'EGRESO' },
  { label: 'Devolución a cliente', category: 'Devolución a Cliente', subtype: 'DEVOLUCION' }
];

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000];
const QUICK_BASES = [50000, 100000, 200000];

/* =========================================================================
   UTILIDADES
========================================================================= */

/** Fecha local YYYY-MM-DD (evita que de noche salga la fecha de mañana por UTC). */
const localDate = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Turno según la hora actual: así no hay que elegirlo al abrir caja. */
const currentShift = () => {
  const h = new Date().getHours();
  if (h < 12) return 'MAÑANA';
  if (h < 18) return 'TARDE';
  return 'NOCHE';
};

const periodRange = (p: Period, today: string) => {
  if (p === 'HOY') return { startDate: today, endDate: today };
  if (p === 'SEMANA') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { startDate: localDate(d), endDate: today };
  }
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
};

const onlyDigits = (v: string | number) => Number(String(v).replace(/\D/g, '')) || 0;
const formatMoney = (val: number | string | null | undefined) => Number(val || 0).toLocaleString('es-CO');
const hourOf = (iso?: string | null) => (iso ? iso.slice(11, 16) : '');
const dateTime = (iso?: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');

const paymentLabel = (method: string) => {
  if (method === 'EFECTIVO') return 'Efectivo';
  if (method === 'TRANSFERENCIA') return 'Nequi / Transf.';
  if (method === 'TARJETA') return 'Tarjeta';
  return method || 'Otro';
};

const subtypeLabel = (st: string) => {
  const labels: Record<string, string> = {
    INGRESO: 'Entrada',
    EGRESO: 'Gasto',
    PAGO_HUESPED: 'Cobro habitación',
    ABONO: 'Abono habitación',
    ANTICIPO: 'Anticipo reserva',
    PAGO_SERVICIO: 'Venta servicio',
    DEVOLUCION: 'Devolución'
  };
  return labels[st] || st;
};

const pointLabel = (p: string) => {
  if (p === 'RECEPCION') return 'Recepción';
  if (p === 'RESTAURANTE') return 'Restaurante';
  if (p === 'CAJA_GENERAL') return 'Caja general';
  return p;
};

const diffClass = (d: number) =>
  d === 0
    ? 'text-emerald-700 dark:text-emerald-400'
    : d > 0
    ? 'text-sky-700 dark:text-sky-400'
    : 'text-rose-700 dark:text-rose-400';

const METHOD_COLOR: Record<string, string> = {
  EFECTIVO: 'bg-sky-700',
  TRANSFERENCIA: 'bg-indigo-700',
  TARJETA: 'bg-violet-700'
};

const isIncome = (m: CashMovementItem) => m.type === 'INGRESO' || m.type === 'Ingreso';

/* =========================================================================
   PÁGINA
========================================================================= */

export default function Caja() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const token = localStorage.getItem('token');
  const apiBase = `${API_URL}/api/hotels/${activeHotelId}/cash`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Hotel-Id': String(activeHotelId)
  };

  const canOperate = hasPermission('cash.operate');
  const canClose = hasPermission('cash.close');
  const canVoid = hasPermission('cash.void');

  const todayStr = useMemo(() => localDate(), []);

  const [activeTab, setActiveTab] = useState<'HOY' | 'HISTORIAL'>('HOY');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  /* ---------- Estado general ---------- */
  const [myRegister, setMyRegister] = useState<CashRegisterItem | null>(null);
  const [openRegisters, setOpenRegisters] = useState<CashRegisterItem[]>([]);
  const [recentRegisters, setRecentRegisters] = useState<CashRegisterItem[]>([]);
  const [recentAudits, setRecentAudits] = useState<CashAuditItem[]>([]);
  const [activeStays, setActiveStays] = useState<any[]>([]);
  const [activeReservations, setActiveReservations] = useState<any[]>([]);
  const [selectedRegId, setSelectedRegId] = useState<number | null>(null);
  const [shiftMovements, setShiftMovements] = useState<CashMovementItem[]>([]);

  /** La caja con la que se trabaja: la elegida, o la del usuario, o la primera abierta. */
  const register =
    openRegisters.find((r) => r.id === selectedRegId) ||
    (myRegister && openRegisters.find((r) => r.id === myRegister.id)) ||
    openRegisters[0] ||
    null;

  /* ---------- Formulario de movimiento ---------- */
  const [direction, setDirection] = useState<Direction>('IN');
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'EFECTIVO',
    description: '',
    category: '',
    subtype: '' as MovementSubtype | '',
    link: '', // '' | 's:<stay_id>' | 'r:<reservation_id>'
    reference: ''
  });
  const [showReference, setShowReference] = useState(false);
  const concepts = direction === 'IN' ? IN_CONCEPTS : OUT_CONCEPTS;
  const isOut = direction === 'OUT';

  /* ---------- Abrir caja ---------- */
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openForm, setOpenForm] = useState({
    shift: currentShift(),
    opening_balance: '100000',
    operation_point: 'RECEPCION',
    name: ''
  });

  /* ---------- Contar / Cerrar ---------- */
  const [countModal, setCountModal] = useState<{ mode: CountMode; reg: CashRegisterItem } | null>(null);
  const [countForm, setCountForm] = useState({
    counted_cash: '',
    counted_transfer: '',
    counted_card: '',
    notes: ''
  });

  /* ---------- Anular / Recibo ---------- */
  const [voidModalMov, setVoidModalMov] = useState<CashMovementItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [receiptModalData, setReceiptModalData] = useState<any>(null);

  /* ---------- Historial ---------- */
  const [period, setPeriod] = useState<Period>('HOY');
  const [filters, setFilters] = useState({
    startDate: todayStr,
    endDate: todayStr,
    shift: 'ALL',
    type: 'ALL',
    paymentMethod: 'ALL',
    includeVoided: '1'
  });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [reportData, setReportData] = useState<ReportData>(EMPTY_REPORT);

  /* =======================================================================
     CARGA DE DATOS
  ======================================================================= */

  const fetchOverview = async () => {
    const resp = await fetch(`${apiBase}/overview`, { headers });
    if (!resp.ok) throw new Error('No se pudo consultar el estado de la caja.');
    const data = await resp.json();
    setMyRegister(data.active_register || null);
    setOpenRegisters(data.open_registers || []);
    setRecentRegisters(data.recent_registers || []);
    setRecentAudits(data.recent_audits || []);
    setActiveStays(data.active_stays || []);
    setActiveReservations(data.active_reservations || []);
  };

  const fetchReports = async () => {
    const resp = await fetch(`${apiBase}/reports?${new URLSearchParams(filters)}`, { headers });
    if (!resp.ok) throw new Error('No se pudo consultar el historial de caja.');
    setReportData(await resp.json());
  };

  const fetchShiftMovements = async (regId: number | undefined) => {
    if (!regId) {
      setShiftMovements([]);
      return;
    }
    const q = new URLSearchParams({ registerId: String(regId), includeVoided: '1' });
    const resp = await fetch(`${apiBase}/reports?${q}`, { headers });
    if (!resp.ok) return;
    const data = await resp.json();
    setShiftMovements(data.movements || []);
  };

  const refreshAll = async () => {
    try {
      await Promise.all([fetchOverview(), fetchReports()]);
    } catch (err: any) {
      setError(err.message || 'Error inesperado cargando caja');
    }
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchOverview()
      .catch((err) => setError(err.message || 'Error inesperado cargando caja'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHotelId]);

  useEffect(() => {
    fetchReports().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeHotelId,
    filters.startDate,
    filters.endDate,
    filters.shift,
    filters.type,
    filters.paymentMethod,
    filters.includeVoided
  ]);

  // Los movimientos del turno se recargan cuando cambia la caja o sus totales
  useEffect(() => {
    fetchShiftMovements(register?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register?.id, register?.summary?.movements_count, register?.summary?.expected_total]);

  /* =======================================================================
     ACCIONES
  ======================================================================= */

  const post = async (url: string, body: any, fallbackError: string) => {
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || fallbackError);
    return data;
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error');
    } finally {
      setBusy(false);
    }
  };

  const resetMovementForm = () => {
    setForm((prev) => ({
      ...prev,
      amount: '',
      description: '',
      category: '',
      subtype: '',
      link: '',
      reference: ''
    }));
    setShowReference(false);
  };

  const changeDirection = (d: Direction) => {
    setDirection(d);
    setForm((prev) => ({ ...prev, description: '', category: '', subtype: '', link: '' }));
  };

  const pickConcept = (c: { label: string; category: string; subtype: MovementSubtype }) => {
    setForm((prev) => ({
      ...prev,
      description: c.label,
      category: c.category,
      subtype: c.subtype,
      link: ''
    }));
  };

  const pickLink = (value: string) => {
    if (!value) {
      setForm((prev) => ({ ...prev, link: '', description: '', category: '', subtype: '' }));
      return;
    }
    const [kind, id] = value.split(':');
    if (kind === 's') {
      const st = activeStays.find((s) => String(s.stay_id) === id);
      setForm((prev) => ({
        ...prev,
        link: value,
        subtype: 'PAGO_HUESPED',
        category: 'Cobro de Habitación',
        amount: st && st.balance > 0 ? String(st.balance) : prev.amount,
        description: st ? `Pago Hab. #${st.room_number} - ${st.guest_name}` : prev.description
      }));
    } else {
      const rv = activeReservations.find((r) => String(r.reservation_id) === id);
      setForm((prev) => ({
        ...prev,
        link: value,
        subtype: 'ANTICIPO',
        category: 'Anticipo Reserva',
        amount: rv && rv.pending_balance > 0 ? String(rv.pending_balance) : prev.amount,
        description: rv ? `Anticipo Reserva ${rv.code} - ${rv.guest_name}` : prev.description
      }));
    }
  };

  const handleCreateMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = onlyDigits(form.amount);
    if (amount <= 0) {
      setError('Escribe cuánto dinero es.');
      return;
    }
    if (!form.description.trim()) {
      setError('Elige un concepto o escribe una descripción.');
      return;
    }
    const subtype: MovementSubtype = form.subtype || (isOut ? 'EGRESO' : 'INGRESO');
    const [kind, linkId] = form.link.split(':');

    run(async () => {
      const data = await post(
        `${apiBase}/movements`,
        {
          register_id: register?.id,
          movement_subtype: subtype,
          type: isOut ? 'EGRESO' : 'INGRESO',
          amount,
          category: form.category || (isOut ? 'Gasto Operativo' : 'Ingreso Operativo'),
          payment_method: form.payment_method,
          description: form.description.trim(),
          reference: form.reference.trim(),
          stay_id: kind === 's' ? Number(linkId) : undefined,
          reservation_id: kind === 'r' ? Number(linkId) : undefined,
          date: todayStr
        },
        'No se pudo guardar el movimiento.'
      );
      setFeedback(data.message || 'Movimiento guardado.');
      resetMovementForm();
      await refreshAll();
    });
  };

  const openRegister = (overrides: Partial<typeof openForm> = {}) => {
    const f = { ...openForm, ...overrides };
    run(async () => {
      const data = await post(
        `${apiBase}/registers/open`,
        {
          name: f.name.trim(),
          operation_point: f.operation_point,
          shift: f.shift,
          opening_balance: onlyDigits(f.opening_balance),
          observations: ''
        },
        'No se pudo abrir la caja.'
      );
      setFeedback(data.message || 'Caja abierta.');
      setShowOpenModal(false);
      if (data.register?.id) setSelectedRegId(data.register.id);
      await refreshAll();
    });
  };

  const startCount = (mode: CountMode, reg: CashRegisterItem) => {
    // Lo digital (Nequi/tarjeta) ya lo conoce el sistema; el efectivo se cuenta a mano.
    setCountForm({
      counted_cash: '',
      counted_transfer: String(reg.summary.expected_transfer || 0),
      counted_card: String(reg.summary.expected_card || 0),
      notes: ''
    });
    setCountModal({ mode, reg });
  };

  const handleCount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!countModal) return;
    const { mode, reg } = countModal;
    const counted = {
      counted_cash: onlyDigits(countForm.counted_cash),
      counted_transfer: onlyDigits(countForm.counted_transfer),
      counted_card: onlyDigits(countForm.counted_card)
    };
    run(async () => {
      if (mode === 'AUDIT') {
        const data = await post(
          `${apiBase}/registers/${reg.id}/audit`,
          { ...counted, notes: countForm.notes.trim() },
          'No se pudo guardar el conteo.'
        );
        const d = Number(data.audit?.total_difference || 0);
        setFeedback(d === 0 ? 'Conteo guardado: la caja cuadra.' : `Conteo guardado. Diferencia: $${formatMoney(d)}.`);
      } else {
        const data = await post(
          `${apiBase}/registers/${reg.id}/close`,
          { ...counted, observations: countForm.notes.trim() },
          'No se pudo cerrar la caja.'
        );
        const d = Number(data.register?.difference || 0);
        setFeedback(d === 0 ? 'Turno cerrado: la caja cuadró.' : `Turno cerrado. Diferencia final: $${formatMoney(d)}.`);
        setSelectedRegId(null);
      }
      setCountModal(null);
      await refreshAll();
    });
  };

  const handleVoidMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalMov) return;
    if (!voidReason.trim()) {
      setError('Escribe por qué se anula.');
      return;
    }
    run(async () => {
      const data = await post(
        `${apiBase}/movements/${voidModalMov.id}/void`,
        { void_reason: voidReason.trim() },
        'No se pudo anular el movimiento.'
      );
      setFeedback(data.message || 'Movimiento anulado.');
      setVoidModalMov(null);
      setVoidReason('');
      await refreshAll();
    });
  };

  const openReceipt = async (movementId: number) => {
    try {
      const resp = await fetch(`${apiBase}/movements/${movementId}/receipt`, { headers });
      if (!resp.ok) throw new Error('No se pudo cargar el recibo.');
      setReceiptModalData(await resp.json());
    } catch (err: any) {
      setError(err.message);
    }
  };

  const askVoid = (m: CashMovementItem) => {
    setVoidModalMov(m);
    setVoidReason('');
  };

  const changePeriod = (p: Period) => {
    setPeriod(p);
    if (p !== 'FECHAS') setFilters((prev) => ({ ...prev, ...periodRange(p, todayStr) }));
  };

  /* =======================================================================
     RENDER
  ======================================================================= */

  const digitalTotal =
    Number(register?.summary?.expected_transfer || 0) + Number(register?.summary?.expected_card || 0);
  const hasLinks = activeStays.length > 0 || activeReservations.length > 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <ModuleHeader
        icon={<Wallet className="w-5 h-5" />}
        iconColor="bg-emerald-700"
        title={
          <>
            Caja
            <span className="font-semibold text-slate-500 dark:text-slate-400"> · {activeHotel?.name || 'Hotel'}</span>
          </>
        }
        subtitle={
          loading ? 'Cargando…' : register ? `Turno ${register.shift.toLowerCase()} abierto` : 'La caja está cerrada'
        }
        tabs={[
          { id: 'HOY', label: 'Caja de hoy', short: 'Hoy', icon: <Wallet className="w-5 h-5 shrink-0" /> },
          { id: 'HISTORIAL', label: 'Historial', short: 'Historial', icon: <History className="w-5 h-5 shrink-0" /> }
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {feedback && (
        <Notice tone="success" onClose={() => setFeedback('')}>
          {feedback}
        </Notice>
      )}
      {error && (
        <Notice tone="error" onClose={() => setError('')}>
          {error}
        </Notice>
      )}

      {/* =====================================================================
          PESTAÑA 1: CAJA DE HOY
      ===================================================================== */}
      {activeTab === 'HOY' && (
        <>
          {loading ? (
            <div className={`p-10 text-center text-sm font-semibold text-slate-500 ${SECTION('slate')}`}>
              Cargando caja…
            </div>
          ) : !register ? (
            /* ---------- CAJA CERRADA: un solo paso para abrir ---------- */
            <section className={`max-w-2xl mx-auto ${SECTION('amber')}`}>
              <div className={`${SECTION_HEAD('amber')} flex items-center gap-3`}>
                <HeadIcon t="amber">
                  <Lock className="w-5 h-5 shrink-0" />
                </HeadIcon>
                <div>
                  <p className="text-lg font-black leading-tight text-slate-900 dark:text-white">La caja está cerrada</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Ábrela para empezar a cobrar o registrar gastos.
                  </p>
                </div>
              </div>

              {canOperate ? (
                <div className="p-5 space-y-4">
                  <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                    ¿Con cuánto efectivo empiezas?
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {QUICK_BASES.map((base) => (
                      <button
                        key={base}
                        type="button"
                        disabled={busy}
                        onClick={() => openRegister({ opening_balance: String(base), shift: currentShift() })}
                        className="h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-lg font-black cursor-pointer flex flex-col items-center justify-center leading-tight"
                      >
                        ${formatMoney(base)}
                        <span className="text-[11px] font-semibold text-white/85">Abrir con esto</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenForm((prev) => ({ ...prev, shift: currentShift() }));
                      setShowOpenModal(true);
                    }}
                    className="w-full h-12 rounded-2xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 text-sm font-bold cursor-pointer"
                  >
                    Otro valor u opciones
                  </button>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 text-center">
                    Se abrirá el turno de la {currentShift().toLowerCase()} en Recepción.
                  </p>
                </div>
              ) : (
                <p className="p-5 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Pide a un encargado que abra la caja.
                </p>
              )}
            </section>
          ) : (
            <>
              {/* ---------- Selector si hay varias cajas abiertas ---------- */}
              {openRegisters.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Trabajando en:</span>
                  {openRegisters.map((r) => {
                    const on = r.id === register.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRegId(r.id)}
                        className={`h-10 px-4 rounded-full text-sm font-bold border-2 cursor-pointer ${
                          on
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {pointLabel(r.operation_point)} · {r.shift.toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ---------- Estado de la caja abierta ---------- */}
              <section className={SECTION('emerald')}>
                <div className={`${SECTION_HEAD('emerald')} flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <HeadIcon t="emerald">
                      <Unlock className="w-5 h-5 shrink-0" />
                    </HeadIcon>
                    <div className="min-w-0">
                      <p className="text-lg font-black leading-tight text-slate-900 dark:text-white">Caja abierta</p>
                      <p className="text-sm font-medium leading-snug text-slate-600 dark:text-slate-300">
                        Turno {register.shift.toLowerCase()} · {pointLabel(register.operation_point)}
                        {hourOf(register.opening_time) ? ` · desde las ${hourOf(register.opening_time)}` : ''} ·{' '}
                        {register.operator_name || 'Administrador'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startCount('AUDIT', register)}
                      className="h-11 px-4 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Calculator className="w-5 h-5 shrink-0" />
                      Contar
                    </button>
                    {canClose && (
                      <button
                        type="button"
                        onClick={() => startCount('CLOSE', register)}
                        className="h-11 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 border-2 border-rose-700 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Lock className="w-5 h-5 shrink-0" />
                        Cerrar turno
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 sm:p-4">
                  <BigFigure
                    cardTone="sky"
                    icon={<Banknote className="w-5 h-5" />}
                    label="Efectivo en caja"
                    value={`$${formatMoney(register.summary.expected_cash)}`}
                    hint={`Incluye la base de $${formatMoney(register.opening_balance)}`}
                  />
                  <BigFigure
                    cardTone="indigo"
                    icon={<Smartphone className="w-5 h-5" />}
                    label="Nequi, transf. y tarjeta"
                    value={`$${formatMoney(digitalTotal)}`}
                    hint="No está en la caja física"
                  />
                  <BigFigure
                    cardTone="slate"
                    icon={<Calculator className="w-5 h-5" />}
                    label="Total del turno"
                    value={`$${formatMoney(register.summary.expected_total)}`}
                    hint={`Entró $${formatMoney(register.summary.active_income)} · Salió $${formatMoney(
                      register.summary.active_expense
                    )}`}
                  />
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
                {/* ---------- Formulario: entra / sale dinero ---------- */}
                <form
                  onSubmit={handleCreateMovement}
                  className={`lg:col-span-7 rounded-2xl p-4 sm:p-6 space-y-5 ${flat(isOut ? 'rose' : 'emerald', true)}`}
                >
                  {canOperate ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <DirectionButton
                          active={!isOut}
                          onClick={() => changeDirection('IN')}
                          color="bg-emerald-600 border-emerald-600"
                          icon={<ArrowUpRight className="w-6 h-6" />}
                          label="Entra dinero"
                          hint="Cobros y ventas"
                        />
                        <DirectionButton
                          active={isOut}
                          onClick={() => changeDirection('OUT')}
                          color="bg-rose-600 border-rose-600"
                          icon={<ArrowDownRight className="w-6 h-6" />}
                          label="Sale dinero"
                          hint="Gastos y pagos"
                        />
                      </div>

                      {!isOut && hasLinks && (
                        <Field label="¿Es pago de una habitación o reserva? (opcional)">
                          <select value={form.link} onChange={(e) => pickLink(e.target.value)} className={INPUT}>
                            <option value="">No, es otra cosa</option>
                            {activeStays.length > 0 && (
                              <optgroup label="Huéspedes alojados">
                                {activeStays.map((s) => (
                                  <option key={`s${s.stay_id}`} value={`s:${s.stay_id}`}>
                                    Hab. {s.room_number} — {s.guest_name} (debe ${formatMoney(s.balance)})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {activeReservations.length > 0 && (
                              <optgroup label="Reservas">
                                {activeReservations.map((r) => (
                                  <option key={`r${r.reservation_id}`} value={`r:${r.reservation_id}`}>
                                    {r.code} — {r.guest_name} (debe ${formatMoney(r.pending_balance)})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </Field>
                      )}

                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">¿Cuánto?</p>
                        <MoneyInput
                          value={form.amount}
                          onChange={(v) => setForm((prev) => ({ ...prev, amount: v }))}
                          required
                          big
                          placeholder="0"
                        />
                        <div className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2">
                          {QUICK_AMOUNTS.map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, amount: String(val) }))}
                              className="h-10 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-sm font-bold text-slate-800 dark:text-slate-100 hover:border-slate-600 dark:hover:border-slate-300 cursor-pointer"
                            >
                              ${formatMoney(val)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {isOut ? '¿Cómo se pagó?' : '¿Cómo pagaron?'}
                        </p>
                        <PayMethodPicker
                          value={form.payment_method}
                          onChange={(v) => setForm((prev) => ({ ...prev, payment_method: v }))}
                        />
                      </div>

                      {!form.link && (
                        <div className="space-y-2">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">¿Por qué?</p>
                          <div className="flex flex-wrap gap-2">
                            {concepts.map((c) => {
                              const on = form.description === c.label;
                              return (
                                <button
                                  key={c.label}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => pickConcept(c)}
                                  className={`h-10 px-4 rounded-full text-sm font-semibold border cursor-pointer ${
                                    on
                                      ? isOut
                                        ? 'bg-rose-600 border-rose-600 text-white'
                                        : 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600 dark:hover:border-slate-300'
                                  }`}
                                >
                                  {c.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <Field label="Descripción">
                        <input
                          type="text"
                          value={form.description}
                          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder={isOut ? 'Ej: Compra de jabón y escoba' : 'Ej: Venta de 2 aguas'}
                          className={INPUT}
                        />
                      </Field>

                      {showReference ? (
                        <Field label="N.º de recibo o factura">
                          <input
                            type="text"
                            value={form.reference}
                            onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
                            className={INPUT}
                            autoFocus
                          />
                        </Field>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowReference(true)}
                          className="min-h-10 text-sm font-bold text-slate-600 dark:text-slate-300 underline underline-offset-2 cursor-pointer"
                        >
                          + Agregar n.º de recibo o factura
                        </button>
                      )}

                      <button
                        type="submit"
                        disabled={busy}
                        className={`w-full h-14 rounded-2xl text-white text-base font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                          isOut ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        <CheckCircle2 className="w-6 h-6 shrink-0" />
                        <span>
                          {isOut ? 'Guardar salida' : 'Guardar entrada'}
                          {form.amount ? ` · $${formatMoney(onlyDigits(form.amount))}` : ''}
                        </span>
                      </button>
                    </>
                  ) : (
                    <EmptyText>No tienes permiso para registrar movimientos.</EmptyText>
                  )}
                </form>

                {/* ---------- Lo que pasó en este turno ---------- */}
                <section className={`lg:col-span-5 ${SECTION('sky')}`}>
                  <div className={`${SECTION_HEAD('sky')} flex items-center justify-between gap-2`}>
                    <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2.5">
                      <HeadIcon t="sky">
                        <FileText className="w-5 h-5 shrink-0" />
                      </HeadIcon>
                      En este turno ({shiftMovements.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('HISTORIAL')}
                      className="h-9 px-3 rounded-lg border-2 border-indigo-500 bg-white/95 dark:bg-slate-900 text-sm font-bold text-indigo-800 dark:text-indigo-200 inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      Ver historial <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {shiftMovements.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Aún no hay movimientos en este turno.
                      </p>
                    </div>
                  ) : (
                    <MovementList
                      movements={shiftMovements}
                      canVoid={canVoid}
                      onReceipt={openReceipt}
                      onVoid={askVoid}
                      compact
                    />
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}

      {/* =====================================================================
          PESTAÑA 2: HISTORIAL
      ===================================================================== */}
      {activeTab === 'HISTORIAL' && (
        <div className="space-y-4 sm:space-y-5">
          <section className={`p-4 sm:p-5 space-y-3 ${SECTION('slate')}`}>
            <Segmented<Period>
              value={period}
              onChange={changePeriod}
              options={[
                { id: 'HOY', label: 'Hoy' },
                { id: 'SEMANA', label: '7 días' },
                { id: 'MES', label: 'Este mes' },
                { id: 'FECHAS', label: 'Fechas' }
              ]}
            />
            {period === 'FECHAS' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde">
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                <Field label="Hasta">
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
              </div>
            )}
            <Segmented
              value={filters.type}
              onChange={(v) => setFilters((prev) => ({ ...prev, type: v }))}
              options={[
                { id: 'ALL', label: 'Todo' },
                { id: 'INGRESO', label: 'Entradas', color: 'bg-emerald-600' },
                { id: 'EGRESO', label: 'Salidas', color: 'bg-rose-600' }
              ]}
            />
            <button
              type="button"
              onClick={() => setShowMoreFilters((v) => !v)}
              aria-expanded={showMoreFilters}
              className="h-10 px-4 rounded-xl border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
              {showMoreFilters ? 'Menos filtros' : 'Más filtros'}
            </button>
            {showMoreFilters && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Turno">
                  <select
                    value={filters.shift}
                    onChange={(e) => setFilters((prev) => ({ ...prev, shift: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="ALL">Todos</option>
                    <option value="MAÑANA">Mañana</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOCHE">Noche</option>
                  </select>
                </Field>
                <Field label="Forma de pago">
                  <select
                    value={filters.paymentMethod}
                    onChange={(e) => setFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="ALL">Todas</option>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Nequi / Transf.</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </Field>
              </div>
            )}
          </section>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard variant="flat" color="bg-emerald-700" label="Entró" value={`+$${formatMoney(reportData.totals.total_income)}`} compact />
            <StatCard variant="flat" color="bg-rose-700" label="Salió" value={`−$${formatMoney(reportData.totals.total_expense)}`} compact />
            <StatCard variant="flat" color="bg-indigo-700" label="Quedó" value={`$${formatMoney(reportData.totals.net_balance)}`} compact />
          </div>

          <section className={SECTION('sky')}>
            <div className={SECTION_HEAD('sky')}>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2.5">
                <HeadIcon t="sky">
                  <FileText className="w-5 h-5 shrink-0" />
                </HeadIcon>
                {reportData.movements.length} movimiento{reportData.movements.length === 1 ? '' : 's'}
              </h2>
            </div>
            {reportData.movements.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  No hay movimientos en este periodo.
                </p>
              </div>
            ) : (
              <MovementList
                movements={reportData.movements}
                canVoid={canVoid}
                onReceipt={openReceipt}
                onVoid={askVoid}
              />
            )}
          </section>

          {/* Cierres de turno */}
          <Panel accent="indigo" title="Turnos y cierres" icon={<Clock className="w-5 h-5 shrink-0" />}>
            {recentRegisters.length === 0 ? (
              <EmptyText>Aún no se han abierto cajas.</EmptyText>
            ) : (
              <ul className="list-scroll space-y-2.5 pr-0.5">
                {recentRegisters.map((r) => {
                  const isOpen = r.status === 'ABIERTA';
                  const cardTone: Tone = isOpen
                    ? 'emerald'
                    : r.difference === 0
                    ? 'slate'
                    : r.difference > 0
                    ? 'sky'
                    : 'rose';
                  return (
                    <SummaryRow
                      key={r.id}
                      cardTone={cardTone}
                      title={`${pointLabel(r.operation_point)} · turno ${r.shift.toLowerCase()}`}
                      subtitle={`${r.operator_name || 'Administrador'} · ${dateTime(r.opening_time)}${
                        r.closing_time ? ` → ${hourOf(r.closing_time)}` : ''
                      }`}
                      right={
                        isOpen ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-emerald-700">
                            Abierta
                          </span>
                        ) : (
                          <>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              ${formatMoney(r.closing_balance)}
                            </p>
                            <p className={`text-xs font-black ${diffClass(r.difference)}`}>
                              {r.difference === 0
                                ? '✓ Cuadró'
                                : r.difference > 0
                                ? `Sobró $${formatMoney(r.difference)}`
                                : `Faltó $${formatMoney(Math.abs(r.difference))}`}
                            </p>
                          </>
                        )
                      }
                    />
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Resumen detallado (opcional) */}
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
            className="w-full h-12 rounded-2xl border-2 border-indigo-500 bg-white/95 dark:bg-slate-900 text-sm font-bold text-indigo-800 dark:text-indigo-200 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <BarChart3 className="w-5 h-5" />
            {showDetail ? 'Ocultar resumen detallado' : 'Ver resumen detallado'}
            <ChevronDown className={`w-4 h-4 transition-transform ${showDetail ? 'rotate-180' : ''}`} />
          </button>

          {showDetail && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              <Panel accent="indigo" title="Por forma de pago" icon={<BarChart3 className="w-5 h-5 shrink-0" />}>
                {reportData.report_by_method.length === 0 ? (
                  <EmptyText>Sin movimientos en este periodo.</EmptyText>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {reportData.report_by_method.map((pm: any) => (
                      <FlowCard
                        key={pm.payment_method}
                        title={paymentLabel(pm.payment_method)}
                        color={METHOD_COLOR[pm.payment_method] || 'bg-slate-700'}
                        income={formatMoney(pm.income)}
                        expense={formatMoney(pm.expense)}
                        net={formatMoney(pm.net)}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel accent="violet" title="Por día" icon={<Calendar className="w-5 h-5 shrink-0" />}>
                {reportData.report_by_date.length === 0 ? (
                  <EmptyText>Sin movimientos registrados.</EmptyText>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-0.5">
                    {reportData.report_by_date.map((d: any) => (
                      <FlowCard
                        key={d.date}
                        title={d.date}
                        color="bg-violet-700"
                        income={formatMoney(d.income)}
                        expense={formatMoney(d.expense)}
                        net={formatMoney(d.net)}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel accent="slate" title="Por cajero" icon={<Users className="w-5 h-5 shrink-0" />}>
                {reportData.report_by_user.length === 0 ? (
                  <EmptyText>Sin movimientos en este periodo.</EmptyText>
                ) : (
                  <ul className="space-y-2.5">
                    {reportData.report_by_user.map((u: any) => (
                      <SummaryRow
                        key={u.user_id}
                        cardTone="indigo"
                        title={u.cashier_name}
                        subtitle={`${u.movements_count} movimiento(s)`}
                        right={
                          <span className="text-base font-black text-emerald-800 dark:text-emerald-300">
                            ${formatMoney(u.net)}
                          </span>
                        }
                      />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel accent="emerald" title="Conteos de dinero" icon={<Calculator className="w-5 h-5 shrink-0" />}>
                {recentAudits.length === 0 ? (
                  <EmptyText>No hay conteos registrados.</EmptyText>
                ) : (
                  <ul className="space-y-2.5">
                    {recentAudits.map((a) => (
                      <SummaryRow
                        key={a.id}
                        cardTone={a.total_difference === 0 ? 'emerald' : 'amber'}
                        title={a.register_name}
                        subtitle={`${dateTime(a.created_at)} · ${a.auditor_name}`}
                        right={
                          <span className={`text-sm font-black ${diffClass(a.total_difference)}`}>
                            {a.total_difference === 0 ? '✓ Cuadra' : `$${formatMoney(a.total_difference)}`}
                          </span>
                        }
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          VENTANA: ABRIR CAJA (otro valor u opciones)
      ===================================================================== */}
      {showOpenModal && (
        <Modal
          color="bg-emerald-700"
          icon={<Unlock className="w-6 h-6" />}
          title="Abrir caja"
          subtitle="Escribe con cuánto efectivo empiezas"
          onClose={() => setShowOpenModal(false)}
          onSubmit={(e) => {
            e.preventDefault();
            openRegister();
          }}
          footer={
            <>
              <SecondaryBtn onClick={() => setShowOpenModal(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-emerald-600 hover:bg-emerald-700">Abrir caja</PrimaryBtn>
            </>
          }
        >
          <Field label="Efectivo al empezar">
            <MoneyInput
              value={openForm.opening_balance}
              onChange={(v) => setOpenForm((prev) => ({ ...prev, opening_balance: v }))}
              required
              big
            />
          </Field>
          <Field label="Turno">
            <Segmented
              value={openForm.shift}
              onChange={(v) => setOpenForm((prev) => ({ ...prev, shift: v }))}
              options={[
                { id: 'MAÑANA', label: '☀️ Mañana', color: 'bg-emerald-600' },
                { id: 'TARDE', label: '🌤️ Tarde', color: 'bg-emerald-600' },
                { id: 'NOCHE', label: '🌙 Noche', color: 'bg-emerald-600' }
              ]}
            />
          </Field>
          <Field label="Lugar">
            <select
              value={openForm.operation_point}
              onChange={(e) => setOpenForm((prev) => ({ ...prev, operation_point: e.target.value }))}
              className={INPUT}
            >
              <option value="RECEPCION">Recepción</option>
              <option value="RESTAURANTE">Restaurante / Cafetería</option>
              <option value="CAJA_GENERAL">Caja general</option>
            </select>
          </Field>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: CONTAR DINERO / CERRAR TURNO (misma ventana, dos usos)
      ===================================================================== */}
      {countModal && (
        <Modal
          color={countModal.mode === 'CLOSE' ? 'bg-rose-700' : 'bg-indigo-700'}
          icon={countModal.mode === 'CLOSE' ? <Lock className="w-6 h-6" /> : <Calculator className="w-6 h-6" />}
          title={countModal.mode === 'CLOSE' ? 'Cerrar turno' : 'Contar dinero'}
          subtitle={
            countModal.mode === 'CLOSE'
              ? 'Cuenta los billetes y monedas que entregas'
              : 'Revisa que la caja cuadre. El turno sigue abierto.'
          }
          onClose={() => setCountModal(null)}
          onSubmit={handleCount}
          footer={
            <>
              <SecondaryBtn onClick={() => setCountModal(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn
                color={countModal.mode === 'CLOSE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}
              >
                {countModal.mode === 'CLOSE' ? 'Cerrar turno' : 'Guardar conteo'}
              </PrimaryBtn>
            </>
          }
        >
          <CountForm
            reg={countModal.reg}
            form={countForm}
            onChange={(k, v) => setCountForm((prev) => ({ ...prev, [k]: v }))}
          />
          <Field label="Nota (opcional)">
            <input
              type="text"
              value={countForm.notes}
              onChange={(e) => setCountForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder={countModal.mode === 'CLOSE' ? 'Ej: Entrego al turno de la tarde' : 'Ej: Todo completo'}
              className={INPUT}
            />
          </Field>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: ANULAR MOVIMIENTO
      ===================================================================== */}
      {voidModalMov && (
        <Modal
          color="bg-rose-700"
          icon={<Ban className="w-6 h-6" />}
          title="Anular movimiento"
          subtitle={`Recibo ${voidModalMov.receipt_number}`}
          onClose={() => setVoidModalMov(null)}
          onSubmit={handleVoidMovement}
          footer={
            <>
              <SecondaryBtn onClick={() => setVoidModalMov(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-rose-600 hover:bg-rose-700">Anular</PrimaryBtn>
            </>
          }
        >
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-300 dark:border-rose-500 text-sm text-rose-900 dark:text-rose-100 space-y-1">
            <p className="font-bold">
              {voidModalMov.description} · ${formatMoney(voidModalMov.amount)}
            </p>
            <p>El sistema hará el ajuste contrario automáticamente para que la caja siga cuadrando.</p>
          </div>
          <Field label="¿Por qué se anula? *">
            <input
              type="text"
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Ej: Me equivoqué en el monto, cobro repetido…"
              className={INPUT}
            />
          </Field>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: RECIBO
      ===================================================================== */}
      {receiptModalData && (
        <Modal
          color="bg-slate-800"
          icon={<Printer className="w-6 h-6" />}
          title={`Recibo ${receiptModalData.receipt?.receipt_number || ''}`}
          subtitle={receiptModalData.hotel?.name}
          onClose={() => setReceiptModalData(null)}
          footer={
            <>
              <SecondaryBtn onClick={() => setReceiptModalData(null)}>Cerrar</SecondaryBtn>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-5 h-5" />
                Imprimir
              </button>
            </>
          }
        >
          <div className="text-center space-y-0.5 pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
            <p className="text-base font-black text-slate-900 dark:text-white">{receiptModalData.hotel?.name}</p>
            <p className="text-xs text-slate-500">
              NIT: {receiptModalData.hotel?.tax_id || 'N/A'} · {receiptModalData.hotel?.city}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Fecha" value={receiptModalData.receipt?.date} />
            <Row
              label="Turno"
              value={`${receiptModalData.receipt?.register_name || ''} (${receiptModalData.receipt?.shift || ''})`}
            />
            <Row label="Cajero" value={receiptModalData.receipt?.cashier_name} />
            <Row label="Operación" value={subtypeLabel(receiptModalData.receipt?.movement_subtype)} />
            <Row label="Forma de pago" value={paymentLabel(receiptModalData.receipt?.payment_method)} />
            <div className="pt-2 border-t border-slate-300 dark:border-slate-700">
              <span className="text-slate-500 block text-xs">Concepto</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {receiptModalData.receipt?.description}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-800 text-white px-4 py-3">
            <span className="text-sm font-bold">Valor total</span>
            <span className="text-xl font-black">${formatMoney(receiptModalData.receipt?.amount)}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   COMPONENTES DE PRESENTACIÓN
========================================================================= */

function BigFigure({
  cardTone,
  icon,
  label,
  value,
  hint
}: {
  cardTone: Tone;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className={`rounded-2xl px-4 py-3.5 space-y-0.5 bg-white/95 dark:bg-slate-900 border-2 ${FIGURE_BORDER[cardTone]}`}>
      <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{hint}</p>
    </div>
  );
}

const FIGURE_BORDER: Record<Tone, string> = {
  slate: 'border-slate-400 dark:border-slate-500',
  emerald: 'border-emerald-500 dark:border-emerald-500',
  rose: 'border-rose-500 dark:border-rose-500',
  amber: 'border-amber-500 dark:border-amber-500',
  sky: 'border-sky-500 dark:border-sky-500',
  indigo: 'border-indigo-500 dark:border-indigo-500',
  violet: 'border-violet-500 dark:border-violet-500',
  teal: 'border-teal-500 dark:border-teal-500'
};

function DirectionButton({
  active,
  onClick,
  color,
  icon,
  label,
  hint
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[72px] px-3 rounded-2xl border-2 flex items-center justify-center gap-2.5 cursor-pointer ${
        active
          ? `${color} text-white`
          : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600 dark:hover:border-slate-300'
      }`}
    >
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-base font-black">{label}</span>
        <span className={`block text-xs font-semibold ${active ? 'text-white/85' : 'text-slate-500'}`}>{hint}</span>
      </span>
    </button>
  );
}

/**
 * Lista de movimientos: cada movimiento es una card con su color
 * (verde = entró, rojo = salió, gris = anulado, ámbar = ajuste) y botones
 * con texto siempre visibles.
 */
function MovementList({
  movements,
  canVoid,
  onReceipt,
  onVoid,
  compact = false
}: {
  movements: CashMovementItem[];
  canVoid: boolean;
  onReceipt: (id: number) => void;
  onVoid: (m: CashMovementItem) => void;
  compact?: boolean;
}) {
  return (
    <ul className="list-scroll p-3 sm:p-4 space-y-2.5">
      {movements.map((m) => {
        const inc = isIncome(m);
        const isVoided = Number(m.voided) === 1;
        const isComp = Number(m.is_compensating) === 1;
        const muted = isVoided || isComp;
        const cardTone = isVoided ? 'slate' : isComp ? 'amber' : inc ? 'emerald' : 'rose';
        const iconBg = isVoided ? 'bg-slate-600' : isComp ? 'bg-amber-700' : inc ? 'bg-emerald-700' : 'bg-rose-700';
        return (
          <li key={m.id} className={`rounded-2xl p-3 space-y-2.5 ${flat(cardTone)}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${iconBg}`}>
                {isVoided ? (
                  <Ban className="w-5 h-5" />
                ) : inc ? (
                  <ArrowUpRight className="w-5 h-5" />
                ) : (
                  <ArrowDownRight className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">{m.description}</p>
                <p className="text-xs font-semibold leading-snug text-slate-600 dark:text-slate-300">
                  {paymentLabel(m.payment_method)}
                  {compact ? ` · ${hourOf(m.date) || m.date}` : ` · ${m.date}${m.cashier_name ? ` · ${m.cashier_name}` : ''}`}
                </p>
              </div>
              <span
                className={`text-base font-black shrink-0 ${
                  isVoided
                    ? 'line-through text-slate-500 dark:text-slate-400'
                    : inc
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                {inc ? '+' : '−'}${formatMoney(m.amount)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {muted ? (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white max-w-full ${
                    isVoided ? 'bg-slate-600' : 'bg-amber-700'
                  }`}
                >
                  <span className="line-clamp-2 break-words">
                    {isVoided ? `Anulado: ${m.void_reason || 'sin motivo'}` : 'Ajuste por anulación'}
                  </span>
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                  {m.receipt_number}
                </span>
              )}
              <div className="flex gap-2 shrink-0 ml-auto">
                <ActionBtn onClick={() => onReceipt(m.id)} icon={<Printer className="w-4 h-4" />}>
                  Recibo
                </ActionBtn>
                {!muted && canVoid && (
                  <ActionBtn danger onClick={() => onVoid(m)} icon={<Ban className="w-4 h-4" />}>
                    Anular
                  </ActionBtn>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Botón pequeño con icono + texto y contorno marcado (visible en claro y oscuro). */
function ActionBtn({
  onClick,
  icon,
  danger = false,
  children
}: {
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3 rounded-lg border-2 text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer ${
        danger
          ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
          : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600 dark:hover:border-slate-300'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Card de una fila de resumen (turnos, cajeros, conteos). */
function SummaryRow({
  cardTone,
  title,
  subtitle,
  right
}: {
  cardTone: Tone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <li className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${flat(cardTone)}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-slate-900 dark:text-white line-clamp-2 break-words">{title}</p>
        {subtitle && <p className="text-xs font-semibold leading-snug text-slate-600 dark:text-slate-300">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">{right}</div>
    </li>
  );
}

/** Conteo de dinero con resultado en vivo (sirve para "Contar" y para "Cerrar turno"). */
function CountForm({
  reg,
  form,
  onChange
}: {
  reg: CashRegisterItem;
  form: { counted_cash: string; counted_transfer: string; counted_card: string };
  onChange: (key: 'counted_cash' | 'counted_transfer' | 'counted_card', v: string) => void;
}) {
  const [showDigital, setShowDigital] = useState(false);
  const expCash = Number(reg.summary.expected_cash || 0);
  const expTr = Number(reg.summary.expected_transfer || 0);
  const expCard = Number(reg.summary.expected_card || 0);
  const expTotal = expCash + expTr + expCard;
  const cTotal = onlyDigits(form.counted_cash) + onlyDigits(form.counted_transfer) + onlyDigits(form.counted_card);
  const diff = cTotal - expTotal;
  const cashTyped = form.counted_cash !== '';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">💵 ¿Cuánto efectivo hay?</span>
          <button
            type="button"
            onClick={() => onChange('counted_cash', String(expCash))}
            className="text-xs font-bold text-indigo-700 dark:text-indigo-300 underline underline-offset-2 cursor-pointer"
          >
            Debería haber ${money(expCash)}
          </button>
        </div>
        <MoneyInput value={form.counted_cash} onChange={(v) => onChange('counted_cash', v)} required big />
      </div>

      {(expTr > 0 || expCard > 0) && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDigital((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <span>
              📱 Nequi / transf. ${money(onlyDigits(form.counted_transfer))} · 💳 Tarjeta $
              {money(onlyDigits(form.counted_card))}
            </span>
            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
              {showDigital ? 'Listo' : 'Corregir'}
            </span>
          </button>
          {showDigital && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Nequi / Transf. (sistema $${money(expTr)})`}>
                <MoneyInput value={form.counted_transfer} onChange={(v) => onChange('counted_transfer', v)} />
              </Field>
              <Field label={`Tarjeta (sistema $${money(expCard)})`}>
                <MoneyInput value={form.counted_card} onChange={(v) => onChange('counted_card', v)} />
              </Field>
            </div>
          )}
        </div>
      )}

      {cashTyped && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-3 text-white ${
            diff === 0 ? 'bg-emerald-700' : diff > 0 ? 'bg-sky-700' : 'bg-rose-700'
          }`}
        >
          {diff === 0 ? <CheckCircle2 className="w-7 h-7 shrink-0" /> : <AlertTriangle className="w-7 h-7 shrink-0" />}
          <div className="min-w-0">
            <p className="text-lg font-black leading-tight">
              {diff === 0
                ? 'La caja cuadra'
                : diff > 0
                ? `Sobran $${formatMoney(diff)}`
                : `Faltan $${formatMoney(Math.abs(diff))}`}
            </p>
            <p className="text-xs font-semibold text-white/85">
              Debería haber ${formatMoney(expTotal)} · Contaste ${formatMoney(cTotal)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowCard({
  title,
  color,
  income,
  expense,
  net
}: {
  title: string;
  color: string;
  income: string;
  expense: string;
  net: string;
}) {
  return (
    <div className={SECTION(toneFromBg(color))}>
      <div className={`px-4 py-2.5 ${color} text-white text-sm font-black truncate flex items-center gap-2`}>
        {title}
      </div>
      <div className="p-4 space-y-1.5 text-sm">
        <Row label="Entró" value={`+$${income}`} valueClass="text-emerald-700 dark:text-emerald-400" />
        <Row label="Salió" value={`−$${expense}`} valueClass="text-rose-700 dark:text-rose-400" />
        <div className="pt-1.5 border-t border-slate-300 dark:border-slate-700">
          <Row label="Quedó" value={`$${net}`} />
        </div>
      </div>
    </div>
  );
}
