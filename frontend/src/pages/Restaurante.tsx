import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Minus,
  BedDouble,
  Receipt,
  CheckCircle2,
  Edit3,
  FileText,
  ShoppingBag,
  Ban,
  Wallet,
  Trash2,
  Package,
  Clock
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import { getTodayString } from '../utils/date';
import {
  INPUT,
  Field,
  MoneyInput,
  Notice,
  SecondaryBtn,
  PrimaryBtn,
  Modal,
  Segmented,
  SearchInput,
  SECTION,
  SECTION_HEAD,
  SOLID,
  StatCard,
  ModuleHeader
} from '../components/ModuleUI';
import type { Tone } from '../components/ModuleUI';

/* =========================================================================
   API Y UTILIDADES
========================================================================= */

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

const onlyDigits = (v: string | number) => Number(String(v).replace(/\D/g, '')) || 0;

/** Fecha en Colombia N días antes de hoy. */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
};

/* =========================================================================
   TIPOS DE SERVICIO
   El usuario solo ve 3 tipos con emoji; el backend recibe su departamento.
========================================================================= */

type GroupId = 'COMIDAS' | 'LAVANDERIA' | 'OTROS';

const GROUPS: Array<{ id: GroupId; apiDept: string; label: string; emoji: string; category: string; card: string }> = [
  {
    id: 'COMIDAS',
    apiDept: 'RESTAURANTE',
    label: 'Comida y bebida',
    emoji: '🍽️',
    category: 'Comidas y Bebidas',
    card: 'border-amber-300 dark:border-amber-500 bg-amber-50 dark:bg-amber-500/15'
  },
  {
    id: 'LAVANDERIA',
    apiDept: 'LAVANDERIA',
    label: 'Lavandería',
    emoji: '👕',
    category: 'Lavandería',
    card: 'border-sky-300 dark:border-sky-500 bg-sky-50 dark:bg-sky-500/15'
  },
  {
    id: 'OTROS',
    apiDept: 'SERVICIOS_ADICIONALES',
    label: 'Otro servicio',
    emoji: '✨',
    category: 'Servicios Adicionales',
    card: 'border-emerald-300 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15'
  }
];

const groupOf = (dept: string) => {
  if (dept === 'LAVANDERIA') return GROUPS[1];
  if (dept === 'SERVICIOS_ADICIONALES') return GROUPS[2];
  return GROUPS[0]; // RESTAURANTE, CAFETERIA, ROOM_SERVICE, MINIBAR
};

const PRESETS: Array<{ name: string; price: number; group: GroupId }> = [
  { name: 'Botella de Agua', price: 3000, group: 'COMIDAS' },
  { name: 'Gaseosa / Jugo', price: 4000, group: 'COMIDAS' },
  { name: 'Café / Tinto', price: 2500, group: 'COMIDAS' },
  { name: 'Desayuno', price: 12000, group: 'COMIDAS' },
  { name: 'Almuerzo', price: 18000, group: 'COMIDAS' },
  { name: 'Lavado de Ropa', price: 10000, group: 'LAVANDERIA' }
];

const QUICK_PRICES = [3000, 5000, 10000, 15000];

/* =========================================================================
   TIPOS DE DATOS
========================================================================= */

interface CatalogItem {
  id: number;
  department: string;
  category: string;
  code: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  unit: string;
  prep_time_minutes: number;
  active: number;
}

interface ActiveStay {
  stay_id: number;
  room_id: number;
  room_number: string;
  floor: string;
  guest_id: number;
  guest_name: string;
  document: string;
  folio_balance: number;
}

interface CashRegister {
  id: number;
  name: string;
  shift: string;
  operation_point: string;
  operator_name: string;
  status: string;
}

interface PaymentMethod {
  id: number;
  name: string;
  code: string;
  type: string;
  requires_reference: number;
}

interface OrderItem {
  id: number;
  catalog_id: number | null;
  department: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes: string;
  status: string;
}

interface ServiceOrder {
  id: number;
  order_number: string;
  department: string;
  order_type: string;
  stay_id: number | null;
  room_id: number | null;
  room_number: string | null;
  customer_name: string;
  status: string;
  payment_mode: string;
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  receipt_number: string | null;
  notes: string;
  void_reason: string | null;
  order_date: string;
  created_at: string;
  items: OrderItem[];
}

interface CartLine {
  key: string;
  catalog_id: number | null;
  department: string;
  item_name: string;
  unit_price: number;
  quantity: number;
}

interface ReportData {
  period: { from_date: string; to_date: string };
  summary: {
    orders_count: number;
    grand_total: number;
    direct_cash_total: number;
    room_charge_total: number;
    voided_total: number;
  };
  orders: ServiceOrder[];
}

type PayMode = 'CAJA_DIRECTA' | 'CARGO_HABITACION';
type Period = 'HOY' | 'SEMANA' | 'MES';

const statusInfo = (o: ServiceOrder) => {
  if (o.status === 'ANULADA') return { label: 'Anulado', cls: 'bg-slate-600' };
  if (o.status === 'PAGADA') return { label: 'Pagado', cls: 'bg-emerald-600' };
  if (o.status === 'CARGADA_HABITACION') return { label: `A hab. ${o.room_number || ''}`.trim(), cls: 'bg-violet-600' };
  return { label: 'Sin cobrar', cls: 'bg-amber-600' };
};

const itemsText = (o: ServiceOrder) =>
  o.items
    .filter((i) => i.status !== 'ANULADO')
    .map((i) => `${i.quantity}× ${i.item_name}`)
    .join(', ');

/* =========================================================================
   PÁGINA
========================================================================= */

export default function Restaurante() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const canOperate = hasPermission('restaurant.operate');
  const canVoid = hasPermission('restaurant.operate') || hasPermission('cash.void');
  const today = getTodayString();
  const base = `/hotels/${activeHotelId}/services`;

  const [activeTab, setActiveTab] = useState<'VENDER' | 'VENTAS' | 'PRODUCTOS'>('VENDER');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Datos
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [openOrders, setOpenOrders] = useState<ServiceOrder[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveStay[]>([]);
  const [openRegisters, setOpenRegisters] = useState<CashRegister[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [soldToday, setSoldToday] = useState(0);

  // Venta actual
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payMode, setPayMode] = useState<PayMode>('CAJA_DIRECTA');
  const [payMethod, setPayMethod] = useState('');
  const [stayId, setStayId] = useState('');

  // Ventanas
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherForm, setOtherForm] = useState({ name: '', price: '', save: true, group: 'COMIDAS' as GroupId });
  const [productModal, setProductModal] = useState<{ item: CatalogItem | null } | null>(null);
  const [productForm, setProductForm] = useState({ name: '', price: '', group: 'COMIDAS' as GroupId });
  const [settleTarget, setSettleTarget] = useState<ServiceOrder | null>(null);
  const [voidTarget, setVoidTarget] = useState<ServiceOrder | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Ventas
  const [period, setPeriod] = useState<Period>('HOY');
  const [report, setReport] = useState<ReportData | null>(null);

  const show = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    if (type === 'success') setTimeout(() => setMsg(null), 5000);
  };

  /* -------------------- Carga -------------------- */

  const fetchOverview = useCallback(async () => {
    if (!activeHotelId) return;
    try {
      const data = await apiRequest('GET', `${base}/overview?date=${today}`);
      setCatalog(data.catalog || []);
      setOpenOrders(data.open_orders || []);
      setActiveStays(data.active_stays || []);
      setOpenRegisters(data.open_registers || []);
      setPaymentMethods(data.payment_methods || []);
      setSoldToday(Number(data.kpis?.sold_today_total || 0));
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHotelId, today]);

  const fetchReport = useCallback(async () => {
    if (!activeHotelId) return;
    const from = period === 'HOY' ? today : period === 'SEMANA' ? daysAgo(6) : `${today.slice(0, 7)}-01`;
    try {
      const q = new URLSearchParams({ from_date: from, to_date: today, department: 'ALL', payment_mode: 'ALL' });
      setReport(await apiRequest('GET', `${base}/reports?${q}`));
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudieron consultar las ventas.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHotelId, period, today]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'VENTAS') fetchReport();
  }, [activeTab, fetchReport]);

  /** Las 3 formas de pago, usando el nombre que tenga el hotel configurado. */
  const payOptions = useMemo(() => {
    const names = paymentMethods.map((m) => m.name);
    const find = (kw: string, fb: string) => names.find((n) => n.toLowerCase().includes(kw)) || fb;
    return [
      { id: find('efectivo', 'Efectivo'), emoji: '💵', label: 'Efectivo' },
      { id: find('nequi', find('transf', 'Transferencia')), emoji: '📱', label: 'Nequi / Transf.' },
      { id: find('tarj', 'Tarjeta'), emoji: '💳', label: 'Tarjeta' }
    ];
  }, [paymentMethods]);

  useEffect(() => {
    if (!payMethod && payOptions[0]) setPayMethod(payOptions[0].id);
  }, [payOptions, payMethod]);

  /* -------------------- Productos visibles -------------------- */

  const activeCatalog = useMemo(() => catalog.filter((c) => Number(c.active) === 1), [catalog]);
  const visibleCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? activeCatalog.filter((c) => c.name.toLowerCase().includes(q)) : activeCatalog;
  }, [activeCatalog, search]);

  /* -------------------- Cuenta -------------------- */

  const cartTotal = cart.reduce((a, l) => a + l.unit_price * l.quantity, 0);
  const cartCount = cart.reduce((a, l) => a + l.quantity, 0);
  const qtyOf = (id: number) => cart.find((l) => l.catalog_id === id)?.quantity || 0;

  const addProduct = (item: CatalogItem) =>
    setCart((prev) => {
      const i = prev.findIndex((l) => l.catalog_id === item.id);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          key: `cat-${item.id}`,
          catalog_id: item.id,
          department: groupOf(item.department).apiDept,
          item_name: item.name,
          unit_price: item.price,
          quantity: 1
        }
      ];
    });

  const changeQty = (key: string, delta: number) =>
    setCart((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    );

  /** Qué le falta al usuario para poder cobrar (se muestra en el botón). */
  const missing =
    cart.length === 0
      ? 'Toca un producto para empezar'
      : payMode === 'CARGO_HABITACION' && !stayId
      ? 'Elige la habitación'
      : '';

  const submitSale = async () => {
    if (missing || busy) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/orders`, {
        department: cart[0].department,
        order_type: payMode === 'CARGO_HABITACION' ? 'ROOM_SERVICE' : 'MOSTRADOR',
        table_id: null,
        stay_id: payMode === 'CARGO_HABITACION' ? Number(stayId) : null,
        customer_name: '',
        discount_amount: 0,
        notes: '',
        settlement_mode: payMode,
        payment_method: payMode === 'CAJA_DIRECTA' ? payMethod : null,
        payment_reference: null,
        register_id: payMode === 'CAJA_DIRECTA' && openRegisters[0] ? openRegisters[0].id : null,
        items: cart.map((l) => ({
          catalog_id: l.catalog_id,
          department: l.department,
          item_name: l.item_name,
          unit_price: l.unit_price,
          quantity: l.quantity,
          notes: ''
        }))
      });
      const stay = activeStays.find((s) => String(s.stay_id) === stayId);
      show(
        'success',
        payMode === 'CARGO_HABITACION'
          ? `✓ ${formatCOP(cartTotal)} cargados a la habitación ${stay?.room_number || ''}.`
          : res.message || `✓ Cobrado ${formatCOP(cartTotal)}.`
      );
      setCart([]);
      setStayId('');
      setPayMode('CAJA_DIRECTA');
      await fetchOverview();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo cobrar.');
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- Producto "Otro" (escrito a mano) -------------------- */

  const saveProduct = async (name: string, price: number, group: GroupId, editing?: CatalogItem | null) => {
    const g = GROUPS.find((x) => x.id === group) || GROUPS[0];
    const body = {
      department: g.apiDept,
      category: g.category,
      code: editing?.code || '',
      name,
      description: editing?.description || '',
      price,
      cost: editing?.cost || 0,
      unit: editing?.unit || 'UND',
      prep_time_minutes: 0
    };
    if (editing) return apiRequest('PUT', `${base}/catalog/${editing.id}`, body);
    return apiRequest('POST', `${base}/catalog`, body);
  };

  const handleOther = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = otherForm.name.trim();
    const price = onlyDigits(otherForm.price);
    if (!name || price <= 0) {
      show('error', 'Escribe qué es y cuánto cuesta.');
      return;
    }
    const g = GROUPS.find((x) => x.id === otherForm.group) || GROUPS[0];
    setBusy(true);
    try {
      if (otherForm.save && !catalog.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
        await saveProduct(name, price, otherForm.group);
        await fetchOverview();
      }
      setCart((prev) => [
        ...prev,
        { key: `custom-${Date.now()}`, catalog_id: null, department: g.apiDept, item_name: name, unit_price: price, quantity: 1 }
      ]);
      setOtherOpen(false);
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo agregar.');
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- Mis productos -------------------- */

  const openProductModal = (item: CatalogItem | null) => {
    setProductForm(
      item
        ? { name: item.name, price: String(item.price), group: groupOf(item.department).id }
        : { name: '', price: '', group: 'COMIDAS' }
    );
    setProductModal({ item });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = productForm.name.trim();
    const price = onlyDigits(productForm.price);
    if (!name || price <= 0) {
      show('error', 'Escribe el nombre y el precio.');
      return;
    }
    setBusy(true);
    try {
      await saveProduct(name, price, productForm.group, productModal?.item);
      show('success', productModal?.item ? 'Producto actualizado.' : `"${name}" agregado.`);
      setProductModal(null);
      await fetchOverview();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const addPreset = async (p: (typeof PRESETS)[number]) => {
    setBusy(true);
    try {
      await saveProduct(p.name, p.price, p.group);
      show('success', `"${p.name}" agregado por ${formatCOP(p.price)}.`);
      await fetchOverview();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo crear.');
    } finally {
      setBusy(false);
    }
  };

  const toggleProduct = async (id: number) => {
    try {
      await apiRequest('PATCH', `${base}/catalog/${id}/toggle`);
      await fetchOverview();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo cambiar.');
    }
  };

  /* -------------------- Cobrar pendiente / Anular -------------------- */

  const [settle, setSettle] = useState<{ mode: PayMode; method: string; stayId: string }>({
    mode: 'CAJA_DIRECTA',
    method: '',
    stayId: ''
  });

  const openSettle = (o: ServiceOrder) => {
    setSettleTarget(o);
    setSettle({
      mode: o.stay_id ? 'CARGO_HABITACION' : 'CAJA_DIRECTA',
      method: payOptions[0]?.id || 'Efectivo',
      stayId: o.stay_id ? String(o.stay_id) : ''
    });
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    if (settle.mode === 'CARGO_HABITACION' && !settle.stayId) {
      show('error', 'Elige la habitación.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/orders/${settleTarget.id}/settle`, {
        settlement_mode: settle.mode,
        payment_method: settle.mode === 'CAJA_DIRECTA' ? settle.method : null,
        payment_reference: null,
        register_id: settle.mode === 'CAJA_DIRECTA' && openRegisters[0] ? openRegisters[0].id : null,
        stay_id: settle.mode === 'CARGO_HABITACION' ? Number(settle.stayId) : null
      });
      show('success', res.message || 'Cobrado.');
      setSettleTarget(null);
      await fetchOverview();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo cobrar.');
    } finally {
      setBusy(false);
    }
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    if (!voidReason.trim()) {
      show('error', 'Escribe por qué se anula.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest('POST', `${base}/orders/${voidTarget.id}/void`, { void_reason: voidReason.trim() });
      show('success', res.message || 'Venta anulada.');
      setVoidTarget(null);
      setVoidReason('');
      await fetchOverview();
      if (activeTab === 'VENTAS') await fetchReport();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo anular.');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = () => {
    if (!report) return;
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(`${activeHotel?.name || 'Hotel'} — Ventas de servicios`, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Del ${report.period.from_date} al ${report.period.to_date} | Total: ${formatCOP(
        report.summary.grand_total
      )} | Pagado: ${formatCOP(report.summary.direct_cash_total)} | A habitación: ${formatCOP(
        report.summary.room_charge_total
      )}`,
      14,
      23
    );
    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Qué se vendió', 'Habitación / Cliente', 'Estado', 'Total']],
      body: report.orders.map((o) => [
        o.order_date,
        itemsText(o),
        o.room_number ? `Hab. ${o.room_number}` : o.customer_name || 'Mostrador',
        statusInfo(o).label,
        formatCOP(o.total_amount)
      ])
    });
    doc.save(`ventas-servicios-${report.period.from_date}-a-${report.period.to_date}.pdf`);
  };

  /* =======================================================================
     RENDER
  ======================================================================= */

  return (
    <div className="space-y-4 sm:space-y-5">
      <ModuleHeader
        icon={<UtensilsCrossed className="w-5 h-5" />}
        iconColor="bg-amber-600"
        title={
          <>
            Servicios
            <span className="font-semibold text-slate-500 dark:text-slate-400"> · {activeHotel?.name || 'Hotel'}</span>
          </>
        }
        subtitle={`Hoy se ha vendido ${formatCOP(soldToday)}`}
        tabs={[
          { id: 'VENDER', label: 'Vender', short: 'Vender', icon: <ShoppingBag className="w-5 h-5 shrink-0" /> },
          { id: 'VENTAS', label: 'Ventas', short: 'Ventas', icon: <FileText className="w-5 h-5 shrink-0" /> },
          {
            id: 'PRODUCTOS',
            label: 'Mis productos',
            short: 'Productos',
            icon: <Package className="w-5 h-5 shrink-0" />,
            badge: activeCatalog.length
          }
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {msg && (
        <Notice tone={msg.type} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {/* Consumos que quedaron sin cobrar (solo aparece si existe alguno) */}
      {openOrders.length > 0 && (
        <section className="rounded-2xl p-4 border-2 border-amber-500 dark:border-amber-500 bg-amber-100 dark:bg-amber-500/15 space-y-3">
          <p className="text-base font-black text-amber-900 dark:text-amber-100 flex items-center gap-2">
            <Clock className="w-5 h-5 shrink-0" />
            Hay {openOrders.length} consumo{openOrders.length === 1 ? '' : 's'} sin cobrar
          </p>
          <div className="list-scroll grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {openOrders.map((o) => (
              <div
                key={o.id}
                className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{formatCOP(o.total_amount)}</p>
                  <p className="text-xs text-slate-500 truncate">{itemsText(o)}</p>
                </div>
                {canOperate && (
                  <button
                    type="button"
                    onClick={() => openSettle(o)}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black cursor-pointer"
                  >
                    Cobrar
                  </button>
                )}
                {canVoid && (
                  <button
                    type="button"
                    title="Anular"
                    aria-label="Anular"
                    onClick={() => {
                      setVoidTarget(o);
                      setVoidReason('');
                    }}
                    className="w-10 h-10 rounded-xl border border-rose-300 text-rose-700 dark:text-rose-300 flex items-center justify-center cursor-pointer"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =====================================================================
          PESTAÑA 1: VENDER
      ===================================================================== */}
      {activeTab === 'VENDER' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* ---------- Paso 1: qué pidió ---------- */}
          <section className={`xl:col-span-7 ${SECTION('amber')}`}>
            <div className={SECTION_HEAD('amber')}>
              <Step n={1} t="amber" title="¿Qué pidió?" hint="Toca el producto. Si pidió 2, tócalo 2 veces." />
            </div>
            <div className="p-4 sm:p-5 space-y-4">

              {activeCatalog.length > 8 && (
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar producto…" />
              )}

              {loading ? (
                <p className="py-10 text-center text-sm font-semibold text-slate-500">Cargando productos…</p>
              ) : activeCatalog.length === 0 ? (
                <div className="p-6 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-500 text-center space-y-3">
                  <p className="text-base font-black text-slate-800 dark:text-slate-100">Aún no tienes productos</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Agrégalos una sola vez y después solo los tocas para vender.
                  </p>
                  {canOperate && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('PRODUCTOS')}
                      className="h-12 px-5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black cursor-pointer"
                    >
                      Agregar mis productos
                    </button>
                  )}
                </div>
              ) : (
                <div className="list-scroll grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {visibleCatalog.map((item) => {
                    const g = groupOf(item.department);
                    const qty = qtyOf(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!canOperate}
                        onClick={() => addProduct(item)}
                        className={`relative min-h-[96px] p-3 rounded-2xl border-2 text-left flex flex-col justify-between gap-2 cursor-pointer active:scale-[0.97] transition-transform disabled:opacity-60 ${
                          qty > 0 ? 'border-emerald-500 ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-500/15' : g.card
                        }`}
                      >
                        {qty > 0 && (
                          <span className="absolute -top-2 -right-2 min-w-8 h-8 px-2 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center">
                            {qty}
                          </span>
                        )}
                        <span className="text-sm font-black text-slate-900 dark:text-white leading-tight line-clamp-3 break-words">
                          <span aria-hidden>{g.emoji} </span>
                          {item.name}
                        </span>
                        <span className="text-base font-black text-slate-900 dark:text-white whitespace-nowrap">{formatCOP(item.price)}</span>
                      </button>
                    );
                  })}
                  {canOperate && (
                    <button
                      type="button"
                      onClick={() => {
                        setOtherForm({ name: '', price: '', save: true, group: 'COMIDAS' });
                        setOtherOpen(true);
                      }}
                      className="min-h-[96px] p-3 rounded-2xl border-2 border-dashed border-slate-400 dark:border-slate-600 text-slate-700 dark:text-slate-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-6 h-6" />
                      <span className="text-sm font-black">Otra cosa</span>
                      <span className="text-xs font-medium text-slate-500">No está en la lista</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Celular: barra fija para ir a la cuenta sin tener que bajar por todos los productos */}
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => document.getElementById('cuenta')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="xl:hidden sticky bottom-3 z-20 w-full min-h-14 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="min-w-8 h-8 px-2 rounded-full bg-white/20 text-sm font-black flex items-center justify-center shrink-0">
                  {cartCount}
                </span>
                <span className="text-base font-black truncate">Ver cuenta y cobrar</span>
              </span>
              <span className="text-lg font-black whitespace-nowrap">{formatCOP(cartTotal)}</span>
            </button>
          )}

          {/* ---------- Pasos 2 y 3: cuenta y cobro ---------- */}
          <section id="cuenta" className={`xl:col-span-5 p-4 sm:p-5 space-y-5 xl:sticky xl:top-24 scroll-mt-28 ${SECTION('emerald')}`}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-600 shrink-0" />
                  La cuenta {cartCount > 0 && `(${cartCount})`}
                </h2>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="h-9 px-3 rounded-lg text-rose-700 dark:text-rose-300 text-sm font-bold inline-flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Borrar todo
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <p className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center text-sm font-semibold text-slate-500">
                  Todavía no has tocado ningún producto.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 max-h-64 overflow-y-auto">
                  {cart.map((l) => (
                    <li key={l.key} className="p-2.5 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{l.item_name}</p>
                        <p className="text-xs text-slate-500">{formatCOP(l.unit_price)} c/u</p>
                      </div>
                      <QtyBtn label="Quitar uno" onClick={() => changeQty(l.key, -1)}>
                        <Minus className="w-4 h-4" />
                      </QtyBtn>
                      <span className="w-6 text-center text-base font-black">{l.quantity}</span>
                      <QtyBtn label="Agregar uno" onClick={() => changeQty(l.key, 1)}>
                        <Plus className="w-4 h-4" />
                      </QtyBtn>
                      <span className="w-20 text-right text-sm font-black text-slate-900 dark:text-white shrink-0">
                        {formatCOP(l.unit_price * l.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="px-4 py-3 rounded-2xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-between">
                <span className="text-sm font-black text-amber-900 dark:text-amber-100">TOTAL</span>
                <span className="text-2xl font-black text-amber-900 dark:text-amber-100">{formatCOP(cartTotal)}</span>
              </div>
            </div>

            {cart.length > 0 && canOperate && (
              <>
                <div className="space-y-3">
                  <Step n={2} t="emerald" title="¿Cómo paga?" />
                  <div className="grid grid-cols-2 gap-2">
                    <BigChoice
                      selected={payMode === 'CAJA_DIRECTA'}
                      onClick={() => setPayMode('CAJA_DIRECTA')}
                      color="bg-emerald-600 border-emerald-600"
                      icon={<Wallet className="w-6 h-6" />}
                      title="Paga ahora"
                      hint="Efectivo, Nequi o tarjeta"
                    />
                    <BigChoice
                      selected={payMode === 'CARGO_HABITACION'}
                      onClick={() => setPayMode('CARGO_HABITACION')}
                      disabled={activeStays.length === 0}
                      color="bg-violet-600 border-violet-600"
                      icon={<BedDouble className="w-6 h-6" />}
                      title="A la habitación"
                      hint={activeStays.length === 0 ? 'No hay huéspedes' : 'Paga al salir'}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {payMode === 'CAJA_DIRECTA' ? (
                    <>
                      <Step n={3} t="emerald" title="¿Con qué paga?" />
                      <div className="grid grid-cols-3 gap-2">
                        {payOptions.map((p) => {
                          const on = payMethod === p.id;
                          return (
                            <button
                              key={p.label}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setPayMethod(p.id)}
                              className={`min-h-14 px-1 rounded-xl border-2 text-sm font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                on
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white/95 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <span className="text-xl leading-none" aria-hidden>
                                {p.emoji}
                              </span>
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <Step n={3} t="violet" title="¿Qué habitación?" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                        {activeStays.map((s) => {
                          const on = stayId === String(s.stay_id);
                          return (
                            <button
                              key={s.stay_id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setStayId(String(s.stay_id))}
                              className={`min-h-16 px-2 py-2 rounded-xl border-2 text-left cursor-pointer ${
                                on
                                  ? 'bg-violet-600 border-violet-600 text-white'
                                  : 'bg-white/95 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <span className="block text-base font-black leading-tight">Hab. {s.room_number}</span>
                              <span className={`block text-xs font-semibold truncate ${on ? 'text-white/85' : 'text-slate-500'}`}>
                                {s.guest_name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {canOperate && (
              <button
                type="button"
                disabled={!!missing || busy}
                onClick={submitSale}
                className={`w-full min-h-16 px-4 rounded-2xl text-white text-lg font-black flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${
                  missing
                    ? 'bg-slate-400 dark:bg-slate-700'
                    : payMode === 'CAJA_DIRECTA'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {busy ? (
                  'Guardando…'
                ) : missing ? (
                  missing
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6 shrink-0" />
                    {payMode === 'CAJA_DIRECTA'
                      ? `Cobrar ${formatCOP(cartTotal)}`
                      : `Cargar ${formatCOP(cartTotal)} a la hab. ${
                          activeStays.find((s) => String(s.stay_id) === stayId)?.room_number || ''
                        }`}
                  </>
                )}
              </button>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: VENTAS
      ===================================================================== */}
      {activeTab === 'VENTAS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Segmented<Period>
              value={period}
              onChange={setPeriod}
              className="flex-1"
              options={[
                { id: 'HOY', label: 'Hoy' },
                { id: 'SEMANA', label: '7 días' },
                { id: 'MES', label: 'Este mes' }
              ]}
            />
            <button
              type="button"
              onClick={exportPdf}
              disabled={!report || report.orders.length === 0}
              className="h-12 px-4 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Descargar PDF
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard variant="flat" color="bg-amber-600" label="Vendido" value={formatCOP(report?.summary.grand_total || 0)} compact />
            <StatCard variant="flat" color="bg-emerald-700" label="Ya pagado" value={formatCOP(report?.summary.direct_cash_total || 0)} compact />
            <StatCard variant="flat" color="bg-violet-700" label="A habitación" value={formatCOP(report?.summary.room_charge_total || 0)} compact />
          </div>

          <section className={SECTION('amber')}>
            {!report ? (
              <p className="p-10 text-center text-sm font-semibold text-slate-500">Cargando ventas…</p>
            ) : report.orders.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-500">No hay ventas en este periodo.</p>
              </div>
            ) : (
              <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                {report.orders.map((o) => {
                  const st = statusInfo(o);
                  const isVoid = o.status === 'ANULADA';
                  return (
                    <li key={o.id} className={`px-4 sm:px-5 py-3 flex items-center gap-3 ${isVoid ? 'opacity-60' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{itemsText(o) || o.order_number}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {o.order_date}
                          {o.payment_method && !o.room_number ? ` · ${o.payment_method}` : ''}
                          {isVoid && o.void_reason ? ` · ${o.void_reason}` : ''}
                        </p>
                      </div>
                      <span className={`hidden sm:inline px-2.5 py-1 rounded-full text-xs font-bold text-white shrink-0 ${st.cls}`}>
                        {st.label}
                      </span>
                      <span className={`text-base font-black shrink-0 ${isVoid ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {formatCOP(o.total_amount)}
                      </span>
                      {!isVoid && canVoid && (
                        <button
                          type="button"
                          title="Anular"
                          aria-label="Anular"
                          onClick={() => {
                            setVoidTarget(o);
                            setVoidReason('');
                          }}
                          className="w-9 h-9 rounded-lg border border-rose-300 dark:border-rose-500 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: MIS PRODUCTOS
      ===================================================================== */}
      {activeTab === 'PRODUCTOS' && (
        <div className="space-y-4">
          {canOperate && (
            <button
              type="button"
              onClick={() => openProductModal(null)}
              className="w-full h-14 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-base font-black inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Agregar producto
            </button>
          )}

          {canOperate && PRESETS.some((p) => !catalog.some((c) => c.name.trim().toLowerCase() === p.name.toLowerCase())) && (
            <section className="rounded-2xl p-4 border-2 border-amber-500 dark:border-amber-500 bg-amber-100 dark:bg-amber-500/15 space-y-2">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Agregar con un toque:</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.filter((p) => !catalog.some((c) => c.name.trim().toLowerCase() === p.name.toLowerCase())).map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    disabled={busy}
                    onClick={() => addPreset(p)}
                    className="h-10 px-4 rounded-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500 text-sm font-bold text-amber-950 dark:text-amber-100 cursor-pointer disabled:opacity-60"
                  >
                    + {p.name} · {formatCOP(p.price)}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={SECTION('violet')}>
            {catalog.length === 0 ? (
              <p className="p-10 text-center text-sm font-semibold text-slate-500">Aún no tienes productos.</p>
            ) : (
              <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                {catalog.map((c) => {
                  const g = groupOf(c.department);
                  const on = Number(c.active) === 1;
                  return (
                    <li
                      key={c.id}
                      className={`px-4 sm:px-5 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 ${on ? '' : 'opacity-55'}`}
                    >
                      <span className="text-2xl shrink-0" aria-hidden>
                        {g.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug text-slate-900 dark:text-white line-clamp-2 break-words">{c.name}</p>
                        <p className="text-xs leading-snug text-slate-500">{on ? g.label : 'Oculto: no aparece al vender'}</p>
                      </div>
                      <span className="text-base font-black text-slate-900 dark:text-white shrink-0 whitespace-nowrap">
                        {formatCOP(c.price)}
                      </span>
                      {canOperate && (
                        <div className="flex gap-2 w-full sm:w-auto shrink-0 pl-11 sm:pl-0">
                          <button
                            type="button"
                            onClick={() => openProductModal(c)}
                            className="flex-1 sm:flex-none h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                            Cambiar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleProduct(c.id)}
                            className="flex-1 sm:flex-none h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer"
                          >
                            {on ? 'Ocultar' : 'Mostrar'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          VENTANA: OTRA COSA (no está en la lista)
      ===================================================================== */}
      {otherOpen && (
        <Modal
          color="bg-amber-600"
          icon={<Plus className="w-6 h-6" />}
          title="Otra cosa"
          subtitle="Algo que no está en tu lista"
          onClose={() => setOtherOpen(false)}
          onSubmit={handleOther}
          footer={
            <>
              <SecondaryBtn onClick={() => setOtherOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-amber-600 hover:bg-amber-700">Agregar a la cuenta</PrimaryBtn>
            </>
          }
        >
          <Field label="¿Qué es?">
            <input
              required
              autoFocus
              value={otherForm.name}
              onChange={(e) => setOtherForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Almuerzo especial, planchado…"
              className={INPUT}
            />
          </Field>
          <Field label="¿Cuánto cuesta?">
            <MoneyInput value={otherForm.price} onChange={(v) => setOtherForm((f) => ({ ...f, price: v }))} required big />
          </Field>
          <div className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2">
            {QUICK_PRICES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setOtherForm((f) => ({ ...f, price: String(v) }))}
                className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold cursor-pointer"
              >
                {formatCOP(v)}
              </button>
            ))}
          </div>
          <GroupPicker value={otherForm.group} onChange={(g) => setOtherForm((f) => ({ ...f, group: g }))} />
          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={otherForm.save}
              onChange={(e) => setOtherForm((f) => ({ ...f, save: e.target.checked }))}
              className="w-5 h-5 accent-amber-600"
            />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Guardarlo en mi lista para la próxima vez
            </span>
          </label>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: AGREGAR / CAMBIAR PRODUCTO
      ===================================================================== */}
      {productModal && (
        <Modal
          color="bg-amber-600"
          icon={productModal.item ? <Edit3 className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          title={productModal.item ? 'Cambiar producto' : 'Agregar producto'}
          onClose={() => setProductModal(null)}
          onSubmit={handleSaveProduct}
          footer={
            <>
              <SecondaryBtn onClick={() => setProductModal(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-amber-600 hover:bg-amber-700">Guardar</PrimaryBtn>
            </>
          }
        >
          <Field label="Nombre">
            <input
              required
              autoFocus
              value={productForm.name}
              onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Desayuno, Cerveza, Lavado de ropa…"
              className={INPUT}
            />
          </Field>
          <Field label="Precio">
            <MoneyInput value={productForm.price} onChange={(v) => setProductForm((f) => ({ ...f, price: v }))} required big />
          </Field>
          <GroupPicker value={productForm.group} onChange={(g) => setProductForm((f) => ({ ...f, group: g }))} />
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: COBRAR CONSUMO PENDIENTE
      ===================================================================== */}
      {settleTarget && (
        <Modal
          color="bg-emerald-700"
          icon={<Wallet className="w-6 h-6" />}
          title={`Cobrar ${formatCOP(settleTarget.total_amount)}`}
          subtitle={itemsText(settleTarget)}
          onClose={() => setSettleTarget(null)}
          onSubmit={handleSettle}
          footer={
            <>
              <SecondaryBtn onClick={() => setSettleTarget(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-emerald-600 hover:bg-emerald-700">Cobrar</PrimaryBtn>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <BigChoice
              selected={settle.mode === 'CAJA_DIRECTA'}
              onClick={() => setSettle((s) => ({ ...s, mode: 'CAJA_DIRECTA' }))}
              color="bg-emerald-600 border-emerald-600"
              icon={<Wallet className="w-6 h-6" />}
              title="Paga ahora"
              hint="Entra a la caja"
            />
            <BigChoice
              selected={settle.mode === 'CARGO_HABITACION'}
              onClick={() => setSettle((s) => ({ ...s, mode: 'CARGO_HABITACION' }))}
              disabled={activeStays.length === 0}
              color="bg-violet-600 border-violet-600"
              icon={<BedDouble className="w-6 h-6" />}
              title="A la habitación"
              hint="Paga al salir"
            />
          </div>
          {settle.mode === 'CAJA_DIRECTA' ? (
            <Segmented
              value={settle.method}
              onChange={(v) => setSettle((s) => ({ ...s, method: v }))}
              options={payOptions.map((p) => ({ id: p.id, label: `${p.emoji} ${p.label}`, color: 'bg-emerald-600' }))}
            />
          ) : (
            <Field label="Habitación">
              <select
                value={settle.stayId}
                onChange={(e) => setSettle((s) => ({ ...s, stayId: e.target.value }))}
                className={INPUT}
              >
                <option value="">— Elige la habitación —</option>
                {activeStays.map((s) => (
                  <option key={s.stay_id} value={s.stay_id}>
                    Hab. {s.room_number} — {s.guest_name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: ANULAR
      ===================================================================== */}
      {voidTarget && (
        <Modal
          color="bg-rose-700"
          icon={<Ban className="w-6 h-6" />}
          title="Anular venta"
          subtitle={`${formatCOP(voidTarget.total_amount)} · ${itemsText(voidTarget)}`}
          onClose={() => setVoidTarget(null)}
          onSubmit={handleVoid}
          footer={
            <>
              <SecondaryBtn onClick={() => setVoidTarget(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-rose-600 hover:bg-rose-700">Anular</PrimaryBtn>
            </>
          }
        >
          <p className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-300 dark:border-rose-500 text-sm text-rose-900 dark:text-rose-100">
            Si ya se había cobrado, el sistema devuelve el dinero en la caja o lo quita de la cuenta de la habitación.
          </p>
          <Field label="¿Por qué se anula?">
            <input
              required
              autoFocus
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Ej: Me equivoqué de producto"
              className={INPUT}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   COMPONENTES PEQUEÑOS
========================================================================= */

function Step({ n, t = 'slate', title, hint }: { n: number; t?: Tone; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`head-icon w-9 h-9 rounded-full ${SOLID[t]} text-white text-base font-black flex items-center justify-center shrink-0`}>
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{title}</h2>
        {hint && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

function BigChoice({
  selected,
  onClick,
  disabled,
  color,
  icon,
  title,
  hint
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  color: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[84px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-center cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
        selected
          ? `${color} text-white`
          : 'bg-white/95 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 hover:border-slate-400'
      }`}
    >
      {icon}
      <span className="text-base font-black leading-tight">{title}</span>
      <span className={`text-xs font-semibold ${selected ? 'text-white/85' : 'text-slate-500'}`}>{hint}</span>
    </button>
  );
}

function QtyBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 flex items-center justify-center shrink-0 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

function GroupPicker({ value, onChange }: { value: GroupId; onChange: (g: GroupId) => void }) {
  return (
    <Field label="¿Qué tipo es?">
      <Segmented
        value={value}
        onChange={onChange}
        options={GROUPS.map((g) => ({ id: g.id, label: `${g.emoji} ${g.label}`, color: 'bg-amber-600' }))}
      />
    </Field>
  );
}
