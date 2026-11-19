import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  BedDouble,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Wallet
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import { getTodayString } from '../utils/date';

async function apiRequest(method: string, path: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
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

const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const loadImageAsDataUrl = (src: string): Promise<string | null> =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

interface ReportsPayload {
  hotel: {
    id: number;
    name: string;
    legal_name?: string;
    tax_id?: string;
    address?: string;
    city?: string;
    phone?: string;
    logo_url?: string;
    sire_code?: string;
    tra_code?: string;
  };
  filters: {
    from_date: string;
    to_date: string;
    days_in_period: number;
    department: string;
  };
  filter_options: {
    rooms: { id: number; number: string }[];
    users: { id: number; full_name: string; role: string }[];
    payment_methods: { id: number; name: string }[];
  };
  occupancy: {
    total_rooms: number;
    total_available_room_nights: number;
    total_occupied_room_nights: number;
    occupancy_rate: number;
    daily: { date: string; occupied_rooms: number; total_rooms: number; occupancy_rate: number }[];
    monthly: { month: string; stays_count: number; occupied_nights: number; lodging_revenue: number }[];
    by_room_type: {
      room_type_name: string;
      rooms_count: number;
      stays_count: number;
      occupied_nights: number;
      occupancy_rate: number;
      lodging_revenue: number;
    }[];
    by_season: { season: string; stays_count: number; occupied_nights: number; lodging_revenue: number }[];
  };
  revenue: {
    lodging_revenue: number;
    services_revenue: number;
    total_revenue: number;
    adr: number;
    revpar: number;
    by_room: {
      room_id: number;
      room_number: string;
      room_type_name: string;
      lodging_revenue: number;
      services_revenue: number;
      total_revenue: number;
    }[];
    by_department: { department: string; amount: number }[];
  };
  reservations: {
    summary: {
      total: number;
      pendientes: number;
      confirmadas: number;
      checked_in: number;
      canceladas: number;
      no_shows: number;
      total_quoted_amount: number;
    };
    list: {
      id: number;
      code: string;
      guest_name: string;
      check_in_expected: string;
      check_out_expected: string;
      status: string;
      total_price: number;
      cancellation_reason?: string;
    }[];
    cancellations_and_noshows: {
      id: number;
      code: string;
      guest_name: string;
      check_in_expected: string;
      status: string;
      cancellation_reason?: string;
      total_price: number;
    }[];
  };
  legal_guests: {
    stay_id: number;
    room_number: string;
    guest_name: string;
    doc_type: string;
    document: string;
    nationality: string;
    origin_city: string;
    destination_city: string;
    travel_purpose: string;
    check_in_time: string;
    check_out_time: string;
    status: string;
    companions_count: number;
  }[];
  finance: {
    total_cash_income: number;
    total_cash_expense: number;
    net_cash_flow: number;
    by_payment_method: { method: string; amount: number }[];
    by_user: { user_name: string; amount: number }[];
    expenses_by_category: { category: string; amount: number }[];
    purchases_count: number;
    purchases_total: number;
    purchases: { id: number; order_number: string; supplier_name: string; purchase_date: string; total_amount: number }[];
    inventory_valuation: number;
    inventory_by_department: { department: string; items_count: number; valuation: number }[];
    maintenance_cost: number;
    profitability: {
      effective_revenue: number;
      total_costs_expenses: number;
      net_profit: number;
      margin_pct: number;
    };
  };
}

export default function Reportes() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const canExport = hasPermission('reports.export') || hasPermission('reports.view');

  const today = getTodayString();
  const monthStart = `${today.substring(0, 7)}-01`;

  const [activeTab, setActiveTab] = useState<
    'OCUPACION' | 'INGRESOS' | 'LEGAL' | 'FINANZAS' | 'RENTABILIDAD'
  >('OCUPACION');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportsPayload | null>(null);

  const [filters, setFilters] = useState({
    from_date: monthStart,
    to_date: today,
    department: 'ALL',
    room_id: '',
    payment_method: 'ALL',
    user_id: ''
  });

  const fetchReports = useCallback(async () => {
    if (!activeHotelId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
        department: filters.department,
        payment_method: filters.payment_method,
        ...(filters.room_id ? { room_id: filters.room_id } : {}),
        ...(filters.user_id ? { user_id: filters.user_id } : {})
      });
      const res = await apiRequest('GET', `/hotels/${activeHotelId}/reports/overview?${q.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reportes.');
    } finally {
      setLoading(false);
    }
  }, [activeHotelId, filters]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleExportPdf = async () => {
    if (!data) return;
    const doc = new jsPDF();
    const logoDataUrl = await loadImageAsDataUrl(data.hotel.logo_url || '/logo.png');

    // Membrete profesional con Logo
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 14, 10, 22, 22);
    }
    const textX = logoDataUrl ? 40 : 14;
    doc.setFontSize(14);
    doc.text(data.hotel.legal_name || data.hotel.name || activeHotel?.name || 'Hotel PMS', textX, 16);
    doc.setFontSize(9);
    doc.text(
      `NIT: ${data.hotel.tax_id || 'N/A'} | ${data.hotel.city || ''} | Tel: ${data.hotel.phone || 'N/A'}`,
      textX,
      22
    );
    doc.text(
      `SIRE: ${data.hotel.sire_code || 'N/A'} | TRA: ${data.hotel.tra_code || 'N/A'} | Periodo: ${
        data.filters.from_date
      } al ${data.filters.to_date}`,
      textX,
      27
    );
    doc.line(14, 34, 196, 34);

    let y = 41;
    doc.setFontSize(12);
    const titleMap = {
      OCUPACION: 'Reporte Ejecutivo de Ocupación Hotelera',
      INGRESOS: 'Reporte de Ingresos, ADR y RevPAR',
      LEGAL: 'Reporte de Reservas y Listado Legal de Huéspedes (SIRE/TRA)',
      FINANZAS: 'Reporte de Caja, Compras, Gastos e Inventario',
      RENTABILIDAD: 'Reporte Consolidado de Rentabilidad Hotelera'
    };
    doc.text(titleMap[activeTab], 14, y);
    y += 6;

    if (activeTab === 'OCUPACION') {
      autoTable(doc, {
        startY: y,
        head: [['Tipo de Habitación', 'Habs.', 'Estadías', 'Noches Ocup.', '% Ocupación', 'Ingresos Aloj.']],
        body: data.occupancy.by_room_type.map((r) => [
          r.room_type_name,
          r.rooms_count,
          r.stays_count,
          r.occupied_nights,
          `${r.occupancy_rate}%`,
          formatCOP(r.lodging_revenue)
        ])
      });
      const y2 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 30;
      autoTable(doc, {
        startY: y2 + 6,
        head: [['Temporada', 'Estadías', 'Noches Ocupadas', 'Ingresos Alojamiento']],
        body: data.occupancy.by_season.map((s) => [
          s.season,
          s.stays_count,
          s.occupied_nights,
          formatCOP(s.lodging_revenue)
        ])
      });
    } else if (activeTab === 'INGRESOS') {
      autoTable(doc, {
        startY: y,
        head: [['Habitación', 'Tipo', 'Alojamiento', 'Servicios / POS', 'Total Habitación']],
        body: data.revenue.by_room.map((r) => [
          `#${r.room_number}`,
          r.room_type_name,
          formatCOP(r.lodging_revenue),
          formatCOP(r.services_revenue),
          formatCOP(r.total_revenue)
        ])
      });
    } else if (activeTab === 'LEGAL') {
      autoTable(doc, {
        startY: y,
        head: [['Hab.', 'Huésped', 'Documento', 'Nacionalidad', 'Origen -> Destino', 'Ingreso / Salida', 'Acomp.']],
        body: data.legal_guests.map((g) => [
          `#${g.room_number}`,
          g.guest_name,
          `${g.doc_type} ${g.document}`,
          g.nationality,
          `${g.origin_city || '-'} -> ${g.destination_city || '-'}`,
          `${g.check_in_time} / ${g.check_out_time}`,
          g.companions_count
        ])
      });
    } else if (activeTab === 'FINANZAS') {
      autoTable(doc, {
        startY: y,
        head: [['Método de Pago', 'Total Ingresos']],
        body: data.finance.by_payment_method.map((m) => [m.method, formatCOP(m.amount)])
      });
      const y2 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 30;
      autoTable(doc, {
        startY: y2 + 6,
        head: [['Departamento Inventario', 'Ítems', 'Valorización']],
        body: data.finance.inventory_by_department.map((d) => [
          d.department,
          d.items_count,
          formatCOP(d.valuation)
        ])
      });
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Concepto Financiero', 'Valor']],
        body: [
          ['Ingresos Totales del Periodo', formatCOP(data.finance.profitability.effective_revenue)],
          ['Egresos de Caja', formatCOP(data.finance.total_cash_expense)],
          ['Compras Inventario Recibidas', formatCOP(data.finance.purchases_total)],
          ['Costos de Mantenimiento', formatCOP(data.finance.maintenance_cost)],
          ['Total Costos y Gastos', formatCOP(data.finance.profitability.total_costs_expenses)],
          ['UTILIDAD NETA OPERATIVA', formatCOP(data.finance.profitability.net_profit)],
          ['Margen de Rentabilidad', `${data.finance.profitability.margin_pct}%`]
        ]
      });
    }

    doc.save(`reporte-${activeTab.toLowerCase()}-${data.filters.from_date}-a-${data.filters.to_date}.pdf`);
  };

  const handleExportCsv = () => {
    if (!data) return;
    if (activeTab === 'OCUPACION') {
      downloadCsv(
        `ocupacion-${data.filters.from_date}-${data.filters.to_date}.csv`,
        ['Fecha', 'Habitaciones Ocupadas', 'Total Habitaciones', '% Ocupacion'],
        data.occupancy.daily.map((d) => [d.date, d.occupied_rooms, d.total_rooms, `${d.occupancy_rate}%`])
      );
    } else if (activeTab === 'INGRESOS') {
      downloadCsv(
        `ingresos-habitacion-${data.filters.from_date}-${data.filters.to_date}.csv`,
        ['Habitacion', 'Tipo', 'Alojamiento', 'Servicios', 'Total'],
        data.revenue.by_room.map((r) => [
          r.room_number,
          r.room_type_name,
          r.lodging_revenue,
          r.services_revenue,
          r.total_revenue
        ])
      );
    } else if (activeTab === 'LEGAL') {
      downloadCsv(
        `huespedes-legal-sire-tra-${data.filters.from_date}-${data.filters.to_date}.csv`,
        ['Habitacion', 'Huesped', 'Tipo Doc', 'Documento', 'Nacionalidad', 'Origen', 'Destino', 'Motivo', 'Check-in', 'Check-out', 'Acompanantes'],
        data.legal_guests.map((g) => [
          g.room_number,
          g.guest_name,
          g.doc_type,
          g.document,
          g.nationality,
          g.origin_city,
          g.destination_city,
          g.travel_purpose,
          g.check_in_time,
          g.check_out_time,
          g.companions_count
        ])
      );
    } else if (activeTab === 'FINANZAS') {
      downloadCsv(
        `finanzas-compras-${data.filters.from_date}-${data.filters.to_date}.csv`,
        ['Orden Compra', 'Proveedor', 'Fecha', 'Total'],
        data.finance.purchases.map((p) => [p.order_number, p.supplier_name, p.purchase_date, p.total_amount])
      );
    } else {
      downloadCsv(
        `rentabilidad-${data.filters.from_date}-${data.filters.to_date}.csv`,
        ['Concepto', 'Valor'],
        [
          ['Ingresos Efectivos', data.finance.profitability.effective_revenue],
          ['Costos y Gastos', data.finance.profitability.total_costs_expenses],
          ['Utilidad Neta', data.finance.profitability.net_profit],
          ['Margen %', data.finance.profitability.margin_pct]
        ]
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Reportes y Estadísticas Hoteleras
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ocupación, ADR, RevPAR, Reservas, Control Legal SIRE/TRA, Caja, Inventario y Rentabilidad ·{' '}
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {activeHotel?.name}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canExport && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={!data}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-40"
              >
                <FileText className="w-4 h-4" />
                Exportar PDF
              </button>
              <button
                onClick={handleExportCsv}
                disabled={!data}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel / CSV
              </button>
            </>
          )}
          <button
            onClick={fetchReports}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">{error}</div>
      )}

      {/* Filtros Dinámicos */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
        <div>
          <label className="font-bold text-slate-500 block mb-1">Desde</label>
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          />
        </div>
        <div>
          <label className="font-bold text-slate-500 block mb-1">Hasta</label>
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          />
        </div>
        <div>
          <label className="font-bold text-slate-500 block mb-1">Departamento</label>
          <select
            value={filters.department}
            onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="ALL">Todos</option>
            <option value="ALOJAMIENTO">Alojamiento</option>
            <option value="RESTAURANTE">Restaurante</option>
            <option value="CAFETERIA">Cafetería</option>
            <option value="ROOM_SERVICE">Room Service</option>
            <option value="MINIBAR">Minibar</option>
            <option value="LAVANDERIA">Lavandería</option>
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-500 block mb-1">Habitación</label>
          <select
            value={filters.room_id}
            onChange={(e) => setFilters((f) => ({ ...f, room_id: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="">Todas</option>
            {data?.filter_options.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Hab. #{r.number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-500 block mb-1">Método de Pago</label>
          <select
            value={filters.payment_method}
            onChange={(e) => setFilters((f) => ({ ...f, payment_method: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="ALL">Todos</option>
            {data?.filter_options.payment_methods.map((pm) => (
              <option key={pm.id} value={pm.name}>
                {pm.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-bold text-slate-500 block mb-1">Usuario</label>
          <select
            value={filters.user_id}
            onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="">Todos</option>
            {data?.filter_options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs principales */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Ocupación Periodo</p>
            <p className="text-xl font-bold text-cyan-600 mt-1">{data.occupancy.occupancy_rate}%</p>
            <p className="text-[11px] text-slate-400">
              {data.occupancy.total_occupied_room_nights}/{data.occupancy.total_available_room_nights} noches
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">ADR (Tarifa Promedio)</p>
            <p className="text-xl font-bold text-indigo-600 mt-1">{formatCOP(data.revenue.adr)}</p>
            <p className="text-[11px] text-slate-400">Por noche ocupada</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">RevPAR</p>
            <p className="text-xl font-bold text-violet-600 mt-1">{formatCOP(data.revenue.revpar)}</p>
            <p className="text-[11px] text-slate-400">Por habitación disponible</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Ingresos Periodo</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{formatCOP(data.revenue.total_revenue)}</p>
            <p className="text-[11px] text-slate-400">
              Aloj: {formatCOP(data.revenue.lodging_revenue)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Rentabilidad Neta</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {data.finance.profitability.margin_pct}%
            </p>
            <p className="text-[11px] text-slate-400">
              {formatCOP(data.finance.profitability.net_profit)}
            </p>
          </div>
        </div>
      )}

      {/* Pestañas */}
      <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800">
        {[
          { id: 'OCUPACION', label: 'Ocupación', icon: BedDouble },
          { id: 'INGRESOS', label: 'Ingresos / ADR / RevPAR', icon: DollarSign },
          { id: 'LEGAL', label: 'Reservas y Listado Legal SIRE/TRA', icon: ShieldCheck },
          { id: 'FINANZAS', label: 'Caja, Compras e Inventario', icon: Wallet },
          { id: 'RENTABILIDAD', label: 'Rentabilidad', icon: TrendingUp }
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
                activeTab === t.id ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* CONTENIDO DE PESTAÑAS */}
      {data && activeTab === 'OCUPACION' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">Ocupación por Tipo de Habitación</h3>
            <div className="table-scroll">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase text-slate-500 border-b">
                  <tr>
                    <th className="py-2">Tipo</th>
                    <th className="py-2 text-right">Estadías</th>
                    <th className="py-2 text-right">Noches</th>
                    <th className="py-2 text-right">% Ocup.</th>
                    <th className="py-2 text-right">Alojamiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.occupancy.by_room_type.map((r) => (
                    <tr key={r.room_type_name}>
                      <td className="py-2 font-bold">{r.room_type_name}</td>
                      <td className="py-2 text-right">{r.stays_count}</td>
                      <td className="py-2 text-right">{r.occupied_nights}</td>
                      <td className="py-2 text-right font-bold">{r.occupancy_rate}%</td>
                      <td className="py-2 text-right">{formatCOP(r.lodging_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">Ocupación por Temporada y Mes</h3>
            <div className="table-scroll">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase text-slate-500 border-b">
                  <tr>
                    <th className="py-2">Temporada</th>
                    <th className="py-2 text-right">Estadías</th>
                    <th className="py-2 text-right">Noches</th>
                    <th className="py-2 text-right">Ingresos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.occupancy.by_season.map((s) => (
                    <tr key={s.season}>
                      <td className="py-2 font-bold">{s.season}</td>
                      <td className="py-2 text-right">{s.stays_count}</td>
                      <td className="py-2 text-right">{s.occupied_nights}</td>
                      <td className="py-2 text-right">{formatCOP(s.lodging_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4 className="font-bold pt-2 text-slate-500 uppercase text-[10px]">Serie Diaria Reciente</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {data.occupancy.daily.slice(-14).map((d) => (
                <div key={d.date} className="flex items-center gap-2">
                  <span className="w-20 font-mono">{d.date}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-cyan-600 h-full" style={{ width: `${Math.min(100, d.occupancy_rate)}%` }} />
                  </div>
                  <span className="w-24 text-right font-semibold">
                    {d.occupied_rooms}/{d.total_rooms} ({d.occupancy_rate}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && activeTab === 'INGRESOS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">Ingresos por Habitación</h3>
            <div className="table-scroll">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase text-slate-500 border-b">
                  <tr>
                    <th className="py-2">Habitación</th>
                    <th className="py-2">Tipo</th>
                    <th className="py-2 text-right">Alojamiento</th>
                    <th className="py-2 text-right">Servicios</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.revenue.by_room.map((r) => (
                    <tr key={r.room_id}>
                      <td className="py-2 font-bold">Hab. #{r.room_number}</td>
                      <td className="py-2">{r.room_type_name}</td>
                      <td className="py-2 text-right">{formatCOP(r.lodging_revenue)}</td>
                      <td className="py-2 text-right">{formatCOP(r.services_revenue)}</td>
                      <td className="py-2 text-right font-extrabold">{formatCOP(r.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold">Ingresos por Departamento / Servicio</h3>
            <div className="space-y-2">
              {data.revenue.by_department.map((d) => (
                <div key={d.department} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-semibold">{d.department}</span>
                  <span className="font-bold">{formatCOP(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && activeTab === 'LEGAL' && (
        <div className="space-y-4 text-xs">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div><p className="text-slate-500">Total Reservas</p><p className="text-lg font-bold">{data.reservations.summary.total}</p></div>
            <div><p className="text-slate-500">Pendientes</p><p className="text-lg font-bold text-amber-600">{data.reservations.summary.pendientes}</p></div>
            <div><p className="text-slate-500">Confirmadas</p><p className="text-lg font-bold text-indigo-600">{data.reservations.summary.confirmadas}</p></div>
            <div><p className="text-slate-500">Check-in</p><p className="text-lg font-bold text-emerald-600">{data.reservations.summary.checked_in}</p></div>
            <div><p className="text-slate-500">Canceladas</p><p className="text-lg font-bold text-rose-600">{data.reservations.summary.canceladas}</p></div>
            <div><p className="text-slate-500">No-Shows</p><p className="text-lg font-bold text-rose-700">{data.reservations.summary.no_shows}</p></div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto space-y-3">
            <h3 className="text-sm font-bold">
              Listado Legal de Huéspedes (Formato Migratorio / SIRE: {data.hotel.sire_code || 'N/A'} · TRA: {data.hotel.tra_code || 'N/A'})
            </h3>
            <div className="table-scroll">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Hab.</th>
                    <th className="px-3 py-2">Huésped Titular</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Nacionalidad</th>
                    <th className="px-3 py-2">Origen / Destino</th>
                    <th className="px-3 py-2">Check-in / Salida</th>
                    <th className="px-3 py-2 text-right">Acomp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.legal_guests.map((g) => (
                    <tr key={g.stay_id}>
                      <td className="px-3 py-2 font-bold">#{g.room_number}</td>
                      <td className="px-3 py-2 font-semibold">{g.guest_name}</td>
                      <td className="px-3 py-2">{g.doc_type} {g.document}</td>
                      <td className="px-3 py-2">{g.nationality}</td>
                      <td className="px-3 py-2">{g.origin_city || '-'} → {g.destination_city || '-'}</td>
                      <td className="px-3 py-2">{g.check_in_time} / {g.check_out_time}</td>
                      <td className="px-3 py-2 text-right">{g.companions_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data && activeTab === 'FINANZAS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-sm font-bold">Caja por Método de Pago</h3>
            <p className="text-slate-500">Ingresos: <b className="text-emerald-600">{formatCOP(data.finance.total_cash_income)}</b> · Egresos: <b className="text-rose-600">{formatCOP(data.finance.total_cash_expense)}</b></p>
            {data.finance.by_payment_method.map((m) => (
              <div key={m.method} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span>{m.method}</span><b>{formatCOP(m.amount)}</b>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-sm font-bold">Gastos y Compras ({data.finance.purchases_count})</h3>
            <p className="text-slate-500">Total Compras: <b>{formatCOP(data.finance.purchases_total)}</b></p>
            {data.finance.expenses_by_category.map((e) => (
              <div key={e.category} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span>{e.category}</span><b>{formatCOP(e.amount)}</b>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-sm font-bold">Valorización de Inventario</h3>
            <p className="text-lg font-extrabold text-teal-600">{formatCOP(data.finance.inventory_valuation)}</p>
            {data.finance.inventory_by_department.map((d) => (
              <div key={d.department} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span>{d.department} ({d.items_count})</span><b>{formatCOP(d.valuation)}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && activeTab === 'RENTABILIDAD' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl space-y-3 text-sm">
          <h3 className="text-base font-bold">Análisis de Rentabilidad del Periodo</h3>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span>Ingresos Operativos Efectivos</span>
            <b className="text-emerald-600">{formatCOP(data.finance.profitability.effective_revenue)}</b>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span>Egresos de Caja + Compras + Mantenimiento</span>
            <b className="text-rose-600">{formatCOP(data.finance.profitability.total_costs_expenses)}</b>
          </div>
          <div className="flex justify-between py-2 text-base font-extrabold">
            <span>Utilidad Neta Operativa ({data.finance.profitability.margin_pct}%)</span>
            <span className={data.finance.profitability.net_profit >= 0 ? 'text-indigo-600' : 'text-rose-600'}>
              {formatCOP(data.finance.profitability.net_profit)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

