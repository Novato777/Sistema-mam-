import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Minus,
  PackagePlus,
  PackageMinus,
  Edit3,
  History,
  Truck,
  Ban,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronDown,
  Trash2,
  Link2
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
  Panel,
  EmptyText,
  SECTION,
  SECTION_HEAD,
  HeadIcon,
  HEAD_BTN,
  ModuleHeader
} from '../components/ModuleUI';

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
  if (!res.ok) throw new Error(data.error || data.message || `Error HTTP ${res.status}`);
  return data;
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );

const onlyDigits = (v: string | number) => Number(String(v).replace(/\D/g, '')) || 0;
/** Cantidades: permite decimales (ej. 1.5 kilos). */
const toQty = (v: string) => Math.max(0, Number(String(v).replace(',', '.')) || 0);
const fmtQty = (n: number) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });

/* =========================================================================
   TIPOS
========================================================================= */

interface InventoryProduct {
  id: number;
  sku: string;
  department: string;
  category: string;
  name: string;
  unit: string;
  cost: number;
  last_cost: number;
  price: number;
  stock: number;
  min_stock: number;
  reorder_point: number;
  location: string;
  preferred_supplier_id: number | null;
  preferred_supplier_name: string | null;
  active: number;
  valuation: number;
  stock_status: 'AGOTADO' | 'CRITICO' | 'REPOSICION' | 'NORMAL';
  suggested_order_qty: number;
}

interface Supplier {
  id: number;
  name: string;
  tax_id: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  category: string;
  payment_terms: string;
  notes: string;
  active: number;
}

interface PurchaseItem {
  id: number;
  product_id: number;
  item_name: string;
  unit?: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

interface PurchaseOrder {
  id: number;
  order_number: string;
  supplier_id: number | null;
  supplier_name: string | null;
  invoice_number: string;
  purchase_date: string;
  status: string;
  payment_method: string;
  total_amount: number;
  notes: string;
  void_reason: string | null;
  items: PurchaseItem[];
}

interface InventoryMovement {
  id: number;
  product_id: number;
  product_name?: string;
  product_unit?: string;
  movement_type: string;
  direction: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  notes: string;
  user_name: string | null;
  movement_date: string;
}

interface ServiceCatalogWithRecipes {
  id: number;
  name: string;
  price: number;
  recipes: { inventory_product_id: number; quantity: number; unit: string; notes?: string; product_name?: string }[];
}

/* =========================================================================
   CATÁLOGOS SIMPLES
========================================================================= */

const AREAS = [
  { id: 'RESTAURANTE', label: '🍽️ Cocina' },
  { id: 'MINIBAR', label: '🥤 Bebidas' },
  { id: 'AMENIDADES', label: '🧴 Habitaciones' },
  { id: 'ASEO', label: '🧹 Aseo' },
  { id: 'LENCERIA', label: '🛏️ Lencería' },
  { id: 'MANTENIMIENTO', label: '🔧 Mantenimiento' },
  { id: 'GENERAL', label: '📦 Otro' }
];
const areaLabel = (d: string) => AREAS.find((a) => a.id === d)?.label || '📦 Otro';

const UNITS = [
  { id: 'UND', label: 'Unidades' },
  { id: 'KG', label: 'Kilos' },
  { id: 'LT', label: 'Litros' },
  { id: 'PAQ', label: 'Paquetes' },
  { id: 'CAJA', label: 'Cajas' }
];
const unitLabel = (u: string) => (UNITS.find((x) => x.id === (u || '').toUpperCase())?.label || u || 'Unidades').toLowerCase();

/** Lo que el usuario elige al sacar o corregir; cada opción ya sabe qué tipo de movimiento es. */
const OUT_REASONS = [
  { id: 'SALIDA_CONSUMO', emoji: '📤', label: 'Se usó', hint: 'Se gastó en el hotel', sign: -1 },
  { id: 'SALIDA_AJUSTE', emoji: '🗑️', label: 'Se dañó o perdió', hint: 'Vencido, roto, perdido', sign: -1 },
  { id: 'ENTRADA_AJUSTE', emoji: '🔢', label: 'Hay más', hint: 'Corregir: encontré más', sign: 1 }
] as const;

const MOVE_LABEL: Record<string, string> = {
  ENTRADA_COMPRA: 'Compra',
  ENTRADA_AJUSTE: 'Corrección (+)',
  SALIDA_CONSUMO: 'Se usó',
  SALIDA_AJUSTE: 'Dañado / perdido',
  SALIDA_VENTA_POS: 'Venta en Servicios',
  TRASLADO: 'Traslado'
};

const stockLook = (p: InventoryProduct) => {
  if (p.stock_status === 'AGOTADO' || Number(p.stock) <= 0)
    return { label: 'Se acabó', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-600' };
  if (p.stock_status === 'CRITICO' || p.stock_status === 'REPOSICION')
    return { label: 'Queda poco', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' };
  return { label: 'Hay suficiente', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-600' };
};

const isLow = (p: InventoryProduct) => p.stock_status !== 'NORMAL';

type Tab = 'PRODUCTOS' | 'COMPRAS' | 'MOVIMIENTOS';
type PurchaseLine = { product_id: string; quantity: string; unit_cost: string };

/* =========================================================================
   PÁGINA
========================================================================= */

export default function Inventario() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const canManage = hasPermission('inventory.manage');
  const today = getTodayString();
  const base = `/hotels/${activeHotelId}/inventory`;

  const [activeTab, setActiveTab] = useState<Tab>('PRODUCTOS');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Datos
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogWithRecipes[]>([]);
  const [openRegisters, setOpenRegisters] = useState<{ id: number; name: string }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);

  // Lista de productos
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState<'ALL' | 'LOW'>('ALL');
  const [showRecipes, setShowRecipes] = useState(false);

  // Producto
  const [productModal, setProductModal] = useState<{ item: InventoryProduct | null } | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    unit: 'UND',
    stock: '',
    min_stock: '5',
    cost: '',
    department: 'GENERAL',
    sku: '',
    location: 'Bodega Principal',
    preferred_supplier_id: ''
  });
  const [productMore, setProductMore] = useState(false);

  // Entró mercancía (compra)
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '',
    invoice_number: '',
    paid_from_cash: false,
    payment_method: 'Efectivo'
  });

  // Sacar / corregir
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveForm, setMoveForm] = useState({
    product_id: '',
    movement_type: 'SALIDA_CONSUMO' as (typeof OUT_REASONS)[number]['id'],
    quantity: '1',
    notes: ''
  });

  // Proveedor
  const [supplierModal, setSupplierModal] = useState<{ item: Supplier | null } | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', contact_name: '', tax_id: '' });

  // Anular compra
  const [voidTarget, setVoidTarget] = useState<PurchaseOrder | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Historial por producto
  const [historyProductId, setHistoryProductId] = useState('');
  const [history, setHistory] = useState<{ product: InventoryProduct; movements: InventoryMovement[] } | null>(null);

  // Lo que gasta cada venta (recetas)
  const [recipeTarget, setRecipeTarget] = useState<ServiceCatalogWithRecipes | null>(null);
  const [recipeLines, setRecipeLines] = useState<{ inventory_product_id: string; quantity: string }[]>([]);

  const show = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    if (type === 'success') setTimeout(() => setMsg(null), 5000);
  };

  const run = async (fn: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      show('error', err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- Carga -------------------- */

  const fetchOverview = useCallback(async () => {
    if (!activeHotelId) return;
    try {
      const data = await apiRequest('GET', `/hotels/${activeHotelId}/inventory/overview`);
      setProducts(data.products || []);
      setSuppliers(data.suppliers || []);
      setPurchases(data.purchases || []);
      setRecentMovements(data.recent_movements || []);
      setServiceCatalog(data.service_catalog || []);
      setOpenRegisters(data.open_registers || []);
      setPaymentMethods(data.payment_methods || []);
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }, [activeHotelId]);

  const fetchHistory = useCallback(
    async (id: string) => {
      if (!activeHotelId || !id) {
        setHistory(null);
        return;
      }
      try {
        setHistory(await apiRequest('GET', `/hotels/${activeHotelId}/inventory/products/${id}/kardex`));
      } catch (err) {
        show('error', err instanceof Error ? err.message : 'No se pudo cargar el historial.');
      }
    },
    [activeHotelId]
  );

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'MOVIMIENTOS') fetchHistory(historyProductId);
  }, [activeTab, historyProductId, fetchHistory]);

  const activeProducts = useMemo(() => products.filter((p) => Number(p.active) !== 0), [products]);
  const lowProducts = useMemo(() => activeProducts.filter(isLow), [activeProducts]);
  const productById = (id: string | number) => products.find((p) => String(p.id) === String(id));

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (onlyLow === 'LOW' && !isLow(p)) return false;
      return !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
    });
  }, [activeProducts, onlyLow, search]);

  /* -------------------- Producto -------------------- */

  const openProduct = (item: InventoryProduct | null) => {
    setProductMore(false);
    setProductForm(
      item
        ? {
            name: item.name,
            unit: (item.unit || 'UND').toUpperCase(),
            stock: String(item.stock || 0),
            min_stock: String(item.min_stock || 0),
            cost: String(item.cost || ''),
            department: item.department || 'GENERAL',
            sku: item.sku || '',
            location: item.location || 'Bodega Principal',
            preferred_supplier_id: item.preferred_supplier_id ? String(item.preferred_supplier_id) : ''
          }
        : {
            name: '',
            unit: 'UND',
            stock: '',
            min_stock: '5',
            cost: '',
            department: 'GENERAL',
            sku: '',
            location: 'Bodega Principal',
            preferred_supplier_id: ''
          }
    );
    setProductModal({ item });
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const item = productModal?.item || null;
    if (!productForm.name.trim()) {
      show('error', 'Escribe el nombre del producto.');
      return;
    }
    const min = toQty(productForm.min_stock);
    const payload = {
      sku: productForm.sku.trim(),
      department: productForm.department,
      category: item?.category || 'General',
      name: productForm.name.trim(),
      unit: productForm.unit,
      cost: onlyDigits(productForm.cost),
      price: item?.price || 0,
      // La cantidad solo se fija al crear; después cambia con entradas y salidas.
      stock: item ? item.stock : toQty(productForm.stock),
      min_stock: min,
      reorder_point: item && item.reorder_point > min ? item.reorder_point : min * 2,
      location: productForm.location || 'Bodega Principal',
      preferred_supplier_id: productForm.preferred_supplier_id ? Number(productForm.preferred_supplier_id) : null
    };
    run(async () => {
      if (item) await apiRequest('PUT', `${base}/products/${item.id}`, payload);
      else await apiRequest('POST', `${base}/products`, payload);
      show('success', item ? 'Producto actualizado.' : `"${payload.name}" agregado al inventario.`);
      setProductModal(null);
      await fetchOverview();
    }, 'No se pudo guardar el producto.');
  };

  /* -------------------- Entró mercancía -------------------- */

  const lineFor = (p?: InventoryProduct, qty?: number): PurchaseLine => ({
    product_id: p ? String(p.id) : '',
    quantity: qty ? String(qty) : '',
    unit_cost: p ? String(p.last_cost || p.cost || '') : ''
  });

  const openPurchase = (p?: InventoryProduct) => {
    setPurchaseLines([lineFor(p, p && isLow(p) ? p.suggested_order_qty || undefined : undefined)]);
    setPurchaseForm({
      supplier_id: p?.preferred_supplier_id ? String(p.preferred_supplier_id) : '',
      invoice_number: '',
      paid_from_cash: false,
      payment_method: paymentMethods.find((m) => m.name.toLowerCase().includes('efectivo'))?.name || 'Efectivo'
    });
    setPurchaseOpen(true);
  };

  const purchaseTotal = purchaseLines.reduce((a, l) => a + toQty(l.quantity) * onlyDigits(l.unit_cost), 0);

  const setLine = (i: number, patch: Partial<PurchaseLine>) =>
    setPurchaseLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const handlePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = purchaseLines.filter((l) => l.product_id && toQty(l.quantity) > 0);
    if (lines.length === 0) {
      show('error', 'Elige el producto y escribe cuánto llegó.');
      return;
    }
    if (purchaseForm.paid_from_cash && openRegisters.length === 0) {
      show('error', 'La caja está cerrada. Ábrela o desmarca "Lo pagué con plata de la caja".');
      return;
    }
    run(async () => {
      const res = await apiRequest('POST', `${base}/purchases`, {
        supplier_id: purchaseForm.supplier_id ? Number(purchaseForm.supplier_id) : null,
        invoice_number: purchaseForm.invoice_number.trim(),
        purchase_date: today,
        status: 'RECIBIDA',
        payment_method: purchaseForm.payment_method,
        register_in_cash: purchaseForm.paid_from_cash,
        register_id: purchaseForm.paid_from_cash && openRegisters[0] ? openRegisters[0].id : null,
        tax_amount: 0,
        notes: '',
        items: lines.map((l) => ({
          product_id: Number(l.product_id),
          quantity: toQty(l.quantity),
          unit_cost: onlyDigits(l.unit_cost),
          location: productById(l.product_id)?.location || 'Bodega Principal'
        }))
      });
      show('success', res.message || '✓ Mercancía guardada en el inventario.');
      setPurchaseOpen(false);
      await fetchOverview();
    }, 'No se pudo guardar la compra.');
  };

  const receiveDraft = (id: number) =>
    run(async () => {
      const res = await apiRequest('POST', `${base}/purchases/${id}/receive`, {});
      show('success', res.message || 'Compra recibida.');
      await fetchOverview();
    }, 'No se pudo recibir la compra.');

  const handleVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget || !voidReason.trim()) {
      show('error', 'Escribe por qué se anula.');
      return;
    }
    run(async () => {
      const res = await apiRequest('POST', `${base}/purchases/${voidTarget.id}/void`, { void_reason: voidReason.trim() });
      show('success', res.message || 'Compra anulada.');
      setVoidTarget(null);
      setVoidReason('');
      await fetchOverview();
    }, 'No se pudo anular la compra.');
  };

  /* -------------------- Sacar / corregir -------------------- */

  const openMove = (p?: InventoryProduct) => {
    setMoveForm({ product_id: p ? String(p.id) : '', movement_type: 'SALIDA_CONSUMO', quantity: '1', notes: '' });
    setMoveOpen(true);
  };

  const moveProduct = productById(moveForm.product_id);
  const moveReason = OUT_REASONS.find((r) => r.id === moveForm.movement_type) || OUT_REASONS[0];
  const moveQty = toQty(moveForm.quantity);
  const moveAfter = moveProduct ? Number(moveProduct.stock) + moveReason.sign * moveQty : 0;

  const handleMove = (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveProduct || moveQty <= 0) {
      show('error', 'Elige el producto y la cantidad.');
      return;
    }
    if (moveAfter < 0) {
      show('error', `Solo hay ${fmtQty(moveProduct.stock)} ${unitLabel(moveProduct.unit)}. No puedes sacar más de eso.`);
      return;
    }
    run(async () => {
      const res = await apiRequest('POST', `${base}/movements`, {
        product_id: moveProduct.id,
        movement_type: moveForm.movement_type,
        quantity: moveQty,
        department: moveProduct.department || 'GENERAL',
        target_location: '',
        notes: moveForm.notes.trim() || moveReason.label
      });
      show('success', res.message || 'Guardado.');
      setMoveOpen(false);
      await fetchOverview();
      if (historyProductId === String(moveProduct.id)) await fetchHistory(historyProductId);
    }, 'No se pudo guardar.');
  };

  /* -------------------- Proveedores -------------------- */

  const openSupplier = (item: Supplier | null) => {
    setSupplierForm(
      item
        ? { name: item.name, phone: item.phone || '', contact_name: item.contact_name || '', tax_id: item.tax_id || '' }
        : { name: '', phone: '', contact_name: '', tax_id: '' }
    );
    setSupplierModal({ item });
  };

  const handleSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    const item = supplierModal?.item || null;
    if (!supplierForm.name.trim()) {
      show('error', 'Escribe el nombre del proveedor.');
      return;
    }
    const payload = {
      ...supplierForm,
      name: supplierForm.name.trim(),
      email: item?.email || '',
      address: item?.address || '',
      category: item?.category || 'General',
      payment_terms: item?.payment_terms || 'Contado',
      notes: item?.notes || ''
    };
    run(async () => {
      if (item) await apiRequest('PUT', `${base}/suppliers/${item.id}`, payload);
      else await apiRequest('POST', `${base}/suppliers`, payload);
      show('success', item ? 'Proveedor actualizado.' : 'Proveedor agregado.');
      setSupplierModal(null);
      await fetchOverview();
    }, 'No se pudo guardar el proveedor.');
  };

  /* -------------------- Lo que gasta cada venta -------------------- */

  const openRecipe = (item: ServiceCatalogWithRecipes) => {
    setRecipeTarget(item);
    setRecipeLines(
      item.recipes.map((r) => ({ inventory_product_id: String(r.inventory_product_id), quantity: String(r.quantity) }))
    );
  };

  const handleRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeTarget) return;
    run(async () => {
      const res = await apiRequest('PUT', `${base}/recipes/${recipeTarget.id}`, {
        ingredients: recipeLines
          .filter((l) => l.inventory_product_id && toQty(l.quantity) > 0)
          .map((l) => ({
            inventory_product_id: Number(l.inventory_product_id),
            quantity: toQty(l.quantity),
            unit: productById(l.inventory_product_id)?.unit || 'UND',
            notes: ''
          }))
      });
      show('success', res.message || 'Guardado.');
      setRecipeTarget(null);
      await fetchOverview();
    }, 'No se pudo guardar.');
  };

  /* -------------------- PDF del historial -------------------- */

  const exportHistoryPdf = () => {
    if (!history) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${activeHotel?.name || 'Hotel'} — Historial de ${history.product.name}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Hay ahora: ${fmtQty(history.product.stock)} ${unitLabel(history.product.unit)}`, 14, 23);
    autoTable(doc, {
      startY: 29,
      head: [['Fecha', 'Qué pasó', 'Cantidad', 'Quedaron', 'Nota']],
      body: history.movements.map((m) => [
        m.movement_date,
        MOVE_LABEL[m.movement_type] || m.movement_type,
        `${m.direction === 'OUT' ? '−' : m.direction === 'IN' ? '+' : ''}${fmtQty(m.quantity)}`,
        fmtQty(m.new_stock),
        m.notes || ''
      ])
    });
    doc.save(`historial-${history.product.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  const goHistory = (p: InventoryProduct) => {
    setHistoryProductId(String(p.id));
    setActiveTab('MOVIMIENTOS');
  };

  /* =======================================================================
     RENDER
  ======================================================================= */

  return (
    <div className="space-y-4 sm:space-y-5">
      <ModuleHeader
        icon={<Boxes className="w-5 h-5" />}
        iconColor="bg-teal-700"
        title={
          <>
            Inventario
            <span className="font-semibold text-slate-500 dark:text-slate-400"> · {activeHotel?.name || 'Hotel'}</span>
          </>
        }
        subtitle={
          loading
            ? 'Cargando…'
            : lowProducts.length > 0
            ? `${lowProducts.length} producto${lowProducts.length === 1 ? '' : 's'} por acabarse`
            : 'Todo con suficiente cantidad'
        }
        tabs={[
          { id: 'PRODUCTOS', label: 'Mis productos', short: 'Productos', icon: <Boxes className="w-5 h-5 shrink-0" /> },
          { id: 'COMPRAS', label: 'Compras', short: 'Compras', icon: <Truck className="w-5 h-5 shrink-0" /> },
          { id: 'MOVIMIENTOS', label: 'Historial', short: 'Historial', icon: <History className="w-5 h-5 shrink-0" /> }
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {msg && (
        <Notice tone={msg.type} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {/* =====================================================================
          PESTAÑA 1: MIS PRODUCTOS
      ===================================================================== */}
      {activeTab === 'PRODUCTOS' && (
        <div className="space-y-4">
          {canManage && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <BigAction
                color="bg-emerald-600 hover:bg-emerald-700"
                icon={<PackagePlus className="w-7 h-7" />}
                title="Entró mercancía"
                hint="Compré o me trajeron"
                onClick={() => openPurchase()}
                disabled={activeProducts.length === 0}
              />
              <BigAction
                color="bg-rose-600 hover:bg-rose-700"
                icon={<PackageMinus className="w-7 h-7" />}
                title="Sacar o corregir"
                hint="Se usó, se dañó o hay más"
                onClick={() => openMove()}
                disabled={activeProducts.length === 0}
              />
            </div>
          )}

          {lowProducts.length > 0 && onlyLow === 'ALL' && (
            <button
              type="button"
              onClick={() => setOnlyLow('LOW')}
              className="w-full p-4 rounded-2xl border-2 border-amber-500 dark:border-amber-500 bg-amber-100 dark:bg-amber-500/15 flex items-center gap-3 text-left cursor-pointer"
            >
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-base font-black text-amber-900 dark:text-amber-100">
                  {lowProducts.length} producto{lowProducts.length === 1 ? ' se está' : 's se están'} acabando
                </span>
                <span className="block text-sm text-amber-800 dark:text-amber-200 truncate">
                  {lowProducts.slice(0, 4).map((p) => p.name).join(', ')}
                  {lowProducts.length > 4 ? '…' : ''}
                </span>
              </span>
              <span className="text-sm font-black text-amber-900 dark:text-amber-100 shrink-0">Ver</span>
            </button>
          )}

          <section className={SECTION('teal')}>
            <div className={`${SECTION_HEAD('teal')} space-y-3`}>
              <div className="flex flex-col sm:flex-row gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar producto…" className="flex-1" />
                {canManage && (
                  <button
                    type="button"
                    onClick={() => openProduct(null)}
                    className={`${HEAD_BTN} h-12`}
                  >
                    <Plus className="w-5 h-5" />
                    Nuevo producto
                  </button>
                )}
              </div>
              <Segmented
                value={onlyLow}
                onChange={setOnlyLow}
                options={[
                  { id: 'ALL', label: `Todos (${activeProducts.length})`, color: 'bg-teal-700' },
                  { id: 'LOW', label: `Por acabarse (${lowProducts.length})`, color: 'bg-amber-600' }
                ]}
              />
            </div>

            {loading ? (
              <p className="p-10 text-center text-sm font-semibold text-slate-500">Cargando inventario…</p>
            ) : activeProducts.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <Boxes className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-base font-black text-slate-800 dark:text-slate-100">Aún no tienes productos</p>
                <p className="text-sm text-slate-500">Agrega lo que guardas en bodega: agua, jabón, sábanas…</p>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => openProduct(null)}
                    className="h-12 px-5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-black cursor-pointer"
                  >
                    Agregar el primero
                  </button>
                )}
              </div>
            ) : visibleProducts.length === 0 ? (
              <p className="p-10 text-center text-sm font-semibold text-slate-500">No hay productos con ese nombre.</p>
            ) : (
              <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                {visibleProducts.map((p) => {
                  const look = stockLook(p);
                  return (
                    <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-x-3 gap-y-2.5">
                      <span className={`w-3 h-3 mt-1.5 sm:mt-0 rounded-full shrink-0 ${look.dot}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold leading-snug text-slate-900 dark:text-white line-clamp-2 break-words">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500 leading-snug">
                          {areaLabel(p.department)} · aviso con {fmtQty(p.min_stock)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                          {fmtQty(p.stock)}{' '}
                          <span className="text-sm font-semibold text-slate-500">{unitLabel(p.unit)}</span>
                        </p>
                        <p className={`text-xs font-bold whitespace-nowrap ${look.text}`}>{look.label}</p>
                      </div>
                      {canManage && (
                        <div className="flex gap-1.5 w-full sm:w-auto shrink-0 pl-6 sm:pl-0">
                          <button
                            type="button"
                            onClick={() => openPurchase(p)}
                            className="flex-1 sm:flex-none h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="sm:hidden">Entró</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openMove(p)}
                            className="flex-1 sm:flex-none h-10 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                            <span className="sm:hidden">Sacar</span>
                          </button>
                          <RowBtn title="Cambiar datos" onClick={() => openProduct(p)}>
                            <Edit3 className="w-4 h-4" />
                          </RowBtn>
                          <RowBtn title="Ver historial" onClick={() => goHistory(p)}>
                            <History className="w-4 h-4" />
                          </RowBtn>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Avanzado: descontar automáticamente al vender en Servicios */}
          {canManage && serviceCatalog.length > 0 && activeProducts.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowRecipes((v) => !v)}
                className="w-full h-12 rounded-2xl bg-white/95 dark:bg-slate-900 border-2 border-indigo-500 text-sm font-bold text-indigo-800 dark:text-indigo-200 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Link2 className="w-5 h-5" />
                Descontar solo al vender en Servicios (opcional)
                <ChevronDown className={`w-4 h-4 transition-transform ${showRecipes ? 'rotate-180' : ''}`} />
              </button>
              {showRecipes && (
                <Panel
                  accent="indigo"
                  icon={<Link2 className="w-5 h-5 shrink-0" />}
                  title="¿Qué se gasta en cada venta?"
                  subtitle="Ej: cada 'Desayuno' vendido gasta 2 huevos y 1 pan. Así el inventario baja solo."
                >
                  <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                    {serviceCatalog.map((s) => (
                      <li key={s.id} className="py-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {s.recipes.length === 0
                              ? 'No descuenta nada'
                              : s.recipes
                                  .map((r) => `${fmtQty(r.quantity)} ${r.product_name || productById(r.inventory_product_id)?.name || ''}`)
                                  .join(', ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRecipe(s)}
                          className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold cursor-pointer shrink-0"
                        >
                          {s.recipes.length === 0 ? 'Configurar' : 'Cambiar'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: COMPRAS
      ===================================================================== */}
      {activeTab === 'COMPRAS' && (
        <div className="space-y-4">
          {canManage && (
            <BigAction
              color="bg-emerald-600 hover:bg-emerald-700"
              icon={<PackagePlus className="w-7 h-7" />}
              title="Registrar mercancía que entró"
              hint="Compras o lo que trae el proveedor"
              onClick={() => openPurchase()}
              disabled={activeProducts.length === 0}
            />
          )}

          <section className={SECTION('sky')}>
            <h2 className={`${SECTION_HEAD('sky')} text-base font-black text-slate-900 dark:text-white flex items-center gap-2.5`}>
              <HeadIcon t="sky">
                <Truck className="w-5 h-5 shrink-0" />
              </HeadIcon>
              Últimas compras
            </h2>
            {purchases.length === 0 ? (
              <p className="p-10 text-center text-sm font-semibold text-slate-500">Aún no hay compras registradas.</p>
            ) : (
              <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                {purchases.map((po) => {
                  const voided = po.status === 'ANULADA';
                  const draft = po.status === 'BORRADOR';
                  return (
                    <li key={po.id} className={`px-4 sm:px-5 py-3 flex items-center gap-3 ${voided ? 'opacity-55' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {po.items.map((i) => `${fmtQty(i.quantity)} ${i.item_name}`).join(', ')}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {po.purchase_date} · {po.supplier_name || 'Sin proveedor'}
                          {voided ? ` · Anulada${po.void_reason ? `: ${po.void_reason}` : ''}` : ''}
                          {draft ? ' · Falta recibir' : ''}
                        </p>
                      </div>
                      <span className={`text-base font-black shrink-0 ${voided ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {formatCOP(po.total_amount)}
                      </span>
                      {canManage && draft && (
                        <button
                          type="button"
                          onClick={() => receiveDraft(po.id)}
                          disabled={busy}
                          className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-bold shrink-0 cursor-pointer"
                        >
                          Ya llegó
                        </button>
                      )}
                      {canManage && !voided && (
                        <RowBtn
                          title="Anular compra"
                          onClick={() => {
                            setVoidTarget(po);
                            setVoidReason('');
                          }}
                          cls="border border-rose-300 dark:border-rose-500 text-rose-700 dark:text-rose-300"
                        >
                          <Ban className="w-4 h-4" />
                        </RowBtn>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Panel
            accent="violet"
            title="Proveedores"
            icon={<Truck className="w-5 h-5 shrink-0" />}
            actions={
              canManage && (
                <button
                  type="button"
                  onClick={() => openSupplier(null)}
                  className={HEAD_BTN}
                >
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
              )
            }
          >
            {suppliers.length === 0 ? (
              <EmptyText>No hay proveedores. No es obligatorio tenerlos.</EmptyText>
            ) : (
              <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                {suppliers.map((s) => (
                  <li key={s.id} className="py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[s.contact_name, s.phone].filter(Boolean).join(' · ') || 'Sin teléfono'}
                      </p>
                    </div>
                    {canManage && (
                      <RowBtn title="Cambiar datos" onClick={() => openSupplier(s)}>
                        <Edit3 className="w-4 h-4" />
                      </RowBtn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: HISTORIAL
      ===================================================================== */}
      {activeTab === 'MOVIMIENTOS' && (
        <div className="space-y-4">
          <section className={`p-4 sm:p-5 space-y-3 ${SECTION('amber')}`}>
            <Field label="¿De qué producto quieres ver el historial?">
              <select value={historyProductId} onChange={(e) => setHistoryProductId(e.target.value)} className={INPUT}>
                <option value="">Todos (últimos movimientos)</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {history && historyProductId && (
              <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-teal-50 dark:bg-teal-500/15 border border-teal-200 dark:border-teal-500">
                <div>
                  <p className="text-sm font-bold text-teal-900 dark:text-teal-100">Hay ahora</p>
                  <p className="text-2xl font-black text-teal-900 dark:text-teal-100">
                    {fmtQty(history.product.stock)} {unitLabel(history.product.unit)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportHistoryPdf}
                  className="h-11 px-4 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  PDF
                </button>
              </div>
            )}
          </section>

          <section className={SECTION('teal')}>
            {(() => {
              const list = historyProductId ? history?.movements || [] : recentMovements;
              if (list.length === 0)
                return <p className="p-10 text-center text-sm font-semibold text-slate-500">No hay movimientos todavía.</p>;
              return (
                <ul className="list-scroll divide-y divide-slate-200 dark:divide-slate-700">
                  {list.map((m) => {
                    const inc = m.direction === 'IN';
                    const out = m.direction === 'OUT';
                    const unit = unitLabel(m.product_unit || history?.product.unit || 'UND');
                    return (
                      <li key={m.id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${
                            inc ? 'bg-emerald-600' : out ? 'bg-rose-600' : 'bg-slate-500'
                          }`}
                        >
                          {inc ? <Plus className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {MOVE_LABEL[m.movement_type] || m.movement_type}
                            {!historyProductId && m.product_name ? ` · ${m.product_name}` : ''}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {m.movement_date}
                            {m.user_name ? ` · ${m.user_name}` : ''}
                            {m.notes ? ` · ${m.notes}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-base font-black ${inc ? 'text-emerald-700 dark:text-emerald-400' : out ? 'text-rose-700 dark:text-rose-400' : 'text-slate-700'}`}>
                            {inc ? '+' : out ? '−' : ''}
                            {fmtQty(m.quantity)}
                          </p>
                          <p className="text-xs text-slate-500">
                            quedaron {fmtQty(m.new_stock)} {unit}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </section>
        </div>
      )}

      {/* =====================================================================
          VENTANA: NUEVO / CAMBIAR PRODUCTO
      ===================================================================== */}
      {productModal && (
        <Modal
          color="bg-teal-700"
          icon={productModal.item ? <Edit3 className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          title={productModal.item ? 'Cambiar producto' : 'Nuevo producto'}
          subtitle={productModal.item ? productModal.item.name : 'Solo el nombre es obligatorio'}
          onClose={() => setProductModal(null)}
          onSubmit={handleSaveProduct}
          footer={
            <>
              <SecondaryBtn onClick={() => setProductModal(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-teal-700 hover:bg-teal-800">Guardar</PrimaryBtn>
            </>
          }
        >
          <Field label="¿Cómo se llama?">
            <input
              required
              autoFocus
              value={productForm.name}
              onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Botella de agua, Jabón, Huevos…"
              className={INPUT}
            />
          </Field>

          <Field label="¿Cómo lo cuentas?">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {UNITS.map((u) => (
                <Chip key={u.id} on={productForm.unit === u.id} onClick={() => setProductForm((f) => ({ ...f, unit: u.id }))}>
                  {u.label}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {productModal.item ? (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <p className="text-xs font-bold text-slate-500">Hay ahora</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">
                  {fmtQty(productModal.item.stock)} {unitLabel(productForm.unit)}
                </p>
                <p className="text-[11px] text-slate-500">Cámbialo con “Entró” o “Sacar”.</p>
              </div>
            ) : (
              <Field label="¿Cuántos hay ahora?">
                <input
                  inputMode="decimal"
                  value={productForm.stock}
                  onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  className={`${INPUT} text-lg font-black`}
                />
              </Field>
            )}
            <Field label="Avísame cuando queden">
              <input
                inputMode="decimal"
                value={productForm.min_stock}
                onChange={(e) => setProductForm((f) => ({ ...f, min_stock: e.target.value }))}
                className={`${INPUT} text-lg font-black`}
              />
            </Field>
          </div>

          <Field label="¿Para qué área es?">
            <div className="flex flex-wrap gap-2">
              {AREAS.map((a) => (
                <Chip key={a.id} on={productForm.department === a.id} onClick={() => setProductForm((f) => ({ ...f, department: a.id }))}>
                  {a.label}
                </Chip>
              ))}
            </div>
          </Field>

          <button
            type="button"
            onClick={() => setProductMore((v) => !v)}
            className="text-sm font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${productMore ? 'rotate-180' : ''}`} />
            Más datos (opcional)
          </button>
          {productMore && (
            <div className="space-y-3">
              <Field label="¿Cuánto te cuesta cada uno?">
                <MoneyInput value={productForm.cost} onChange={(v) => setProductForm((f) => ({ ...f, cost: v }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Código">
                  <input
                    value={productForm.sku}
                    onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                <Field label="¿Dónde se guarda?">
                  <input
                    value={productForm.location}
                    onChange={(e) => setProductForm((f) => ({ ...f, location: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
              </div>
              {suppliers.length > 0 && (
                <Field label="Proveedor habitual">
                  <select
                    value={productForm.preferred_supplier_id}
                    onChange={(e) => setProductForm((f) => ({ ...f, preferred_supplier_id: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Ninguno</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: ENTRÓ MERCANCÍA
      ===================================================================== */}
      {purchaseOpen && (
        <Modal
          color="bg-emerald-700"
          icon={<PackagePlus className="w-6 h-6" />}
          title="Entró mercancía"
          subtitle="Se suma al inventario de inmediato"
          size="lg"
          onClose={() => setPurchaseOpen(false)}
          onSubmit={handlePurchase}
          footer={
            <>
              <SecondaryBtn onClick={() => setPurchaseOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-emerald-600 hover:bg-emerald-700">
                Guardar{purchaseTotal > 0 ? ` · ${formatCOP(purchaseTotal)}` : ''}
              </PrimaryBtn>
            </>
          }
        >
          <div className="space-y-3">
            {purchaseLines.map((l, i) => {
              const p = productById(l.product_id);
              return (
                <div key={i} className="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={l.product_id}
                      onChange={(e) => {
                        const np = productById(e.target.value);
                        setLine(i, { product_id: e.target.value, unit_cost: String(np?.last_cost || np?.cost || '') });
                      }}
                      className={`${INPUT} flex-1`}
                    >
                      <option value="">— ¿Qué producto llegó? —</option>
                      {activeProducts.map((pp) => (
                        <option key={pp.id} value={pp.id}>
                          {pp.name} (hay {fmtQty(pp.stock)})
                        </option>
                      ))}
                    </select>
                    {purchaseLines.length > 1 && (
                      <RowBtn title="Quitar" onClick={() => setPurchaseLines((prev) => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="w-4 h-4" />
                      </RowBtn>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={`¿Cuántos llegaron?${p ? ` (${unitLabel(p.unit)})` : ''}`}>
                      <input
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        placeholder="0"
                        className={`${INPUT} text-lg font-black`}
                      />
                    </Field>
                    <Field label="Precio de cada uno">
                      <MoneyInput value={l.unit_cost} onChange={(v) => setLine(i, { unit_cost: v })} placeholder="0" />
                    </Field>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setPurchaseLines((prev) => [...prev, lineFor()])}
              className="w-full h-11 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm font-bold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Llegó otro producto
            </button>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={purchaseForm.paid_from_cash}
              onChange={(e) => setPurchaseForm((f) => ({ ...f, paid_from_cash: e.target.checked }))}
              className="w-5 h-5 mt-0.5 accent-emerald-600"
            />
            <span className="text-sm">
              <span className="block font-bold text-slate-800 dark:text-slate-100">Lo pagué con plata de la caja</span>
              <span className="block text-slate-500">
                {openRegisters.length > 0 ? 'Se registra como salida de dinero en Caja.' : 'La caja está cerrada ahora.'}
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Proveedor (opcional)">
              <select
                value={purchaseForm.supplier_id}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, supplier_id: e.target.value }))}
                className={INPUT}
              >
                <option value="">Ninguno</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="N.º de factura (opcional)">
              <input
                value={purchaseForm.invoice_number}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, invoice_number: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: SACAR O CORREGIR
      ===================================================================== */}
      {moveOpen && (
        <Modal
          color={moveReason.sign > 0 ? 'bg-emerald-700' : 'bg-rose-700'}
          icon={<PackageMinus className="w-6 h-6" />}
          title="Sacar o corregir"
          onClose={() => setMoveOpen(false)}
          onSubmit={handleMove}
          footer={
            <>
              <SecondaryBtn onClick={() => setMoveOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color={moveReason.sign > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}>
                Guardar
              </PrimaryBtn>
            </>
          }
        >
          <Field label="¿Qué producto?">
            <select
              value={moveForm.product_id}
              onChange={(e) => setMoveForm((f) => ({ ...f, product_id: e.target.value }))}
              className={INPUT}
              required
            >
              <option value="">— Elige el producto —</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (hay {fmtQty(p.stock)})
                </option>
              ))}
            </select>
          </Field>

          <Field label="¿Qué pasó?">
            <div className="grid grid-cols-3 gap-2">
              {OUT_REASONS.map((r) => {
                const on = moveForm.movement_type === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMoveForm((f) => ({ ...f, movement_type: r.id }))}
                    className={`min-h-[84px] p-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer ${
                      on
                        ? r.sign > 0
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-rose-600 border-rose-600 text-white'
                        : 'bg-white/95 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <span className="text-2xl leading-none" aria-hidden>
                      {r.emoji}
                    </span>
                    <span className="text-sm font-black leading-tight">{r.label}</span>
                    <span className={`text-[11px] font-semibold leading-tight ${on ? 'text-white/85' : 'text-slate-500'}`}>{r.hint}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="¿Cuántos?">
            <div className="flex items-center gap-2">
              <StepBtn onClick={() => setMoveForm((f) => ({ ...f, quantity: String(Math.max(0, toQty(f.quantity) - 1)) }))}>
                <Minus className="w-5 h-5" />
              </StepBtn>
              <input
                inputMode="decimal"
                value={moveForm.quantity}
                onChange={(e) => setMoveForm((f) => ({ ...f, quantity: e.target.value }))}
                className={`${INPUT} text-center text-2xl font-black`}
              />
              <StepBtn onClick={() => setMoveForm((f) => ({ ...f, quantity: String(toQty(f.quantity) + 1) }))}>
                <Plus className="w-5 h-5" />
              </StepBtn>
            </div>
          </Field>

          {moveProduct && (
            <div
              className={`p-4 rounded-2xl flex items-center gap-3 text-white ${moveAfter < 0 ? 'bg-rose-700' : 'bg-slate-800 dark:bg-slate-700'}`}
            >
              {moveAfter < 0 ? <AlertTriangle className="w-6 h-6 shrink-0" /> : <CheckCircle2 className="w-6 h-6 shrink-0" />}
              <p className="text-sm font-bold">
                {moveAfter < 0
                  ? `Solo hay ${fmtQty(moveProduct.stock)} ${unitLabel(moveProduct.unit)}.`
                  : `Hay ${fmtQty(moveProduct.stock)} → quedarán ${fmtQty(moveAfter)} ${unitLabel(moveProduct.unit)}`}
              </p>
            </div>
          )}

          <Field label="Nota (opcional)">
            <input
              value={moveForm.notes}
              onChange={(e) => setMoveForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ej: Para las habitaciones del piso 2"
              className={INPUT}
            />
          </Field>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: PROVEEDOR
      ===================================================================== */}
      {supplierModal && (
        <Modal
          color="bg-teal-700"
          icon={<Truck className="w-6 h-6" />}
          title={supplierModal.item ? 'Cambiar proveedor' : 'Nuevo proveedor'}
          onClose={() => setSupplierModal(null)}
          onSubmit={handleSupplier}
          footer={
            <>
              <SecondaryBtn onClick={() => setSupplierModal(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-teal-700 hover:bg-teal-800">Guardar</PrimaryBtn>
            </>
          }
        >
          <Field label="Nombre o empresa">
            <input
              required
              autoFocus
              value={supplierForm.name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Distribuidora El Sol"
              className={INPUT}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <input
                inputMode="tel"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Persona de contacto">
              <input
                value={supplierForm.contact_name}
                onChange={(e) => setSupplierForm((f) => ({ ...f, contact_name: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>
          <Field label="NIT (opcional)">
            <input
              value={supplierForm.tax_id}
              onChange={(e) => setSupplierForm((f) => ({ ...f, tax_id: e.target.value }))}
              className={INPUT}
            />
          </Field>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: QUÉ GASTA CADA VENTA
      ===================================================================== */}
      {recipeTarget && (
        <Modal
          color="bg-teal-700"
          icon={<Link2 className="w-6 h-6" />}
          title={`Cada "${recipeTarget.name}" gasta…`}
          subtitle="Al venderlo en Servicios, esto se descuenta solo"
          onClose={() => setRecipeTarget(null)}
          onSubmit={handleRecipe}
          footer={
            <>
              <SecondaryBtn onClick={() => setRecipeTarget(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-teal-700 hover:bg-teal-800">Guardar</PrimaryBtn>
            </>
          }
        >
          {recipeLines.length === 0 && <EmptyText>No descuenta nada todavía.</EmptyText>}
          {recipeLines.map((l, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Field label="Producto">
                  <select
                    value={l.inventory_product_id}
                    onChange={(e) =>
                      setRecipeLines((prev) => prev.map((x, j) => (j === i ? { ...x, inventory_product_id: e.target.value } : x)))
                    }
                    className={INPUT}
                  >
                    <option value="">— Elige —</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="w-24">
                <Field label="Cantidad">
                  <input
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => setRecipeLines((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                    className={INPUT}
                  />
                </Field>
              </div>
              <RowBtn title="Quitar" onClick={() => setRecipeLines((prev) => prev.filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </RowBtn>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRecipeLines((prev) => [...prev, { inventory_product_id: '', quantity: '1' }])}
            className="w-full h-11 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Agregar producto
          </button>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: ANULAR COMPRA
      ===================================================================== */}
      {voidTarget && (
        <Modal
          color="bg-rose-700"
          icon={<Ban className="w-6 h-6" />}
          title="Anular compra"
          subtitle={`${formatCOP(voidTarget.total_amount)} · ${voidTarget.purchase_date}`}
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
            Los productos de esta compra se restan del inventario.
          </p>
          <Field label="¿Por qué se anula?">
            <input
              required
              autoFocus
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Ej: La registré dos veces"
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

function BigAction({
  color,
  icon,
  title,
  hint,
  onClick,
  disabled
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full min-h-[88px] p-4 rounded-2xl text-white flex items-center gap-3 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-base sm:text-lg font-black leading-tight">{title}</span>
        <span className="block text-xs sm:text-sm font-semibold text-white/85">{hint}</span>
      </span>
    </button>
  );
}

function RowBtn({
  title,
  onClick,
  cls = 'bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:border-slate-600',
  children
}: {
  title: string;
  onClick: () => void;
  cls?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 cursor-pointer ${cls}`}
    >
      {children}
    </button>
  );
}

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-14 h-12 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 flex items-center justify-center shrink-0 cursor-pointer hover:border-slate-600"
    >
      {children}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 px-3 rounded-xl border-2 text-sm font-bold cursor-pointer ${
        on
          ? 'bg-teal-700 border-teal-700 text-white'
          : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-700 dark:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
