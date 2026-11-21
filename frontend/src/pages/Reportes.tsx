import React, { useEffect, useState } from 'react';
import {
  FileBarChart2,
  Wallet,
  BedDouble,
  UtensilsCrossed,
  Boxes,
  Users,
  LayoutDashboard,
  Eye,
  Download,
  Loader2,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import { getTodayString } from '../utils/date';
import { Field, INPUT, Notice, SURFACE } from '../components/ModuleUI';
import {
  buildReportPdf,
  pdfDate,
  pdfDateTime,
  pdfMoney,
  pdfNumber,
  type HotelInfo,
  type ReportSpec,
  type RGB
} from '../utils/pdfReport';

/* =========================================================================
   UTILIDADES
========================================================================= */

type Period = 'HOY' | 'SEMANA' | 'MES' | 'MES_PASADO' | 'FECHAS';

const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmt(d);
};
const rangeOf = (p: Period, today: string) => {
  if (p === 'HOY') return { from: today, to: today };
  if (p === 'SEMANA') return { from: daysAgo(6), to: today };
  if (p === 'MES') return { from: `${today.slice(0, 7)}-01`, to: today };
  const [y, m] = today.split('-').map(Number);
  const first = new Date(y, m - 2, 1);
  const last = new Date(y, m - 1, 0);
  return { from: fmt(first), to: fmt(last) };
};
const inRange = (d: string | null | undefined, from: string, to: string) => {
  const s = String(d || '').slice(0, 10);
  return !!s && s >= from && s <= to;
};
const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const pct = (v: number) => `${pdfNumber(v, 1)}%`;

const PAY_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Nequi / Transf.',
  TARJETA: 'Tarjeta'
};
const payLabel = (m: string) => PAY_LABEL[m] || m || '-';

/** Junta filas cuyo nombre de forma de pago es el mismo aunque venga escrito distinto. */
const mergeByPay = (rows: any[], key: string, fields: string[]) => {
  const map = new Map<string, any>();
  rows.forEach((r) => {
    const raw = String(r[key] || '').trim();
    // "EFECTIVO" y "Efectivo" son lo mismo: se agrupan bajo el mismo nombre
    const label = PAY_LABEL[raw.toUpperCase()] || raw || 'Otro';
    const e = map.get(label) || { [key]: label, ...Object.fromEntries(fields.map((f) => [f, 0])) };
    fields.forEach((f) => (e[f] += Number(r[f] || 0)));
    map.set(label, e);
  });
  return [...map.values()];
};

const SUBTYPE_LABEL: Record<string, string> = {
  INGRESO: 'Entrada',
  EGRESO: 'Gasto',
  PAGO_HUESPED: 'Cobro habitación',
  ABONO: 'Abono',
  ANTICIPO: 'Anticipo reserva',
  PAGO_SERVICIO: 'Venta servicio',
  DEVOLUCION: 'Devolución'
};

const STATUS_LABEL: Record<string, string> = {
  ABIERTA: 'Abierta',
  CERRADA: 'Cerrada',
  ACTIVA: 'Alojado',
  FINALIZADA: 'Finalizada',
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  CHECKED_IN: 'Llegó',
  CANCELADA: 'Cancelada',
  NO_SHOW: 'No llegó',
  PAGADA: 'Pagado',
  CARGADA_HABITACION: 'A habitación',
  ANULADA: 'Anulada',
  RECIBIDA: 'Recibida',
  BORRADOR: 'Por recibir',
  COMPLETADA: 'Completada',
  APROBADA: 'Aprobada',
  EN_PROCESO: 'En proceso',
  RESUELTO: 'Resuelto',
  RESUELTA: 'Resuelta',
  EN_PROGRESO: 'En progreso',
  PROGRAMADO: 'Programado',
  EN_TURNO: 'Trabajando',
  COMPLETADO: 'Terminó',
  AUSENTE: 'No vino'
};
const st = (s: string) => STATUS_LABEL[s] || (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '-');

const STOCK_LABEL: Record<string, string> = {
  AGOTADO: 'Se acabó',
  CRITICO: 'Queda poco',
  REPOSICION: 'Reponer',
  NORMAL: 'Suficiente'
};

/* =========================================================================
   CATÁLOGO DE REPORTES
========================================================================= */

interface Ctx {
  get: (path: string) => Promise<any>;
  from: string;
  to: string;
}

interface ReportDef {
  id: string;
  title: string;
  description: string;
  /** false = reporte "a la fecha" (no usa el periodo) */
  usesPeriod: boolean;
  build: (ctx: Ctx) => Promise<Omit<ReportSpec, 'category' | 'color' | 'fileName' | 'title' | 'period'> & { title?: string }>;
}

interface ReportGroup {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  color: RGB;
  tw: { bg: string; text: string; border: string; soft: string };
  reports: ReportDef[];
}

const GROUPS: ReportGroup[] = [
  /* ---------------------------------------------------------------- */
  {
    id: 'GENERAL',
    label: 'Resumen general',
    hint: 'La foto completa del negocio',
    icon: <LayoutDashboard className="w-5 h-5" />,
    color: [79, 70, 229],
    tw: { bg: 'bg-indigo-700', text: 'text-indigo-800 dark:text-indigo-200', border: 'border-indigo-300 dark:border-indigo-700', soft: 'bg-indigo-50 dark:bg-indigo-500/10' },
    reports: [
      {
        id: 'resumen',
        title: 'Resumen del negocio',
        description: 'Todo en una hoja: cuánto se ocupó, cuánto entró, cuánto se gastó y cuánto se ganó.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/reports/overview?from_date=${from}&to_date=${to}`);
          const f = d.finance || {};
          const p = f.profitability || {};
          return {
            kpis: [
              { label: 'Ocupación', value: pct(d.occupancy?.occupancy_rate || 0) },
              { label: 'Ingresos totales', value: pdfMoney(d.revenue?.total_revenue), tone: 'good' },
              { label: 'Alojamiento', value: pdfMoney(d.revenue?.lodging_revenue) },
              { label: 'Servicios', value: pdfMoney(d.revenue?.services_revenue) },
              { label: 'Entró a caja', value: pdfMoney(f.total_cash_income), tone: 'good' },
              { label: 'Salió de caja', value: pdfMoney(f.total_cash_expense), tone: 'bad' },
              { label: 'Flujo neto de caja', value: pdfMoney(f.net_cash_flow), tone: Number(f.net_cash_flow) >= 0 ? 'good' : 'bad' },
              { label: 'Utilidad neta', value: `${pdfMoney(p.net_profit)} (${pct(p.margin_pct || 0)})`, tone: Number(p.net_profit) >= 0 ? 'good' : 'bad' },
              { label: 'Tarifa promedio (ADR)', value: pdfMoney(d.revenue?.adr) },
              { label: 'Ingreso por hab. disponible', value: pdfMoney(d.revenue?.revpar) },
              { label: 'Compras del periodo', value: pdfMoney(f.purchases_total) },
              { label: 'Valor del inventario', value: pdfMoney(f.inventory_valuation) }
            ],
            sections: [
              {
                title: 'Dinero recibido por forma de pago',
                head: ['Forma de pago', 'Valor'],
                body: mergeByPay(f.by_payment_method || [], 'method', ['amount']).map((x: any) => [x.method, pdfMoney(x.amount)]),
                foot: ['Total', pdfMoney(sum(f.by_payment_method || [], (x: any) => x.amount))]
              },
              {
                title: 'Gastos por categoría',
                head: ['Categoría', 'Valor'],
                body: (f.expenses_by_category || []).map((x: any) => [x.category || 'Sin categoría', pdfMoney(x.amount)]),
                foot: ['Total', pdfMoney(sum(f.expenses_by_category || [], (x: any) => x.amount))]
              },
              {
                title: 'Ocupación por tipo de habitación',
                head: ['Tipo', 'Habitaciones', 'Estadías', 'Noches ocupadas', 'Ocupación', 'Ingreso alojamiento'],
                body: (d.occupancy?.by_room_type || []).map((x: any) => [
                  x.room_type_name || 'Sin tipo',
                  pdfNumber(x.rooms_count),
                  pdfNumber(x.stays_count),
                  pdfNumber(x.occupied_nights),
                  pct(x.occupancy_rate || 0),
                  pdfMoney(x.lodging_revenue)
                ])
              },
              {
                title: 'Rentabilidad',
                head: ['Concepto', 'Valor'],
                body: [
                  ['Ingresos efectivos', pdfMoney(p.effective_revenue)],
                  ['Costos y gastos', pdfMoney(p.total_costs_expenses)],
                  ['Costo de mantenimiento', pdfMoney(f.maintenance_cost)],
                  ['Utilidad neta', pdfMoney(p.net_profit)],
                  ['Margen', pct(p.margin_pct || 0)]
                ]
              }
            ]
          };
        }
      }
    ]
  },
  /* ---------------------------------------------------------------- */
  {
    id: 'CAJA',
    label: 'Caja y dinero',
    hint: 'Entradas, salidas, gastos y cierres',
    icon: <Wallet className="w-5 h-5" />,
    color: [5, 150, 105],
    tw: { bg: 'bg-emerald-700', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-300 dark:border-emerald-700', soft: 'bg-emerald-50 dark:bg-emerald-500/10' },
    reports: [
      {
        id: 'caja-movimientos',
        title: 'Movimientos de caja',
        description: 'Cada peso que entró y salió de la caja, con quién lo registró y cómo se pagó.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/cash/reports?startDate=${from}&endDate=${to}&includeVoided=1`);
          const t = d.totals || {};
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Entró', value: pdfMoney(t.total_income), tone: 'good' },
              { label: 'Salió', value: pdfMoney(t.total_expense), tone: 'bad' },
              { label: 'Quedó', value: pdfMoney(t.net_balance), tone: Number(t.net_balance) >= 0 ? 'good' : 'bad' },
              { label: 'Movimientos', value: pdfNumber(t.movements_count) },
              { label: 'Anulados', value: pdfNumber(t.voided_count) }
            ],
            sections: [
              {
                title: 'Detalle de movimientos',
                head: ['Fecha', 'Recibo', 'Tipo', 'Concepto', 'Forma de pago', 'Cajero', 'Valor', 'Estado'],
                widths: [11, 13, 13, 34, 13, 15, 14, 10],
                body: (d.movements || []).map((m: any) => {
                  const inc = String(m.type).toUpperCase() === 'INGRESO';
                  return [
                    pdfDate(m.date),
                    m.receipt_number || '-',
                    SUBTYPE_LABEL[m.movement_subtype] || (inc ? 'Entrada' : 'Salida'),
                    m.description || '-',
                    payLabel(m.payment_method),
                    m.cashier_name || '-',
                    `${inc ? '+' : '-'}${pdfMoney(m.amount)}`,
                    Number(m.voided) === 1 ? 'Anulado' : Number(m.is_compensating) === 1 ? 'Ajuste' : 'OK'
                  ];
                }),
                align: ['left', 'left', 'left', 'left', 'left', 'left', 'right', 'center']
              },
              {
                title: 'Por forma de pago',
                head: ['Forma de pago', 'Entró', 'Salió', 'Quedó'],
                body: mergeByPay(d.report_by_method || [], 'payment_method', ['income', 'expense', 'net']).map((x: any) => [x.payment_method, pdfMoney(x.income), pdfMoney(x.expense), pdfMoney(x.net)])
              },
              {
                title: 'Por día',
                head: ['Fecha', 'Entró', 'Salió', 'Quedó'],
                body: (d.report_by_date || []).map((x: any) => [pdfDate(x.date), pdfMoney(x.income), pdfMoney(x.expense), pdfMoney(x.net)])
              },
              {
                title: 'Por cajero',
                head: ['Cajero', 'Movimientos', 'Entró', 'Salió', 'Quedó'],
                body: (d.report_by_user || []).map((x: any) => [x.cashier_name, pdfNumber(x.movements_count), pdfMoney(x.income), pdfMoney(x.expense), pdfMoney(x.net)])
              }
            ]
          };
        }
      },
      {
        id: 'caja-gastos',
        title: 'Gastos y salidas',
        description: 'En qué se fue la plata: todos los gastos ordenados por tipo.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/cash/reports?startDate=${from}&endDate=${to}&type=EGRESO&includeVoided=0`);
          const movs = (d.movements || []).filter((m: any) => Number(m.voided) !== 1 && Number(m.is_compensating) !== 1);
          const byCat = new Map<string, { n: number; v: number }>();
          movs.forEach((m: any) => {
            const k = m.category || 'Sin categoría';
            const e = byCat.get(k) || { n: 0, v: 0 };
            e.n += 1;
            e.v += Number(m.amount || 0);
            byCat.set(k, e);
          });
          const total = sum(movs, (m: any) => m.amount);
          const cats = [...byCat.entries()].sort((a, b) => b[1].v - a[1].v);
          return {
            kpis: [
              { label: 'Total gastado', value: pdfMoney(total), tone: 'bad' },
              { label: 'Número de gastos', value: pdfNumber(movs.length) },
              { label: 'Mayor categoría', value: cats[0]?.[0] || '-' },
              { label: 'Gasto promedio', value: pdfMoney(movs.length ? total / movs.length : 0) }
            ],
            sections: [
              {
                title: 'Por categoría',
                head: ['Categoría', 'Cantidad', 'Valor', '% del total'],
                body: cats.map(([k, e]) => [k, pdfNumber(e.n), pdfMoney(e.v), pct(total ? (e.v / total) * 100 : 0)]),
                foot: ['Total', pdfNumber(movs.length), pdfMoney(total), '100%']
              },
              {
                title: 'Detalle de gastos',
                head: ['Fecha', 'Recibo', 'Concepto', 'Categoría', 'Forma de pago', 'Valor'],
                widths: [12, 14, 34, 18, 14, 14],
                body: movs.map((m: any) => [pdfDate(m.date), m.receipt_number || '-', m.description || '-', m.category || '-', payLabel(m.payment_method), pdfMoney(m.amount)])
              }
            ]
          };
        }
      },
      {
        id: 'caja-cierres',
        title: 'Cierres de turno y conteos',
        description: 'Cada turno de caja: cuánto debía haber, cuánto se contó y si sobró o faltó.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/cash/overview`);
          const regs = (d.recent_registers || []).filter((r: any) => inRange(r.opening_time, from, to));
          const audits = (d.recent_audits || []).filter((a: any) => inRange(a.created_at, from, to));
          const closed = regs.filter((r: any) => r.status === 'CERRADA');
          const ok = closed.filter((r: any) => Number(r.difference || 0) === 0).length;
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Turnos', value: pdfNumber(regs.length) },
              { label: 'Cerrados', value: pdfNumber(closed.length) },
              { label: 'Cuadraron', value: pdfNumber(ok), tone: 'good' },
              { label: 'Con diferencia', value: pdfNumber(closed.length - ok), tone: closed.length - ok ? 'bad' : 'neutral' },
              { label: 'Suma de diferencias', value: pdfMoney(sum(closed, (r: any) => r.difference)) }
            ],
            sections: [
              {
                title: 'Turnos de caja',
                head: ['Caja / turno', 'Responsable', 'Apertura', 'Cierre', 'Base', 'Debía haber', 'Contado', 'Diferencia', 'Estado'],
                widths: [20, 16, 13, 13, 11, 12, 12, 12, 9],
                body: regs.map((r: any) => [
                  `${r.name} (${String(r.shift || '').toLowerCase()})`,
                  r.operator_name || '-',
                  pdfDateTime(r.opening_time),
                  pdfDateTime(r.closing_time) || '-',
                  pdfMoney(r.opening_balance),
                  pdfMoney(r.expected_balance ?? r.summary?.expected_total),
                  r.closing_balance === null || r.closing_balance === undefined ? '-' : pdfMoney(r.closing_balance),
                  r.status === 'CERRADA' ? pdfMoney(r.difference) : '-',
                  st(r.status)
                ])
              },
              {
                title: 'Conteos de dinero (arqueos)',
                head: ['Fecha', 'Caja', 'Quién contó', 'Debía haber', 'Contado', 'Diferencia'],
                body: audits.map((a: any) => [pdfDateTime(a.created_at), a.register_name, a.auditor_name || '-', pdfMoney(a.total_expected), pdfMoney(a.total_counted), pdfMoney(a.total_difference)])
              }
            ]
          };
        }
      }
    ]
  },
  /* ---------------------------------------------------------------- */
  {
    id: 'HOTEL',
    label: 'Hotel y huéspedes',
    hint: 'Ocupación, alojados, reservas y registro',
    icon: <BedDouble className="w-5 h-5" />,
    color: [2, 132, 199],
    tw: { bg: 'bg-sky-700', text: 'text-sky-800 dark:text-sky-200', border: 'border-sky-300 dark:border-sky-700', soft: 'bg-sky-50 dark:bg-sky-500/10' },
    reports: [
      {
        id: 'ocupacion',
        title: 'Ocupación del hotel',
        description: 'Qué tan lleno estuvo el hotel cada día y por tipo de habitación.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/reports/overview?from_date=${from}&to_date=${to}`);
          const o = d.occupancy || {};
          return {
            kpis: [
              { label: 'Ocupación', value: pct(o.occupancy_rate || 0) },
              { label: 'Habitaciones', value: pdfNumber(o.total_rooms) },
              { label: 'Noches ocupadas', value: pdfNumber(o.total_occupied_room_nights) },
              { label: 'Noches disponibles', value: pdfNumber(o.total_available_room_nights) },
              { label: 'Tarifa promedio (ADR)', value: pdfMoney(d.revenue?.adr) },
              { label: 'Ingreso por hab. disponible', value: pdfMoney(d.revenue?.revpar) }
            ],
            sections: [
              {
                title: 'Ocupación por día',
                head: ['Fecha', 'Ocupadas', 'Total', 'Ocupación'],
                body: (o.daily || []).map((x: any) => [pdfDate(x.date), pdfNumber(x.occupied_rooms), pdfNumber(x.total_rooms), pct(x.occupancy_rate || 0)])
              },
              {
                title: 'Por tipo de habitación',
                head: ['Tipo', 'Habitaciones', 'Estadías', 'Noches ocupadas', 'Noches disponibles', 'Ocupación', 'Ingreso'],
                body: (o.by_room_type || []).map((x: any) => [
                  x.room_type_name || 'Sin tipo',
                  pdfNumber(x.rooms_count),
                  pdfNumber(x.stays_count),
                  pdfNumber(x.occupied_nights),
                  pdfNumber(x.available_nights),
                  pct(x.occupancy_rate || 0),
                  pdfMoney(x.lodging_revenue)
                ])
              },
              {
                title: 'Por temporada',
                head: ['Temporada', 'Estadías', 'Noches ocupadas', 'Ingreso'],
                body: (o.by_season || []).map((x: any) => [x.season, pdfNumber(x.stays_count), pdfNumber(x.occupied_nights), pdfMoney(x.lodging_revenue)])
              }
            ]
          };
        }
      },
      {
        id: 'ingresos-habitacion',
        title: 'Ingresos por habitación',
        description: 'Cuánta plata dejó cada habitación.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/reports/overview?from_date=${from}&to_date=${to}`);
          const rows = [...(d.revenue?.by_room || [])].sort((a: any, b: any) => b.total_revenue - a.total_revenue);
          return {
            kpis: [
              { label: 'Ingreso total', value: pdfMoney(d.revenue?.total_revenue), tone: 'good' },
              { label: 'Alojamiento', value: pdfMoney(d.revenue?.lodging_revenue) },
              { label: 'Servicios', value: pdfMoney(d.revenue?.services_revenue) },
              { label: 'Habitación que más produjo', value: rows[0] ? `Hab. ${rows[0].room_number}` : '-' }
            ],
            sections: [
              {
                title: 'Ingresos por habitación',
                head: ['Habitación', 'Tipo', 'Alojamiento', 'Servicios', 'Total'],
                body: rows.map((x: any) => [`Hab. ${x.room_number}`, x.room_type_name || '-', pdfMoney(x.lodging_revenue), pdfMoney(x.services_revenue), pdfMoney(x.total_revenue)]),
                foot: [
                  'Total',
                  '',
                  pdfMoney(sum(rows, (x: any) => x.lodging_revenue)),
                  pdfMoney(sum(rows, (x: any) => x.services_revenue)),
                  pdfMoney(sum(rows, (x: any) => x.total_revenue))
                ]
              }
            ]
          };
        }
      },
      {
        id: 'alojados',
        title: 'Huéspedes alojados',
        description: 'Quién está en cada habitación ahora, cuándo sale y cuánto debe.',
        usesPeriod: false,
        build: async ({ get }) => {
          const rows = (await get(`/reception/stays?status=ACTIVA`)) || [];
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Habitaciones ocupadas', value: pdfNumber(rows.length) },
              { label: 'Personas', value: pdfNumber(sum(rows, (s: any) => Number(s.adults || 1) + Number(s.children || 0))) },
              { label: 'Total cargado', value: pdfMoney(sum(rows, (s: any) => s.total_charges)) },
              { label: 'Saldo por cobrar', value: pdfMoney(sum(rows, (s: any) => s.balance)), tone: 'bad' }
            ],
            sections: [
              {
                title: 'Alojados actualmente',
                head: ['Hab.', 'Huésped', 'Documento', 'Teléfono', 'Entrada', 'Salida prevista', 'Forma de pago', 'Cargado', 'Pagado', 'Saldo'],
                widths: [7, 22, 13, 12, 11, 11, 12, 11, 11, 11],
                body: rows.map((s: any) => [
                  s.room_number,
                  s.guest_name,
                  `${s.doc_type || ''} ${s.guest_document || ''}`.trim(),
                  s.guest_phone || '-',
                  pdfDate(s.check_in_time),
                  pdfDate(s.expected_check_out) || '-',
                  s.payment_type || '-',
                  pdfMoney(s.total_charges),
                  pdfMoney(s.total_paid),
                  pdfMoney(s.balance)
                ])
              }
            ]
          };
        }
      },
      {
        id: 'cartera',
        title: 'Cuentas por cobrar',
        description: 'Huéspedes que deben plata, del que más debe al que menos.',
        usesPeriod: false,
        build: async ({ get }) => {
          const all = (await get(`/reception/stays?status=ALL`)) || [];
          const rows = all.filter((s: any) => Number(s.balance || 0) > 0).sort((a: any, b: any) => b.balance - a.balance);
          return {
            kpis: [
              { label: 'Total por cobrar', value: pdfMoney(sum(rows, (s: any) => s.balance)), tone: 'bad' },
              { label: 'Cuentas con saldo', value: pdfNumber(rows.length) },
              { label: 'De alojados', value: pdfMoney(sum(rows.filter((s: any) => s.status === 'ACTIVA'), (s: any) => s.balance)) },
              { label: 'De ya salidos', value: pdfMoney(sum(rows.filter((s: any) => s.status !== 'ACTIVA'), (s: any) => s.balance)) }
            ],
            sections: [
              {
                title: 'Saldos pendientes',
                head: ['Huésped', 'Hab.', 'Teléfono', 'Entrada', 'Estado', 'Cargado', 'Pagado', 'Debe'],
                widths: [24, 8, 13, 11, 11, 11, 11, 11],
                body: rows.map((s: any) => [
                  s.guest_name,
                  s.room_number,
                  s.guest_phone || '-',
                  pdfDate(s.check_in_time),
                  st(s.status),
                  pdfMoney(s.total_charges),
                  pdfMoney(s.total_paid),
                  pdfMoney(s.balance)
                ]),
                foot: ['Total', '', '', '', '', '', '', pdfMoney(sum(rows, (s: any) => s.balance))]
              }
            ]
          };
        }
      },
      {
        id: 'registro-huespedes',
        title: 'Libro de registro de huéspedes',
        description: 'Datos de cada huésped (documento, de dónde viene, para dónde va). Sirve para TRA y SIRE.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/reports/overview?from_date=${from}&to_date=${to}`);
          const rows = d.legal_guests || [];
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Registros', value: pdfNumber(rows.length) },
              { label: 'Acompañantes', value: pdfNumber(sum(rows, (g: any) => g.companions_count)) },
              { label: 'Extranjeros', value: pdfNumber(rows.filter((g: any) => g.nationality && !/colom/i.test(g.nationality)).length) },
              { label: 'RNT', value: d.hotel?.tra_code || 'Sin registrar' }
            ],
            sections: [
              {
                title: 'Registro de huéspedes',
                head: ['Hab.', 'Huésped', 'Tipo doc.', 'Documento', 'Nacionalidad', 'Procedencia', 'Destino', 'Motivo', 'Placa', 'Entrada', 'Salida', 'Acomp.'],
                widths: [6, 18, 7, 11, 10, 11, 11, 10, 8, 9, 9, 6],
                body: rows.map((g: any) => [
                  g.room_number,
                  g.guest_name,
                  g.doc_type || '-',
                  g.document || '-',
                  g.nationality || '-',
                  g.origin_city || '-',
                  g.destination_city || '-',
                  g.travel_purpose || '-',
                  g.vehicle_plate || '-',
                  pdfDate(g.check_in_time),
                  /^\d{4}-/.test(String(g.check_out_time || '')) ? pdfDate(g.check_out_time) : 'Sigue alojado',
                  pdfNumber(g.companions_count)
                ])
              }
            ]
          };
        }
      },
      {
        id: 'directorio',
        title: 'Directorio de huéspedes',
        description: 'Todos tus clientes con teléfono, correo y cuántas veces han venido.',
        usesPeriod: false,
        build: async ({ get }) => {
          const rows = ((await get(`/reception/guests`)) || []).sort((a: any, b: any) => Number(b.total_billed) - Number(a.total_billed));
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Huéspedes', value: pdfNumber(rows.length) },
              { label: 'Alojados ahora', value: pdfNumber(rows.filter((g: any) => Number(g.active_stays) > 0).length) },
              { label: 'Total facturado', value: pdfMoney(sum(rows, (g: any) => g.total_billed)) },
              { label: 'Saldo pendiente', value: pdfMoney(sum(rows, (g: any) => g.pending_balance)), tone: 'bad' }
            ],
            sections: [
              {
                title: 'Huéspedes',
                head: ['Nombre', 'Documento', 'Teléfono', 'Correo', 'Nacionalidad', 'Visitas', 'Última visita', 'Facturado', 'Debe'],
                widths: [20, 13, 12, 18, 11, 7, 11, 12, 11],
                body: rows.map((g: any) => [
                  g.full_name || `${g.first_name || ''} ${g.last_name || ''}`.trim(),
                  `${g.doc_type || ''} ${g.document || ''}`.trim() || '-',
                  g.phone || '-',
                  g.email || '-',
                  g.nationality || '-',
                  pdfNumber(g.total_stays),
                  pdfDate(g.last_visit_date) || '-',
                  pdfMoney(g.total_billed),
                  pdfMoney(g.pending_balance)
                ])
              }
            ]
          };
        }
      },
      {
        id: 'reservas',
        title: 'Reservas',
        description: 'Reservas que llegan en esas fechas, cuánto valen y cuánto ya abonaron.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/reports/overview?from_date=${from}&to_date=${to}`);
          const r = d.reservations || {};
          const s = r.summary || {};
          const list = r.list || [];
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Reservas', value: pdfNumber(s.total) },
              { label: 'Confirmadas', value: pdfNumber(s.confirmadas), tone: 'good' },
              { label: 'Pendientes', value: pdfNumber(s.pendientes) },
              { label: 'Llegaron', value: pdfNumber(s.checked_in) },
              { label: 'Canceladas / no llegaron', value: pdfNumber(Number(s.canceladas || 0) + Number(s.no_shows || 0)), tone: 'bad' },
              { label: 'Valor reservado', value: pdfMoney(s.total_quoted_amount) }
            ],
            sections: [
              {
                title: 'Listado de reservas',
                head: ['Código', 'Huésped', 'Llegada', 'Salida', 'Noches', 'Personas', 'Estado', 'Valor', 'Anticipo', 'Saldo'],
                body: list.map((x: any) => [
                  x.code || `RES-${x.id}`,
                  x.guest_name || x.group_name || '-',
                  pdfDate(x.check_in_expected),
                  pdfDate(x.check_out_expected),
                  pdfNumber(x.nights),
                  pdfNumber(Number(x.adults || 0) + Number(x.children || 0)),
                  st(x.status),
                  pdfMoney(x.total_price),
                  pdfMoney(x.advance_paid),
                  pdfMoney(Math.max(0, Number(x.total_price || 0) - Number(x.advance_paid || 0)))
                ]),
                foot: ['Total', '', '', '', '', '', '', pdfMoney(sum(list, (x: any) => x.total_price)), pdfMoney(sum(list, (x: any) => x.advance_paid)), '']
              },
              {
                title: 'Cancelaciones y no llegadas',
                head: ['Código', 'Huésped', 'Llegada', 'Estado', 'Motivo', 'Valor'],
                body: (r.cancellations_and_noshows || []).map((x: any) => [x.code || `RES-${x.id}`, x.guest_name || '-', pdfDate(x.check_in_expected), st(x.status), x.cancellation_reason || '-', pdfMoney(x.total_price)])
              }
            ]
          };
        }
      }
    ]
  },
  /* ---------------------------------------------------------------- */
  {
    id: 'SERVICIOS',
    label: 'Servicios',
    hint: 'Restaurante, lavandería y otros',
    icon: <UtensilsCrossed className="w-5 h-5" />,
    color: [217, 119, 6],
    tw: { bg: 'bg-amber-700', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-300 dark:border-amber-700', soft: 'bg-amber-50 dark:bg-amber-500/10' },
    reports: [
      {
        id: 'servicios-ventas',
        title: 'Ventas de servicios',
        description: 'Qué se vendió, a quién y si se pagó o se cargó a la habitación.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/services/reports?from_date=${from}&to_date=${to}&department=ALL&payment_mode=ALL`);
          const s = d.summary || {};
          const items = (o: any) =>
            (o.items || [])
              .filter((i: any) => i.status !== 'ANULADO')
              .map((i: any) => `${pdfNumber(i.quantity)} ${i.item_name}`)
              .join(', ');
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Vendido', value: pdfMoney(s.grand_total), tone: 'good' },
              { label: 'Pagado en caja', value: pdfMoney(s.direct_cash_total) },
              { label: 'Cargado a habitación', value: pdfMoney(s.room_charge_total) },
              { label: 'Ventas', value: pdfNumber(s.orders_count) },
              { label: 'Anulado', value: pdfMoney(s.voided_total), tone: 'bad' }
            ],
            sections: [
              {
                title: 'Por tipo de servicio',
                head: ['Servicio', 'Ventas', 'Pagado en caja', 'A habitación', 'Total'],
                body: (d.by_department || []).map((x: any) => [x.label || x.department, pdfNumber(x.orders_count), pdfMoney(x.direct_cash_total), pdfMoney(x.room_charge_total), pdfMoney(x.total_amount)])
              },
              {
                title: 'Detalle de ventas',
                head: ['Fecha', 'Orden', 'Qué se vendió', 'Hab. / cliente', 'Cómo se pagó', 'Estado', 'Total'],
                widths: [10, 12, 40, 13, 13, 11, 11],
                body: (d.orders || []).map((o: any) => [
                  pdfDate(o.order_date),
                  o.order_number,
                  items(o) || '-',
                  o.room_number ? `Hab. ${o.room_number}` : o.customer_name || 'Mostrador',
                  o.payment_mode === 'CARGO_HABITACION' ? 'A habitación' : o.payment_method || 'Caja',
                  st(o.status),
                  pdfMoney(o.total_amount)
                ])
              }
            ]
          };
        }
      },
      {
        id: 'servicios-productos',
        title: 'Productos más vendidos',
        description: 'Lo que más se vende, de primero a último.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/services/reports?from_date=${from}&to_date=${to}&department=ALL&payment_mode=ALL`);
          const rows = d.by_product || [];
          const total = sum(rows, (x: any) => x.total_sales);
          return {
            kpis: [
              { label: 'Total vendido', value: pdfMoney(total), tone: 'good' },
              { label: 'Unidades vendidas', value: pdfNumber(sum(rows, (x: any) => x.quantity_sold)) },
              { label: 'Productos distintos', value: pdfNumber(rows.length) },
              { label: 'El más vendido', value: rows[0]?.item_name || '-' }
            ],
            sections: [
              {
                title: 'Ranking de productos',
                head: ['#', 'Producto', 'Tipo', 'Cantidad', 'Total', '% de ventas'],
                widths: [5, 40, 18, 11, 15, 11],
                body: rows.map((x: any, i: number) => [
                  String(i + 1),
                  x.item_name,
                  x.department_label || x.department,
                  pdfNumber(x.quantity_sold),
                  pdfMoney(x.total_sales),
                  pct(total ? (x.total_sales / total) * 100 : 0)
                ])
              },
              {
                title: 'Ventas por habitación',
                head: ['Habitación', 'Ventas', 'Total'],
                body: (d.by_room || []).map((x: any) => [x.room_number ? `Hab. ${x.room_number}` : x.label || 'Mostrador', pdfNumber(x.orders_count), pdfMoney(x.total_amount)])
              }
            ]
          };
        }
      }
    ]
  },
  /* ---------------------------------------------------------------- */
  {
    id: 'INVENTARIO',
    label: 'Inventario',
    hint: 'Existencias, compras y movimientos',
    icon: <Boxes className="w-5 h-5" />,
    color: [13, 148, 136],
    tw: { bg: 'bg-teal-700', text: 'text-teal-800 dark:text-teal-200', border: 'border-teal-300 dark:border-teal-700', soft: 'bg-teal-50 dark:bg-teal-500/10' },
    reports: [
      {
        id: 'inventario-existencias',
        title: 'Existencias y valor del inventario',
        description: 'Cuánto hay de cada producto, cuánto vale y qué se está acabando.',
        usesPeriod: false,
        build: async ({ get }) => {
          const d = await get(`/inventory/overview`);
          const rows = (d.products || []).filter((p: any) => Number(p.active) !== 0);
          const byDept = new Map<string, { n: number; v: number }>();
          rows.forEach((p: any) => {
            const e = byDept.get(p.department || 'GENERAL') || { n: 0, v: 0 };
            e.n += 1;
            e.v += Number(p.valuation || 0);
            byDept.set(p.department || 'GENERAL', e);
          });
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Productos', value: pdfNumber(rows.length) },
              { label: 'Valor total', value: pdfMoney(sum(rows, (p: any) => p.valuation)), tone: 'good' },
              { label: 'Se acabaron', value: pdfNumber(rows.filter((p: any) => p.stock_status === 'AGOTADO').length), tone: 'bad' },
              { label: 'Quedan pocos', value: pdfNumber(rows.filter((p: any) => ['CRITICO', 'REPOSICION'].includes(p.stock_status)).length) }
            ],
            sections: [
              {
                title: 'Valor por área',
                head: ['Área', 'Productos', 'Valor'],
                body: [...byDept.entries()].map(([k, e]) => [k.charAt(0) + k.slice(1).toLowerCase(), pdfNumber(e.n), pdfMoney(e.v)])
              },
              {
                title: 'Existencias por producto',
                head: ['Producto', 'Área', 'Ubicación', 'Hay', 'Unidad', 'Mínimo', 'Costo unit.', 'Valor', 'Estado'],
                widths: [28, 11, 14, 8, 8, 8, 11, 12, 10],
                body: rows.map((p: any) => [
                  p.name,
                  (p.department || '').charAt(0) + (p.department || '').slice(1).toLowerCase(),
                  p.location || '-',
                  pdfNumber(p.stock, 2),
                  p.unit || 'UND',
                  pdfNumber(p.min_stock, 2),
                  pdfMoney(p.cost),
                  pdfMoney(p.valuation),
                  STOCK_LABEL[p.stock_status] || p.stock_status
                ]),
                foot: ['Total', '', '', '', '', '', '', pdfMoney(sum(rows, (p: any) => p.valuation)), '']
              }
            ]
          };
        }
      },
      {
        id: 'inventario-compras-sugeridas',
        title: 'Lista de compras sugerida',
        description: 'Lo que se acabó o se está acabando, cuánto comprar y cuánto costaría.',
        usesPeriod: false,
        build: async ({ get }) => {
          const d = await get(`/inventory/overview`);
          const rows = d.alerts || [];
          const est = (p: any) => Number(p.suggested_order_qty || 0) * Number(p.last_cost || p.cost || 0);
          return {
            kpis: [
              { label: 'Productos a comprar', value: pdfNumber(rows.length) },
              { label: 'Costo estimado', value: pdfMoney(sum(rows, est)) },
              { label: 'Se acabaron', value: pdfNumber(rows.filter((p: any) => p.stock_status === 'AGOTADO').length), tone: 'bad' }
            ],
            sections: [
              {
                title: 'Qué comprar',
                head: ['Producto', 'Hay', 'Mínimo', 'Comprar', 'Proveedor', 'Costo unit.', 'Costo estimado'],
                widths: [30, 9, 9, 10, 20, 11, 13],
                body: rows.map((p: any) => [
                  p.name,
                  `${pdfNumber(p.stock, 2)} ${p.unit || ''}`,
                  pdfNumber(p.min_stock, 2),
                  pdfNumber(p.suggested_order_qty, 2),
                  p.preferred_supplier_name || '-',
                  pdfMoney(p.last_cost || p.cost),
                  pdfMoney(est(p))
                ]),
                foot: ['Total', '', '', '', '', '', pdfMoney(sum(rows, est))]
              }
            ]
          };
        }
      },
      {
        id: 'inventario-compras',
        title: 'Compras a proveedores',
        description: 'Lo que se le compró a cada proveedor y cuánto costó.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/inventory/overview`);
          const rows = (d.purchases || []).filter((p: any) => inRange(p.purchase_date, from, to));
          const valid = rows.filter((p: any) => p.status !== 'ANULADA');
          const bySup = new Map<string, { n: number; v: number }>();
          valid.forEach((p: any) => {
            const k = p.supplier_name || 'Sin proveedor';
            const e = bySup.get(k) || { n: 0, v: 0 };
            e.n += 1;
            e.v += Number(p.total_amount || 0);
            bySup.set(k, e);
          });
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Total comprado', value: pdfMoney(sum(valid, (p: any) => p.total_amount)) },
              { label: 'Compras', value: pdfNumber(valid.length) },
              { label: 'Proveedores', value: pdfNumber(bySup.size) },
              { label: 'Anuladas', value: pdfNumber(rows.length - valid.length) }
            ],
            sections: [
              {
                title: 'Por proveedor',
                head: ['Proveedor', 'Compras', 'Total'],
                body: [...bySup.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, e]) => [k, pdfNumber(e.n), pdfMoney(e.v)])
              },
              {
                title: 'Detalle de compras',
                head: ['Fecha', 'Número', 'Proveedor', 'Factura', 'Productos', 'Estado', 'Total'],
                widths: [10, 12, 18, 10, 36, 9, 11],
                body: rows.map((p: any) => [
                  pdfDate(p.purchase_date),
                  p.order_number,
                  p.supplier_name || '-',
                  p.invoice_number || '-',
                  (p.items || []).map((i: any) => `${pdfNumber(i.quantity, 2)} ${i.item_name}`).join(', '),
                  st(p.status),
                  pdfMoney(p.total_amount)
                ])
              }
            ]
          };
        }
      },
      {
        id: 'inventario-movimientos',
        title: 'Entradas y salidas de inventario',
        description: 'Lo que entró y salió de la bodega: compras, consumos, daños y ventas.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/inventory/overview`);
          const rows = (d.recent_movements || []).filter((m: any) => inRange(m.movement_date, from, to));
          const MOVE: Record<string, string> = {
            ENTRADA_COMPRA: 'Compra',
            ENTRADA_AJUSTE: 'Corrección (+)',
            SALIDA_CONSUMO: 'Se usó',
            SALIDA_AJUSTE: 'Dañado / perdido',
            SALIDA_VENTA_POS: 'Venta en Servicios',
            TRASLADO: 'Traslado'
          };
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Movimientos', value: pdfNumber(rows.length) },
              { label: 'Entradas', value: pdfNumber(rows.filter((m: any) => m.direction === 'IN').length), tone: 'good' },
              { label: 'Salidas', value: pdfNumber(rows.filter((m: any) => m.direction === 'OUT').length), tone: 'bad' },
              { label: 'Valor de salidas', value: pdfMoney(sum(rows.filter((m: any) => m.direction === 'OUT'), (m: any) => m.total_cost)) }
            ],
            sections: [
              {
                title: 'Movimientos',
                note: 'Incluye los movimientos más recientes registrados en el sistema dentro del periodo elegido.',
                head: ['Fecha', 'Producto', 'Qué pasó', 'Cantidad', 'Antes', 'Después', 'Costo', 'Usuario', 'Nota'],
                widths: [10, 22, 13, 9, 8, 8, 10, 12, 20],
                body: rows.map((m: any) => [
                  pdfDate(m.movement_date),
                  m.product_name || '-',
                  MOVE[m.movement_type] || m.movement_type,
                  `${m.direction === 'OUT' ? '-' : '+'}${pdfNumber(m.quantity, 2)}`,
                  pdfNumber(m.previous_stock, 2),
                  pdfNumber(m.new_stock, 2),
                  pdfMoney(m.total_cost),
                  m.user_name || '-',
                  m.notes || '-'
                ])
              }
            ]
          };
        }
      }
    ]
  },
  /* ---------------------------------------------------------------- */
  {
    id: 'OPERACION',
    label: 'Personal y operación',
    hint: 'Equipo, turnos, limpieza y mantenimiento',
    icon: <Users className="w-5 h-5" />,
    color: [124, 58, 237],
    tw: { bg: 'bg-violet-700', text: 'text-violet-800 dark:text-violet-200', border: 'border-violet-300 dark:border-violet-700', soft: 'bg-violet-50 dark:bg-violet-500/10' },
    reports: [
      {
        id: 'personal',
        title: 'Personal y desempeño',
        description: 'Tu equipo, sus datos y lo que hizo cada uno (limpiezas, ventas, turnos).',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/staff/overview?from_date=${from}&to_date=${to}`);
          const staff = d.staff || [];
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Personas activas', value: pdfNumber(staff.filter((m: any) => Number(m.active) === 1).length) },
              { label: 'Nómina base mensual', value: pdfMoney(sum(staff.filter((m: any) => Number(m.active) === 1), (m: any) => m.base_salary)) },
              { label: 'Limpiezas', value: pdfNumber(d.kpis?.total_cleanings_period) },
              { label: 'Mantenimientos resueltos', value: pdfNumber(d.kpis?.total_maintenance_resolved) }
            ],
            sections: [
              {
                title: 'Equipo',
                head: ['Nombre', 'Cargo', 'Teléfono', 'Contrato', 'Ingreso', 'Sueldo', 'Estado'],
                widths: [24, 16, 13, 16, 11, 12, 9],
                body: staff.map((m: any) => [
                  m.full_name,
                  m.position || m.role,
                  m.phone || '-',
                  m.contract_type || '-',
                  pdfDate(m.hire_date) || '-',
                  m.base_salary ? pdfMoney(m.base_salary) : '-',
                  Number(m.active) === 1 ? 'Activo' : 'Inactivo'
                ])
              },
              {
                title: 'Lo que hizo cada persona en el periodo',
                head: ['Nombre', 'Limpiezas', 'Min. prom. limpieza', 'Mant. resueltos', 'Ventas servicios', 'Valor vendido', 'Turnos de caja', 'Turnos cumplidos'],
                body: staff.map((m: any) => [
                  m.full_name,
                  pdfNumber(m.metrics?.cleanings_completed),
                  m.metrics?.avg_cleaning_minutes ? pdfNumber(m.metrics.avg_cleaning_minutes) : '-',
                  pdfNumber(m.metrics?.maintenance_resolved),
                  pdfNumber(m.metrics?.pos_orders_count),
                  pdfMoney(m.metrics?.pos_sales_total),
                  pdfNumber(m.metrics?.cash_shifts_count),
                  `${pdfNumber(m.metrics?.shifts_completed)} de ${pdfNumber(m.metrics?.shifts_scheduled)}`
                ])
              },
              {
                title: 'Turnos programados',
                head: ['Fecha', 'Persona', 'Turno', 'Horario', 'Estado'],
                body: (d.shifts || []).map((s: any) => [pdfDate(s.shift_date), s.employee_name, s.shift_name, `${s.start_time} a ${s.end_time}`, st(s.status)])
              }
            ]
          };
        }
      },
      {
        id: 'limpieza',
        title: 'Limpieza de habitaciones',
        description: 'Cómo está de aseo cada habitación y qué hizo el personal de limpieza.',
        usesPeriod: false,
        build: async ({ get }) => {
          const d = await get(`/housekeeping/overview`);
          const k = d.kpis || {};
          return {
            kpis: [
              { label: 'Listas para ocupar', value: pdfNumber(k.rooms_clean_ready), tone: 'good' },
              { label: 'Por limpiar', value: pdfNumber(k.rooms_pending_cleaning), tone: 'bad' },
              { label: 'Limpiando ahora', value: pdfNumber(k.rooms_in_cleaning) },
              { label: 'Por revisar', value: pdfNumber(k.rooms_pending_inspection) },
              { label: 'Terminadas hoy', value: pdfNumber(k.tasks_completed_today) },
              { label: 'Minutos promedio', value: pdfNumber(k.avg_cleaning_minutes) },
              { label: 'Ocupadas', value: pdfNumber(k.rooms_occupied) },
              { label: 'Daños abiertos', value: pdfNumber(k.open_damage_reports) }
            ],
            sections: [
              {
                title: 'Estado de cada habitación',
                head: ['Hab.', 'Piso', 'Tipo', 'Estado', 'Huésped', 'Sale'],
                body: (d.rooms || []).map((r: any) => [r.number, r.floor || '-', r.room_type_name || '-', st(r.status), r.guest_full_name || '-', pdfDate(r.stay_expected_check_out) || '-'])
              },
              {
                title: 'Tareas de limpieza',
                head: ['Fecha', 'Hab.', 'Tipo', 'Asignada a', 'Estado', 'Minutos'],
                body: (d.tasks || []).map((t: any) => [pdfDate(t.scheduled_date || t.created_at), t.room_number, st(t.task_type), t.assigned_to_name || '-', st(t.status), t.duration_minutes ? pdfNumber(t.duration_minutes) : '-'])
              },
              {
                title: 'Personal de aseo',
                head: ['Nombre', 'Tareas activas', 'Terminadas hoy', 'Minutos promedio'],
                body: (d.staff || []).map((s: any) => [s.full_name, pdfNumber(s.active_tasks_count), pdfNumber(s.completed_today_count), s.avg_minutes ? pdfNumber(s.avg_minutes) : '-'])
              }
            ]
          };
        }
      },
      {
        id: 'mantenimiento',
        title: 'Mantenimiento y daños',
        description: 'Qué se dañó, en qué habitación, quién lo arregla y cuánto costó.',
        usesPeriod: true,
        build: async ({ get, from, to }) => {
          const d = await get(`/maintenance/overview`);
          const all = d.tickets || [];
          const rows = all.filter((t: any) => inRange(t.created_at, from, to) || !['RESUELTO', 'RESUELTA', 'CERRADO', 'CANCELADO'].includes(t.status));
          const k = d.kpis || {};
          return {
            orientation: 'landscape',
            kpis: [
              { label: 'Pendientes', value: pdfNumber(k.pending_count), tone: 'bad' },
              { label: 'En proceso', value: pdfNumber(k.in_progress_count) },
              { label: 'Resueltos en el mes', value: pdfNumber(k.resolved_month_count), tone: 'good' },
              { label: 'Habitaciones bloqueadas', value: pdfNumber(k.blocked_rooms_count) },
              { label: 'Costo del mes', value: pdfMoney(k.total_cost_month) },
              { label: 'Costo real del listado', value: pdfMoney(sum(rows, (t: any) => t.actual_cost)) }
            ],
            sections: [
              {
                title: 'Órdenes de mantenimiento',
                note: 'Incluye las órdenes creadas en el periodo y todas las que siguen abiertas.',
                head: ['Fecha', 'Hab.', 'Problema', 'Tipo', 'Prioridad', 'Responsable', 'Estado', 'Costo est.', 'Costo real'],
                widths: [10, 7, 30, 11, 9, 15, 10, 10, 10],
                body: rows.map((t: any) => [
                  pdfDate(t.created_at),
                  t.room_number || '-',
                  t.title || t.description || '-',
                  `${st(t.issue_type)}${t.category ? ` · ${t.category}` : ''}`,
                  st(t.priority),
                  t.assigned_to_name || '-',
                  st(t.status),
                  pdfMoney(t.estimated_cost),
                  pdfMoney(t.actual_cost)
                ])
              }
            ]
          };
        }
      }
    ]
  }
];

const ALL_REPORTS = GROUPS.flatMap((g) => g.reports.map((r) => ({ ...r, group: g })));

/* =========================================================================
   ATAJOS: los reportes que más se piden, con un solo toque
========================================================================= */

interface Quick {
  id: string;
  label: string;
  period?: Period;
}

const QUICK: Quick[] = [
  { id: 'resumen', label: 'Cómo le fue al hotel este mes', period: 'MES' },
  { id: 'caja-movimientos', label: 'La caja de hoy', period: 'HOY' },
  { id: 'alojados', label: 'Quién está alojado' },
  { id: 'cartera', label: 'Quién nos debe' },
  { id: 'inventario-existencias', label: 'Qué hay en inventario' },
  { id: 'inventario-compras-sugeridas', label: 'Qué hay que comprar' }
];

const PERIOD_LABEL: Record<Period, string> = {
  HOY: 'Hoy',
  SEMANA: 'Últimos 7 días',
  MES: 'Este mes',
  MES_PASADO: 'Mes pasado',
  FECHAS: 'Otras fechas'
};

/* =========================================================================
   PÁGINA
========================================================================= */

export default function Reportes() {
  const { activeHotelId, activeHotel, user } = useHotel();
  const today = getTodayString();

  const [groupId, setGroupId] = useState<string>(GROUPS[0].id);
  const [reportId, setReportId] = useState<string>(GROUPS[0].reports[0].id);
  const [period, setPeriod] = useState<Period>('MES');
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hotelInfo, setHotelInfo] = useState<HotelInfo | null>(null);

  const group = GROUPS.find((g) => g.id === groupId) || GROUPS[0];
  const report = ALL_REPORTS.find((r) => r.id === reportId) || ALL_REPORTS[0];
  const rangeFor = (p: Period) => (p === 'FECHAS' ? custom : rangeOf(p, today));
  const range = rangeFor(period);
  const token = localStorage.getItem('token');

  const get = async (path: string) => {
    const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Hotel-Id': String(activeHotelId) }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('No tienes permiso para ver la información de este reporte.');
    if (!res.ok) throw new Error(data.error || 'No se pudo consultar la información.');
    return data;
  };

  // Datos del hotel para el encabezado del PDF
  useEffect(() => {
    if (!activeHotelId) return;
    setHotelInfo(null);
    get('/config')
      .then((d) => setHotelInfo({ ...(d.hotel || {}), name: d.hotel?.name || activeHotel?.name || 'Hotel' }))
      .catch(() => setHotelInfo({ name: activeHotel?.name || 'Hotel', logo_url: (activeHotel as any)?.logo_url }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHotelId]);

  const pickGroup = (id: string) => {
    const g = GROUPS.find((x) => x.id === id)!;
    setGroupId(id);
    setReportId(g.reports[0].id);
    setMsg(null);
  };

  const rangeText = (r: { from: string; to: string }) =>
    r.from === r.to ? `del ${pdfDate(r.from)}` : `del ${pdfDate(r.from)} al ${pdfDate(r.to)}`;

  const generate = async (rep: (typeof ALL_REPORTS)[number], mode: 'view' | 'download', p: Period = period) => {
    if (busyId) return;
    const r = rangeFor(p);
    if (rep.usesPeriod && r.from > r.to) {
      setMsg({ type: 'error', text: 'La primera fecha ("Desde") debe ser antes que la segunda ("Hasta").' });
      return;
    }
    // La pestaña se abre de inmediato para que el navegador no la bloquee
    const win = mode === 'view' ? window.open('', '_blank') : null;
    if (win) win.document.write('<p style="font-family:sans-serif;padding:24px">Preparando el reporte…</p>');
    setBusyId(rep.id);
    setMsg(null);
    try {
      const part = await rep.build({ get, from: r.from, to: r.to });
      const fileName = `${rep.id}_${rep.usesPeriod ? `${r.from}_a_${r.to}` : today}.pdf`;
      const doc = await buildReportPdf(hotelInfo || { name: activeHotel?.name || 'Hotel' }, {
        ...part,
        title: part.title || rep.title,
        category: rep.group.label,
        color: rep.group.color,
        period: rep.usesPeriod ? { from: r.from, to: r.to } : null,
        generatedBy: user?.full_name || user?.username,
        fileName
      });
      if (mode === 'view' && win) {
        win.location.href = String(doc.output('bloburl'));
        setMsg({ type: 'success', text: `✓ "${rep.title}" se abrió en otra pestaña.` });
      } else {
        doc.save(fileName);
        setMsg({ type: 'success', text: `✓ "${rep.title}" se descargó. Búscalo en tu carpeta de Descargas.` });
      }
    } catch (err) {
      win?.close();
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo sacar el reporte. Intenta de nuevo.' });
    } finally {
      setBusyId(null);
    }
  };

  const busy = busyId === report.id;

  return (
    <div className="space-y-4 sm:space-y-5 max-w-6xl mx-auto">
      <header className={`rounded-3xl p-4 sm:p-5 flex items-center gap-3 ${SURFACE}`}>
        <span className="w-12 h-12 rounded-2xl bg-sky-700 text-white flex items-center justify-center shrink-0">
          <FileBarChart2 className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-900 dark:text-white leading-tight">Reportes</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Saca un PDF con el logo de {activeHotel?.name || 'tu hotel'} en 3 pasos.
          </p>
        </div>
      </header>

      {msg && (
        <Notice tone={msg.type} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {/* ---------- Atajos ---------- */}
      <section className={`rounded-3xl p-4 sm:p-5 space-y-3 ${SURFACE}`}>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600 dark:text-amber-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">¿Tienes afán? Los más usados</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Un toque y se descarga el PDF.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-2">
          {QUICK.map((q) => {
            const rep = ALL_REPORTS.find((r) => r.id === q.id)!;
            const isBusy = busyId === rep.id;
            return (
              <button
                key={q.id}
                type="button"
                disabled={!!busyId}
                onClick={() => generate(rep, 'download', q.period || period)}
                className={`min-h-14 px-3 py-2 rounded-2xl border-2 ${rep.group.tw.border} ${rep.group.tw.soft} flex items-center gap-3 text-left cursor-pointer disabled:opacity-60`}
              >
                <span className={`w-10 h-10 rounded-xl ${rep.group.tw.bg} text-white flex items-center justify-center shrink-0`}>
                  {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : rep.group.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-black leading-snug ${rep.group.tw.text}`}>{q.label}</span>
                  <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {isBusy ? 'Preparando…' : q.period ? PERIOD_LABEL[q.period] : 'Cómo está hoy'}
                  </span>
                </span>
                <Download className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 sm:gap-5 items-start">
        {/* ---------- Pasos 1 y 2 ---------- */}
        <div className="space-y-4 sm:space-y-5 min-w-0">
          <section className={`rounded-3xl p-4 sm:p-5 space-y-3 ${SURFACE}`}>
            <Step n={1} color="bg-sky-700" title="¿De qué quieres el reporte?" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GROUPS.map((g) => {
                const on = g.id === groupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pickGroup(g.id)}
                    aria-pressed={on}
                    className={`relative min-h-24 p-3 rounded-2xl border-2 flex flex-col items-start gap-2 text-left cursor-pointer ${
                      on
                        ? `${g.tw.bg} border-transparent text-white shadow-lg`
                        : `${g.tw.soft} ${g.tw.border} text-slate-800 dark:text-slate-100`
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        on ? 'bg-white/25 text-white' : `${g.tw.bg} text-white`
                      }`}
                    >
                      {g.icon}
                    </span>
                    <span className="text-sm font-black leading-tight">{g.label}</span>
                    {on && <CheckCircle2 className="absolute top-2.5 right-2.5 w-5 h-5 text-white" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`rounded-3xl p-4 sm:p-5 space-y-3 ${SURFACE}`}>
            <Step n={2} color={group.tw.bg} title="¿Cuál reporte?" hint={group.hint} />
            <div className="space-y-2" role="radiogroup" aria-label="Reporte">
              {group.reports.map((r) => {
                const on = r.id === reportId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setReportId(r.id);
                      setMsg(null);
                    }}
                    className={`w-full p-3 sm:p-4 rounded-2xl border-2 flex items-start gap-3 text-left cursor-pointer ${
                      on ? `${group.tw.border} ${group.tw.soft} ring-2 ring-offset-0 ring-current ${group.tw.text}` : 'border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        on ? `${group.tw.bg} border-transparent` : 'border-slate-400 dark:border-slate-500'
                      }`}
                    >
                      {on && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-base font-black leading-snug ${on ? group.tw.text : 'text-slate-900 dark:text-white'}`}>
                        {r.title}
                      </span>
                      <span className="block text-sm leading-snug text-slate-600 dark:text-slate-300">{r.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ---------- Paso 3 y botón ---------- */}
        <section id="sacar" className={`rounded-3xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-4 ${SURFACE}`}>
          <Step n={3} color="bg-emerald-700" title={report.usesPeriod ? '¿De qué fechas?' : 'Fechas'} />

          {report.usesPeriod ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(['HOY', 'SEMANA', 'MES', 'MES_PASADO', 'FECHAS'] as Period[]).map((p) => {
                  const on = period === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      aria-pressed={on}
                      className={`h-12 px-2 rounded-xl border-2 text-sm font-bold cursor-pointer ${
                        p === 'FECHAS' ? 'col-span-2' : ''
                      } ${
                        on
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-white/95 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {PERIOD_LABEL[p]}
                    </button>
                  );
                })}
              </div>
              {period === 'FECHAS' && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Desde">
                    <input
                      type="date"
                      value={custom.from}
                      max={today}
                      onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || c.from }))}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Hasta">
                    <input
                      type="date"
                      value={custom.to}
                      max={today}
                      onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || c.to }))}
                      className={INPUT}
                    />
                  </Field>
                </div>
              )}
            </div>
          ) : (
            <p className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-sm font-semibold text-emerald-900 dark:text-emerald-100 flex gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              No tienes que elegir fechas: este reporte muestra cómo está todo hoy.
            </p>
          )}

          <div className={`p-3 rounded-2xl border-2 ${group.tw.border} ${group.tw.soft}`}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vas a sacar</p>
            <p className={`text-base font-black leading-snug ${group.tw.text}`}>{report.title}</p>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {report.usesPeriod ? rangeText(range) : `a hoy, ${pdfDate(today)}`}
            </p>
          </div>

          <button
            type="button"
            disabled={!!busyId}
            onClick={() => generate(report, 'download')}
            className={`w-full h-14 rounded-2xl ${group.tw.bg} text-white text-lg font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg`}
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
            {busy ? 'Preparando…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            disabled={!!busyId}
            onClick={() => generate(report, 'view')}
            className="w-full h-12 rounded-2xl bg-white/95 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Eye className="w-5 h-5" />
            Solo verlo en pantalla
          </button>
        </section>
      </div>
    </div>
  );
}

function Step({ n, color, title, hint }: { n: number; color: string; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`head-icon w-9 h-9 rounded-full ${color} text-white text-base font-black flex items-center justify-center shrink-0`}>
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{title}</h2>
        {hint && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
