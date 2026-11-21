import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ArrowRight,
  Plus,
  MapPin,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  BedDouble,
  CheckCircle2,
  CalendarClock,
  Sparkles,
  Wrench,
  Users,
  LogIn,
  LogOut,
  AlertTriangle,
  Wallet,
  Utensils,
  RefreshCw,
  Receipt,
  Clock,
  CreditCard,
  Activity
} from 'lucide-react';
import API_URL from '../config/api';
import { useHotel } from '../context/HotelContext';

interface RackRoom {
  id: number;
  number: string;
  floor: string;
  room_type_name: string;
  price: number;
  status: string;
  category: 'OCCUPIED' | 'AVAILABLE' | 'RESERVED' | 'CLEANING' | 'OUT_OF_SERVICE';
  guest_name: string | null;
  next_payment_date: string | null;
  total_pending: number;
}

interface CurrentStay {
  stay_id: number;
  room_id: number;
  room_number: string;
  room_type_name: string;
  guest_id: number;
  guest_name: string;
  guest_document: string;
  guest_phone: string;
  check_in_date: string;
  payment_type: string;
  next_payment_date: string | null;
  rate: number;
  total_pending: number;
  accrued_periods: number;
  is_overdue: boolean;
}

interface CashRegisterSummary {
  id: number;
  name: string;
  user_name: string;
  opening_time: string;
  closing_time: string | null;
  opening_balance: number;
  shift_income: number;
  shift_expense: number;
  expected_balance: number;
  closing_balance: number | null;
  status: string;
  movements_count: number;
}

interface DayChartPoint {
  date: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
}

interface CategorySlice {
  category: string;
  amount: number;
  count: number;
}

interface PaymentMethodSlice {
  method: string;
  amount: number;
  count: number;
}

interface RecentMovement {
  id: number;
  type: 'INGRESO' | 'EGRESO';
  amount: number;
  category: string;
  payment_method: string;
  description: string;
  date: string;
  user_name?: string;
}

interface OperationalAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  title: string;
  description: string;
  action_url: string;
  action_label: string;
}

interface HotelDashboardData {
  generated_at: string;
  rooms: {
    total: number;
    occupied: number;
    free: number;
    available: number;
    reserved: number;
    cleaning: number;
    maintenance: number;
    out_of_service: number;
    occupancy_rate: number;
    effective_occupancy_rate: number;
    rack: RackRoom[];
  };
  reception: {
    active_guests: number;
    expected_arrivals_today: number;
    expected_departures_today: number;
    pending_reservations: number;
    overdue_stays_count: number;
    current_stays: CurrentStay[];
  };
  today: {
    income: number;
    expense: number;
    balance: number;
    lodging_income: number;
    services_income: number;
    movements_count: number;
  };
  month: {
    income: number;
    expense: number;
    balance: number;
    lodging_income: number;
    services_income: number;
    movements_count: number;
  };
  services_sold: {
    today_amount: number;
    today_count: number;
    month_amount: number;
    month_count: number;
  };
  cash_registers: CashRegisterSummary[];
  open_registers_count: number;
  charts: {
    last_7_days: DayChartPoint[];
    income_by_category: CategorySlice[];
    payment_methods: PaymentMethodSlice[];
  };
  recent_movements: RecentMovement[];
  alerts: OperationalAlert[];
}

function MultiSegmentDoughnut({
  occupied,
  available,
  reserved,
  cleaning,
  outOfService,
  total,
  occupancyRate
}: {
  occupied: number;
  available: number;
  reserved: number;
  cleaning: number;
  outOfService: number;
  total: number;
  occupancyRate: number;
}) {
  const radius = 40;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, total);

  const segments = [
    { value: occupied, color: '#f43f5e' }, // Ocupadas (Rose)
    { value: reserved, color: '#6366f1' }, // Reservadas (Indigo)
    { value: cleaning, color: '#f59e0b' }, // Limpieza (Amber)
    { value: outOfService, color: '#64748b' }, // Fuera de servicio (Slate)
    { value: available, color: '#10b981' } // Disponibles (Emerald)
  ];

  let accumulatedPercent = 0;

  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="transparent"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          className="dark: opacity-20"
        />
        {total > 0 &&
          segments.map((seg, idx) => {
            if (seg.value <= 0) return null;
            const percent = seg.value / safeTotal;
            const dashArray = `${percent * circumference} ${circumference}`;
            const dashOffset = -accumulatedPercent * circumference;
            accumulatedPercent += percent;
            return (
              <circle
                key={idx}
                cx={50}
                cy={50}
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                className="transition-all duration-700 ease-out"
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-black text-slate-900 dark:text-white leading-none">
          {occupancyRate}%
        </span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          Ocupación
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    hotels,
    activeHotel,
    activeHotelId,
    setActiveHotelId,
    loadingHotels,
    refreshHotels,
    user,
    hasPermission
  } = useHotel();

  const [dashboardData, setDashboardData] = useState<HotelDashboardData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchActiveHotelDashboard = useCallback(async (hotelId: number) => {
    const token = localStorage.getItem('token');
    if (!token || !hotelId) return;

    setLoadingDashboard(true);
    try {
      const res = await fetch(`${API_URL}/api/hotels/${hotelId}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data: HotelDashboardData = await res.json();
        setDashboardData(data);
        setLastUpdated(
          new Date().toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        );
      }
    } catch (error) {
      console.error('Error al cargar dashboard en tiempo real:', error);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    refreshHotels();
  }, [refreshHotels]);

  useEffect(() => {
    if (activeHotelId) {
      fetchActiveHotelDashboard(activeHotelId);
    }
  }, [activeHotelId, fetchActiveHotelDashboard]);

  const handleManualRefresh = async () => {
    await Promise.all([refreshHotels(), fetchActiveHotelDashboard(activeHotelId)]);
  };

  const activeHotelPath =
    activeHotelId === 1
      ? '/hotel-1'
      : activeHotelId === 2
      ? '/hotel-2'
      : `/hotels/${activeHotelId}`;

  const totalRoomsAll = hotels.reduce((acc, h) => acc + (h.stats?.total_rooms || 0), 0);
  const occupiedRoomsAll = hotels.reduce((acc, h) => acc + (h.stats?.occupied_rooms || 0), 0);
  const incomeTodayAll = hotels.reduce((acc, h) => acc + (h.stats?.income_today || 0), 0);
  const expenseTodayAll = hotels.reduce((acc, h) => acc + (h.stats?.expense_today || 0), 0);

  const maxChartVal = Math.max(
    1,
    ...(dashboardData?.charts.last_7_days.map((d) => Math.max(d.income, d.expense)) || [1])
  );

  return (
    <div className="relative overflow-x-clip space-y-8 animate-fade-in pb-10">
      <div className="absolute top-[-8%] left-[-12%] w-[350px] h-[350px] bg-indigo-200/30 dark:bg-indigo-500/15 rounded-full blur-[90px] -z-10 pointer-events-none"></div>
      <div className="absolute bottom-[-8%] right-[-8%] w-[350px] h-[350px] bg-teal-200/25 dark:bg-teal-500/15 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

      {/* CABECERA PRINCIPAL Y SELECTOR DE ESTABLECIMIENTO EN VIVO */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs">
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-100 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Módulo 1 · Dashboard Operativo y Financiero en Tiempo Real</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Hola, {user?.full_name || 'Administrador'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium">
            Monitoreo en vivo de{' '}
            <strong className="text-indigo-600 dark:text-indigo-400">
              {activeHotel?.name || 'Establecimiento Activo'}
            </strong>{' '}
            {lastUpdated && (
              <span className="text-slate-400 dark:text-slate-500">
                · Sincronizado a las {lastUpdated}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector rápido de sedes */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200/70 dark:border-slate-700">
            {hotels.map((h) => {
              const isSelected = h.id === activeHotelId;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setActiveHotelId(h.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {h.name}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl text-xs transition-all cursor-pointer"
            title="Sincronizar indicadores en tiempo real"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDashboard ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <Link
            to={activeHotelPath}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl text-xs shadow-sm transition-all"
          >
            <span>Operar {activeHotel?.name || 'Hotel'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          {hasPermission('config.view') && (
            <Link
              to="/configuracion"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold rounded-2xl text-xs border border-indigo-200/60 dark:border-indigo-500 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Sedes</span>
            </Link>
          )}
        </div>
      </div>

      {/* SECCIÓN 1: INDICADORES DE HABITACIONES Y OCUPACIÓN (6 KPIs OBLIGATORIOS) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Estado de Habitaciones en Tiempo Real — {activeHotel?.name}</span>
          </h2>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Total inventario: <b>{dashboardData?.rooms.total ?? 0}</b> habitaciones activas
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* 1. Ocupadas */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-rose-100 dark:border-rose-500/70 shadow-xs">
            <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ocupadas</span>
              <BedDouble className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.rooms.occupied ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Alojados
              </span>
            </div>
          </div>

          {/* 2. Disponibles */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/70 shadow-xs">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Disponibles</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.rooms.available ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Listas
              </span>
            </div>
          </div>

          {/* 3. Reservadas */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-500/70 shadow-xs">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Reservadas</span>
              <CalendarClock className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.rooms.reserved ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                Bloqueadas
              </span>
            </div>
          </div>

          {/* 4. En Limpieza */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-amber-100 dark:border-amber-500/70 shadow-xs">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">En Limpieza</span>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.rooms.cleaning ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                Housekeeping
              </span>
            </div>
          </div>

          {/* 5. Fuera de Servicio / Mantenimiento */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Fuera Serv.</span>
              <Wrench className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.rooms.out_of_service ?? 0}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Mantenimiento
              </span>
            </div>
          </div>

          {/* 6. Ocupación Porcentual */}
          <div className="bg-indigo-700 text-white p-4 rounded-2xl">
            <div className="flex items-center justify-between text-indigo-100">
              <span className="text-[11px] font-bold uppercase tracking-wider">% Ocupación</span>
              <Activity className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black">
                {dashboardData?.rooms.occupancy_rate ?? 0}%
              </span>
              <span className="text-[11px] text-indigo-100 font-medium">
                {dashboardData?.rooms.occupied ?? 0}/{dashboardData?.rooms.total ?? 0} habs
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: RECEPCIÓN Y HUÉSPEDES + FINANZAS DEL DÍA Y SERVICIOS (8 KPIs OBLIGATORIOS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recepción y Flujo de Huéspedes */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Recepción, Huéspedes y Reservas</span>
            </h3>
            <Link
              to={activeHotelPath}
              className="inline-flex items-center min-h-9 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Ir a Recepción →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                <span className="text-[10px] font-bold uppercase">Alojados Hoy</span>
                <Users className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.reception.active_guests ?? 0}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Huéspedes activos
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <span className="text-[10px] font-bold uppercase">Llegadas Hoy</span>
                <LogIn className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.reception.expected_arrivals_today ?? 0}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Check-in previstos
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                <span className="text-[10px] font-bold uppercase">Salidas Hoy</span>
                <LogOut className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.reception.expected_departures_today ?? 0}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Vencimientos / Salidas
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-purple-600 dark:text-purple-400">
                <span className="text-[10px] font-bold uppercase">Reservas Pend.</span>
                <CalendarClock className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                {dashboardData?.reception.pending_reservations ?? 0}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Activas / Por llegar
              </span>
            </div>
          </div>

          {/* Mini-Rack Visual de Habitaciones del Hotel Activo */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Mapa Rápido de Habitaciones ({activeHotel?.name})
              </span>
              <span className="text-[11px] text-slate-400">Clic para operar en Recepción</span>
            </div>
            <div className="list-scroll grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
              {(dashboardData?.rooms.rack || []).map((r) => {
                const badgeStyles =
                  r.category === 'OCCUPIED'
                    ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/70 text-rose-700 dark:text-rose-300'
                    : r.category === 'CLEANING'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/70 text-amber-700 dark:text-amber-300'
                    : r.category === 'RESERVED'
                    ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/70 text-indigo-700 dark:text-indigo-300'
                    : r.category === 'OUT_OF_SERVICE'
                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/70 text-emerald-700 dark:text-emerald-300';

                return (
                  <Link
                    key={r.id}
                    to={activeHotelPath}
                    className={`min-w-0 p-3 rounded-2xl border transition-all hover:-translate-y-0.5 ${badgeStyles}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-sm font-black whitespace-nowrap">Hab. {r.number}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-slate-900/70 whitespace-nowrap">
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold truncate">
                      {r.guest_name ? r.guest_name : `$${r.price.toLocaleString('de-DE')}`}
                    </p>
                    {r.total_pending > 0 && (
                      <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                        Debe: ${r.total_pending.toLocaleString('de-DE')}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Resumen Financiero del Día, Mes y Servicios Vendidos */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Indicadores Financieros y Servicios Vendidos</span>
            </h3>
            <span className="text-xs font-bold text-slate-400">
              Moneda: {activeHotel?.currency || 'COP'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Ingresos del Día */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/70">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                <span className="text-[10px] font-bold uppercase">Ingresos Hoy</span>
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-base min-[400px]:text-lg xl:text-xl font-black leading-tight whitespace-nowrap tabular-nums text-emerald-700 dark:text-emerald-300">
                ${(dashboardData?.today.income ?? 0).toLocaleString('de-DE')}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Mes: ${(dashboardData?.month.income ?? 0).toLocaleString('de-DE')}
              </span>
            </div>

            {/* Egresos del Día */}
            <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-500/15 border border-rose-100 dark:border-rose-500/70">
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
                <span className="text-[10px] font-bold uppercase">Egresos Hoy</span>
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-base min-[400px]:text-lg xl:text-xl font-black leading-tight whitespace-nowrap tabular-nums text-rose-700 dark:text-rose-300">
                ${(dashboardData?.today.expense ?? 0).toLocaleString('de-DE')}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Mes: ${(dashboardData?.month.expense ?? 0).toLocaleString('de-DE')}
              </span>
            </div>

            {/* Servicios Vendidos */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/70">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                <span className="text-[10px] font-bold uppercase">Servicios Hoy</span>
                <Utensils className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-base min-[400px]:text-lg xl:text-xl font-black leading-tight whitespace-nowrap tabular-nums text-amber-700 dark:text-amber-300">
                ${(dashboardData?.services_sold.today_amount ?? 0).toLocaleString('de-DE')}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Mes: ${(dashboardData?.services_sold.month_amount ?? 0).toLocaleString('de-DE')} (
                {dashboardData?.services_sold.month_count ?? 0} serv.)
              </span>
            </div>

            {/* Balance Neto */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-500/15 border border-indigo-100 dark:border-indigo-500/70">
              <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-400">
                <span className="text-[10px] font-bold uppercase">Utilidad Mes</span>
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <p className="mt-1.5 text-base min-[400px]:text-lg xl:text-xl font-black leading-tight whitespace-nowrap tabular-nums text-indigo-700 dark:text-indigo-300">
                ${(dashboardData?.month.balance ?? 0).toLocaleString('de-DE')}
              </p>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Hoy: ${(dashboardData?.today.balance ?? 0).toLocaleString('de-DE')}
              </span>
            </div>
          </div>

          {/* Estado de las Cajas del Hotel */}
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                <span>Estado de Cajas ({dashboardData?.open_registers_count ?? 0} abiertas)</span>
              </span>
              <Link
                to={activeHotelPath}
                className="inline-flex items-center min-h-9 px-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Ver Movimientos →
              </Link>
            </div>

            {dashboardData?.cash_registers && dashboardData.cash_registers.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.cash_registers.slice(0, 2).map((reg) => (
                  <div
                    key={reg.id}
                    className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            reg.status === 'ABIERTA'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {reg.status}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {reg.name}
                        </span>
                        <span className="text-slate-400">· {reg.user_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Apertura: {reg.opening_time} · {reg.movements_count} movimientos registrados
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Ingresos Turno</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          +${reg.shift_income.toLocaleString('de-DE')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Egresos Turno</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          -${reg.shift_expense.toLocaleString('de-DE')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Saldo en Caja</span>
                        <span className="font-black text-slate-900 dark:text-white">
                          ${reg.expected_balance.toLocaleString('de-DE')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No se han registrado aperturas de caja en este establecimiento todavía.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: ALERTAS OPERATIVAS EN TIEMPO REAL Y HUÉSPEDES ALOJADOS ACTUALMENTE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Alertas Operativas (5 columnas) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Alertas Operativas Activas</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {dashboardData?.alerts.length ?? 0}
            </span>
          </div>

          {dashboardData?.alerts && dashboardData.alerts.length > 0 ? (
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {dashboardData.alerts.map((alert) => {
                const style =
                  alert.severity === 'critical'
                    ? 'bg-rose-50/90 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/70 text-rose-900 dark:text-rose-200'
                    : alert.severity === 'warning'
                    ? 'bg-amber-50/90 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/70 text-amber-900 dark:text-amber-200'
                    : 'bg-indigo-50/80 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/70 text-indigo-900 dark:text-indigo-200';

                return (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2 ${style}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold">{alert.title}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/70">
                          {alert.severity === 'critical'
                            ? 'Urgente'
                            : alert.severity === 'warning'
                            ? 'Atención'
                            : 'Info'}
                        </span>
                      </div>
                      <p className="text-xs opacity-90 leading-relaxed">{alert.description}</p>
                    </div>
                    <div className="flex justify-end">
                      <Link
                        to={alert.action_url}
                        className="inline-flex items-center min-h-9 text-xs font-bold underline hover:opacity-80"
                      >
                        {alert.action_label} →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-emerald-50/60 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/70 text-center space-y-1">
              <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Operación al día sin alertas críticas
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                No hay cobros vencidos ni bloqueos operativos pendientes.
              </p>
            </div>
          )}
        </div>

        {/* Huéspedes Actualmente Alojados y Estado de Cuentas (7 columnas) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Huéspedes Alojados Actualmente ({dashboardData?.reception.current_stays.length ?? 0})</span>
            </h3>
            <Link
              to={activeHotelPath}
              className="inline-flex items-center min-h-9 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Gestionar estancias →
            </Link>
          </div>

          {dashboardData?.reception.current_stays &&
          dashboardData.reception.current_stays.length > 0 ? (
            <div className="table-scroll">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400">
                    <th className="py-2.5 pr-3">Hab.</th>
                    <th className="py-2.5 px-3">Huésped</th>
                    <th className="py-2.5 px-3">Ingreso / Modalidad</th>
                    <th className="py-2.5 px-3">Próximo Cobro</th>
                    <th className="py-2.5 pl-3 text-right">Saldo Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {dashboardData.reception.current_stays.map((stay) => (
                    <tr
                      key={stay.stay_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 pr-3 font-black text-indigo-600 dark:text-indigo-400">
                        #{stay.room_number}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {stay.guest_name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {stay.guest_document ? `Doc: ${stay.guest_document}` : 'Sin doc.'}
                          {stay.guest_phone ? ` · Tel: ${stay.guest_phone}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {stay.check_in_date}
                        </div>
                        <div className="text-[10px] text-slate-400">{stay.payment_type}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            stay.is_overdue
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{stay.next_payment_date || 'Al día'}</span>
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {stay.total_pending > 0 ? (
                          <span className="font-black text-rose-600 dark:text-rose-400">
                            ${stay.total_pending.toLocaleString('de-DE')}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Al día ($0)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 dark:text-slate-400">
              No hay huéspedes alojados en este momento en {activeHotel?.name}.
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN 4: GRÁFICA DE FLUJO FINANCIERO (ÚLTIMOS 7 DÍAS) Y DISTRIBUCIÓN DE INGRESOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfica de Barras: Últimos 7 Días (7 columnas) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Flujo de Caja — Últimos 7 Días ({activeHotel?.name})
              </h3>
              <p className="text-xs text-slate-400">
                Comparativa diaria real de ingresos vs egresos registrados
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                Ingresos
              </span>
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                Egresos
              </span>
            </div>
          </div>

          <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2 border-b border-slate-100 dark:border-slate-800">
            {(dashboardData?.charts.last_7_days || []).map((pt) => {
              const incHeight = Math.max(4, Math.round((pt.income / maxChartVal) * 140));
              const expHeight = Math.max(4, Math.round((pt.expense / maxChartVal) * 140));
              return (
                <div key={pt.date} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full flex items-end justify-center gap-1.5 h-[145px]">
                    <div
                      style={{ height: `${incHeight}px` }}
                      title={`Ingresos ${pt.label}: $${pt.income.toLocaleString('de-DE')}`}
                      className="w-3.5 sm:w-5 bg-emerald-500 hover:bg-emerald-400 rounded-t-lg transition-all"
                    />
                    <div
                      style={{ height: `${expHeight}px` }}
                      title={`Egresos ${pt.label}: $${pt.expense.toLocaleString('de-DE')}`}
                      className="w-3.5 sm:w-5 bg-rose-500 hover:bg-rose-400 rounded-t-lg transition-all"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pb-2">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desglose por Categoría y Últimos Movimientos (5 columnas) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Ingresos del Mes por Categoría y Medios de Pago
          </h3>

          <div className="space-y-2.5">
            {(dashboardData?.charts.income_by_category || []).length > 0 ? (
              dashboardData?.charts.income_by_category.map((cat) => {
                const pct =
                  (dashboardData?.month.income || 0) > 0
                    ? Math.round((cat.amount / dashboardData!.month.income) * 100)
                    : 0;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300">
                        {cat.category} ({cat.count} mov.)
                      </span>
                      <span className="text-slate-900 dark:text-white">
                        ${cat.amount.toLocaleString('de-DE')} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-400">Sin ingresos registrados en el mes actual.</p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Últimos Movimientos de Caja ({activeHotel?.name})
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {(dashboardData?.recent_movements || []).slice(0, 5).map((mov) => (
                <div
                  key={mov.id}
                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {mov.description || mov.category}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {mov.date} · {mov.payment_method}
                    </p>
                  </div>
                  <span
                    className={`font-black whitespace-nowrap ${
                      mov.type === 'INGRESO'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {mov.type === 'INGRESO' ? '+' : '-'}${mov.amount.toLocaleString('de-DE')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 5: VISTA CONSOLIDADA MULTI-TENANT (TODAS LAS SEDES AUTORIZADAS) */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Resumen Consolidado Multiempresa ({hotels.length} Sedes Activas)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ocupación global: <b>{occupiedRoomsAll}/{totalRoomsAll}</b> habitaciones · Ingresos hoy:{' '}
              <b className="text-emerald-600 dark:text-emerald-400">
                ${incomeTodayAll.toLocaleString('de-DE')}
              </b>{' '}
              · Egresos hoy:{' '}
              <b className="text-rose-600 dark:text-rose-400">
                ${expenseTodayAll.toLocaleString('de-DE')}
              </b>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loadingHotels ? (
            <div className="col-span-2 h-64 bg-white/50 dark:bg-slate-900/50 animate-pulse rounded-3xl border border-slate-100 dark:border-slate-800" />
          ) : (
            hotels.map((hotel, idx) => {
              const path =
                hotel.id === 1
                  ? '/hotel-1'
                  : hotel.id === 2
                  ? '/hotel-2'
                  : `/hotels/${hotel.id}`;

              const isFirst = idx % 2 === 0;
              const colorClass = isFirst
                ? 'bg-emerald-500 text-white border-emerald-600'
                : 'bg-teal-500 text-white border-teal-600';
              const borderTop = isFirst
                ? 'border-t-4 border-t-emerald-500'
                : 'border-t-4 border-t-teal-500';

              const total = hotel.stats?.total_rooms || 0;
              const occupied = hotel.stats?.occupied_rooms || 0;
              const reserved = hotel.stats?.reserved_rooms || 0;
              const free = hotel.stats?.free_rooms || 0;
              const cleaning = hotel.stats?.cleaning_rooms || 0;
              const maintenance = hotel.stats?.maintenance_rooms || 0;
              const percentage = hotel.stats?.occupancy_rate || 0;

              return (
                <div
                  key={hotel.id}
                  onClick={() => setActiveHotelId(hotel.id)}
                  className={`group relative bg-white/85 dark:bg-slate-900/90 backdrop-blur-md p-6 rounded-3xl border transition-all flex flex-col justify-between cursor-pointer ${borderTop} ${
                    hotel.id === activeHotelId
                      ? 'border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-slate-100 dark:border-slate-800 hover:-translate-y-1'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className={`p-3 rounded-2xl border ${colorClass}`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-full">
                        {hotel.tax_id ? `NIT: ${hotel.tax_id}` : 'Sede Activa'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        {hotel.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {hotel.address ? `${hotel.address} · ` : ''}
                          {hotel.city || 'Colombia'} ({hotel.currency || 'COP'})
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="my-4 flex items-center gap-5 bg-slate-50/80 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                    <MultiSegmentDoughnut
                      occupied={occupied}
                      available={free}
                      reserved={reserved}
                      cleaning={cleaning}
                      outOfService={maintenance}
                      total={total}
                      occupancyRate={percentage}
                    />
                    <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Libres: <b>{free}</b>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Ocupadas: <b>{occupied}</b>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Reserv.: <b>{reserved}</b>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Limpieza: <b>{cleaning}</b>
                        </span>
                      </div>
                      <div className="col-span-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-700 text-[11px] flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Ingresos Hoy:</span>
                        <b className="text-emerald-600 dark:text-emerald-400">
                          ${Number(hotel.stats?.income_today || 0).toLocaleString('de-DE')}
                        </b>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] font-semibold text-slate-400">
                      {hotel.id === activeHotelId
                        ? 'Mostrando indicadores arriba'
                        : 'Clic para previsualizar en Dashboard'}
                    </span>
                    <Link
                      to={path}
                      onClick={() => setActiveHotelId(hotel.id)}
                      className="inline-flex items-center min-h-9 gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <span>Abrir recepción y habitaciones</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
