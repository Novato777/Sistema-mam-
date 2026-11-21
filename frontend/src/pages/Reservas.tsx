import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarRange,
  CalendarCheck,
  Search,
  Plus,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  X
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';

type ReservationStatus = 'PENDIENTE' | 'CONFIRMADA' | 'CHECKED_IN' | 'CANCELADA' | 'NO_SHOW' | 'FINALIZADA';

interface RoomTypeItem {
  id: number;
  name: string;
  description: string;
  base_price: number;
  capacity: number;
  bed_config: string;
}

interface ReservationRoomItem {
  room_id: number;
  room_number: string;
  floor: string;
  room_status?: string;
  room_type_id?: number | null;
  room_type_name?: string | null;
  rate_per_night: number;
}

interface ReservationItem {
  id: number;
  hotel_id: number;
  code: string;
  guest_id: number | null;
  guest_name: string;
  guest_document: string;
  guest_phone: string;
  guest_email: string;
  is_group: number;
  group_name: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  nights: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  subtotal_price: number;
  discount_amount: number;
  discount_reason: string | null;
  total_price: number;
  advance_paid: number;
  pending_balance: number;
  payment_method: string;
  observations: string | null;
  cancellation_reason: string | null;
  created_at: string;
  rooms: ReservationRoomItem[];
}

interface AvailableRoomItem {
  id: number;
  number: string;
  floor: string;
  status: string;
  price: number;
  rate_3_days?: number | null;
  rate_weekly?: number | null;
  capacity: number;
  bed_config: string;
  amenities: string;
  room_type_id: number | null;
  room_type_name: string | null;
  effective_capacity: number;
}

interface ConflictingRoomItem extends AvailableRoomItem {
  conflicts: Array<{
    type: 'RESERVATION' | 'STAY' | 'ROOM_STATUS';
    code?: string;
    guest_name?: string;
    check_in_date?: string;
    check_out_date?: string;
    status: string;
    message: string;
  }>;
}

interface CalendarRoomRow {
  id: number;
  number: string;
  floor: string;
  status: string;
  price: number;
  capacity: number;
  bed_config: string;
  room_type_name: string | null;
  guest_name?: string | null;
}

interface CalendarReservationBlock {
  reservation_id: number;
  code: string;
  guest_name: string;
  guest_document: string;
  guest_phone: string;
  is_group: number;
  group_name: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  status: ReservationStatus;
  total_price: number;
  advance_paid: number;
  room_id: number;
  rate_per_night: number;
  room_number: string;
}

interface CalendarStayBlock {
  stay_id: number;
  room_id: number;
  guest_name: string;
  guest_document: string;
  start_date: string;
  end_date: string;
  status: string;
  payment_type: string;
  room_number: string;
}

const STATUS_BADGE: Record<
  ReservationStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  PENDIENTE: {
    label: 'Pendiente',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-500/70'
  },
  CONFIRMADA: {
    label: 'Confirmada',
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-500/70'
  },
  CHECKED_IN: {
    label: 'En Casa (Check-in)',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-500/70'
  },
  CANCELADA: {
    label: 'Cancelada',
    bg: 'bg-rose-50 dark:bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-500/70'
  },
  NO_SHOW: {
    label: 'No-Show',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-300 dark:border-slate-700'
  },
  FINALIZADA: {
    label: 'Finalizada',
    bg: 'bg-teal-50 dark:bg-teal-500/15',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-500/70'
  }
};

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function calcNightsBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 1;
  const s = new Date(`${startStr}T00:00:00`);
  const e = new Date(`${endStr}T00:00:00`);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 1;
}

export default function Reservas() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const token = localStorage.getItem('token');
  const apiBase = `/api/hotels/${activeHotelId}`;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => addDaysStr(todayStr, 1), [todayStr]);

  const [activeTab, setActiveTab] = useState<'CALENDAR' | 'NEW' | 'LIST'>('CALENDAR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Datos principales
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([]);

  // Estado del Calendario Visual
  const [calendarStart, setCalendarStart] = useState<string>(todayStr);
  const [calendarDaysCount, setCalendarDaysCount] = useState<number>(14);
  const [calendarData, setCalendarData] = useState<{
    days: string[];
    rooms: CalendarRoomRow[];
    reservations: CalendarReservationBlock[];
    stays: CalendarStayBlock[];
  }>({
    days: [],
    rooms: [],
    reservations: [],
    stays: []
  });

  // Estado del Buscador de Disponibilidad y Formulario de Reserva
  const [availFilter, setAvailFilter] = useState({
    check_in_date: todayStr,
    check_out_date: tomorrowStr,
    check_in_time: activeHotel?.check_in_time || '15:00',
    check_out_time: activeHotel?.check_out_time || '13:00',
    room_type_id: 'ALL',
    capacity: '1'
  });

  const [availableRooms, setAvailableRooms] = useState<AvailableRoomItem[]>([]);
  const [conflictingRooms, setConflictingRooms] = useState<ConflictingRoomItem[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Habitaciones seleccionadas para la reserva: mapa room_id -> rate_per_night
  const [selectedRoomRates, setSelectedRoomRates] = useState<Record<number, number>>({});

  // Formulario de creación / edición de reserva
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null);
  const [resForm, setResForm] = useState({
    guest_name: '',
    guest_document: '',
    guest_phone: '',
    guest_email: '',
    is_group: false,
    group_name: '',
    adults: '2',
    children: '0',
    discount_amount: '0',
    discount_reason: '',
    advance_paid: '0',
    payment_method: 'EFECTIVO',
    status: 'CONFIRMADA' as ReservationStatus,
    observations: ''
  });

  // Filtros del Listado de Reservas
  const [listStatusFilter, setListStatusFilter] = useState<string>('ALL');
  const [listSearch, setListSearch] = useState<string>('');

  // Modal de Anticipo Adicional
  const [advanceModalRes, setAdvanceModalRes] = useState<ReservationItem | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('EFECTIVO');
  const [advanceNotes, setAdvanceNotes] = useState('');

  // Modal de Cancelación
  const [cancelModalRes, setCancelModalRes] = useState<ReservationItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Modal de Detalle Rápido desde el Calendario
  const [detailModalRes, setDetailModalRes] = useState<ReservationItem | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Hotel-Id': String(activeHotelId)
  };

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const calEnd = addDaysStr(calendarStart, calendarDaysCount - 1);
      const [resListResp, calResp, rtResp] = await Promise.all([
        fetch(`${API_URL}${apiBase}/reservations`, { headers }),
        fetch(
          `${API_URL}${apiBase}/reservations/calendar?startDate=${calendarStart}&endDate=${calEnd}`,
          { headers }
        ),
        fetch(`${API_URL}${apiBase}/room-types`, { headers })
      ]);

      if (!resListResp.ok || !calResp.ok) {
        throw new Error('Error al cargar los datos del motor de reservas');
      }

      const [resListData, calData, rtData] = await Promise.all([
        resListResp.json(),
        calResp.json(),
        rtResp.ok ? rtResp.json() : []
      ]);

      setReservations(Array.isArray(resListData) ? resListData : []);
      setCalendarData({
        days: calData.days || [],
        rooms: calData.rooms || [],
        reservations: calData.reservations || [],
        stays: calData.stays || []
      });
      setRoomTypes(Array.isArray(rtData) ? rtData : []);
    } catch (err: any) {
      setError(err.message || 'Error inesperado cargando reservas');
    } finally {
      setLoading(false);
    }
  };

  const checkAvailabilityNow = async (
    customStart?: string,
    customEnd?: string,
    excludeId?: number | null
  ) => {
    const start = customStart || availFilter.check_in_date;
    const end = customEnd || availFilter.check_out_date;
    if (!start || !end || end <= start) return;

    setCheckingAvailability(true);
    try {
      const params = new URLSearchParams({
        checkInDate: start,
        checkOutDate: end
      });
      if (availFilter.room_type_id !== 'ALL') {
        params.set('roomTypeId', availFilter.room_type_id);
      }
      if (Number(availFilter.capacity) > 1) {
        params.set('capacity', availFilter.capacity);
      }
      const exId = excludeId !== undefined ? excludeId : editingReservationId;
      if (exId) {
        params.set('excludeReservationId', String(exId));
      }

      const resp = await fetch(`${API_URL}${apiBase}/reservations/availability?${params}`, {
        headers
      });
      if (!resp.ok) {
        const d = await resp.json();
        throw new Error(d.error || 'Error al consultar disponibilidad');
      }
      const data = await resp.json();
      setAvailableRooms(data.available_rooms || []);
      setConflictingRooms(data.conflicting_rooms || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCheckingAvailability(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [activeHotelId, calendarStart, calendarDaysCount]);

  useEffect(() => {
    checkAvailabilityNow();
  }, [
    activeHotelId,
    availFilter.check_in_date,
    availFilter.check_out_date,
    availFilter.room_type_id,
    availFilter.capacity,
    editingReservationId
  ]);

  const nightsCount = useMemo(
    () => calcNightsBetween(availFilter.check_in_date, availFilter.check_out_date),
    [availFilter.check_in_date, availFilter.check_out_date]
  );

  // Cálculo financiero en tiempo real del formulario de reserva
  const financialSummary = useMemo(() => {
    const selectedIds = Object.keys(selectedRoomRates).map(Number);
    const perNightSum = selectedIds.reduce((sum, id) => sum + (Number(selectedRoomRates[id]) || 0), 0);
    const subtotal = perNightSum * nightsCount;
    const discount = Math.max(
      0,
      Number(String(resForm.discount_amount).replace(/\./g, '')) || 0
    );
    const total = Math.max(0, subtotal - discount);
    const advance = Math.max(
      0,
      Number(String(resForm.advance_paid).replace(/\./g, '')) || 0
    );
    const pending = Math.max(0, total - advance);
    return {
      roomsCount: selectedIds.length,
      perNightSum,
      subtotal,
      discount,
      total,
      advance,
      pending
    };
  }, [selectedRoomRates, nightsCount, resForm.discount_amount, resForm.advance_paid]);

  const toggleSelectRoom = (room: AvailableRoomItem) => {
    setSelectedRoomRates((prev) => {
      const next = { ...prev };
      if (next[room.id] !== undefined) {
        delete next[room.id];
      } else {
        next[room.id] = Number(room.price) || 0;
      }
      return next;
    });
  };

  const handleRateChange = (roomId: number, valueStr: string) => {
    const clean = Number(valueStr.replace(/\D/g, '')) || 0;
    setSelectedRoomRates((prev) => ({
      ...prev,
      [roomId]: clean
    }));
  };

  const resetReservationForm = () => {
    setEditingReservationId(null);
    setSelectedRoomRates({});
    setResForm({
      guest_name: '',
      guest_document: '',
      guest_phone: '',
      guest_email: '',
      is_group: false,
      group_name: '',
      adults: '2',
      children: '0',
      discount_amount: '0',
      discount_reason: '',
      advance_paid: '0',
      payment_method: 'EFECTIVO',
      status: 'CONFIRMADA',
      observations: ''
    });
  };

  const startEditReservation = (res: ReservationItem) => {
    setEditingReservationId(res.id);
    setAvailFilter((prev) => ({
      ...prev,
      check_in_date: res.check_in_date,
      check_out_date: res.check_out_date,
      check_in_time: res.check_in_time || '15:00',
      check_out_time: res.check_out_time || '13:00',
      room_type_id: 'ALL',
      capacity: '1'
    }));

    const ratesMap: Record<number, number> = {};
    for (const r of res.rooms || []) {
      ratesMap[r.room_id] = Number(r.rate_per_night) || 0;
    }
    setSelectedRoomRates(ratesMap);

    setResForm({
      guest_name: res.guest_name || '',
      guest_document: res.guest_document || '',
      guest_phone: res.guest_phone || '',
      guest_email: res.guest_email || '',
      is_group: Boolean(res.is_group) || (res.rooms && res.rooms.length > 1),
      group_name: res.group_name || '',
      adults: String(res.adults || 1),
      children: String(res.children || 0),
      discount_amount: String(res.discount_amount || 0),
      discount_reason: res.discount_reason || '',
      advance_paid: String(res.advance_paid || 0),
      payment_method: res.payment_method || 'EFECTIVO',
      status: res.status,
      observations: res.observations || ''
    });

    setDetailModalRes(null);
    setActiveTab('NEW');
  };

  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');

    const selectedIds = Object.keys(selectedRoomRates).map(Number);
    if (selectedIds.length === 0) {
      alert('Debe seleccionar al menos una habitación disponible para la reserva.');
      return;
    }

    if (!resForm.guest_name.trim()) {
      alert('El nombre del huésped titular o responsable es obligatorio.');
      return;
    }

    const roomsPayload = selectedIds.map((roomId) => ({
      room_id: roomId,
      rate_per_night: Number(selectedRoomRates[roomId]) || 0
    }));

    const payload = {
      guest_name: resForm.guest_name.trim(),
      guest_document: resForm.guest_document.trim(),
      guest_phone: resForm.guest_phone.trim(),
      guest_email: resForm.guest_email.trim(),
      is_group: resForm.is_group || selectedIds.length > 1,
      group_name: resForm.group_name.trim() || null,
      check_in_date: availFilter.check_in_date,
      check_out_date: availFilter.check_out_date,
      check_in_time: availFilter.check_in_time,
      check_out_time: availFilter.check_out_time,
      adults: Number(resForm.adults) || 1,
      children: Number(resForm.children) || 0,
      rooms: roomsPayload,
      discount_amount: Number(String(resForm.discount_amount).replace(/\./g, '')) || 0,
      discount_reason: resForm.discount_reason.trim() || null,
      advance_paid: Number(String(resForm.advance_paid).replace(/\./g, '')) || 0,
      payment_method: resForm.payment_method,
      status: resForm.status,
      observations: resForm.observations.trim() || null
    };

    try {
      const url = editingReservationId
        ? `${API_URL}${apiBase}/reservations/${editingReservationId}`
        : `${API_URL}${apiBase}/reservations`;
      const method = editingReservationId ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (!resp.ok) {
        const conflictMsg =
          data.conflicts && data.conflicts.length > 0
            ? `\nConflictos detectados:\n- ${data.conflicts.map((c: any) => c.message).join('\n- ')}`
            : '';
        throw new Error((data.error || 'Error guardando la reserva') + conflictMsg);
      }

      setFeedback(
        editingReservationId
          ? `Reserva ${data.code} actualizada correctamente.`
          : `Reserva ${data.code} creada exitosamente (${selectedIds.length} hab. · ${nightsCount} noche(s)).`
      );
      resetReservationForm();
      await fetchAll();
      await checkAvailabilityNow();
      setActiveTab('LIST');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStatusAction = async (
    res: ReservationItem,
    newStatus: ReservationStatus,
    cancellationReason?: string
  ) => {
    try {
      const resp = await fetch(`${API_URL}${apiBase}/reservations/${res.id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: newStatus,
          cancellation_reason: cancellationReason || null
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado de la reserva');
      }

      setFeedback(`Reserva ${res.code} actualizada al estado ${newStatus}.`);
      setCancelModalRes(null);
      setCancelReason('');
      setDetailModalRes(null);
      await fetchAll();
      await checkAvailabilityNow();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRegisterAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceModalRes) return;
    const cleanAmount = Number(advanceAmount.replace(/\./g, '')) || 0;
    if (cleanAmount <= 0) {
      alert('Ingrese un monto de anticipo válido mayor a 0.');
      return;
    }

    try {
      const resp = await fetch(
        `${API_URL}${apiBase}/reservations/${advanceModalRes.id}/advance`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            amount: cleanAmount,
            payment_method: advanceMethod,
            notes: advanceNotes
          })
        }
      );
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Error al registrar anticipo');
      }

      setFeedback(
        `Anticipo de $${cleanAmount.toLocaleString('de-DE')} registrado exitosamente en la reserva ${advanceModalRes.code}.`
      );
      setAdvanceModalRes(null);
      setAdvanceAmount('');
      setAdvanceNotes('');
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // KPIs de Reservas
  const kpis = useMemo(() => {
    const activeList = reservations.filter(
      (r) => r.status === 'PENDIENTE' || r.status === 'CONFIRMADA' || r.status === 'CHECKED_IN'
    );
    const pendingConfirm = reservations.filter((r) => r.status === 'PENDIENTE').length;
    const confirmedCount = reservations.filter((r) => r.status === 'CONFIRMADA').length;
    const groupCount = activeList.filter((r) => Boolean(r.is_group) || r.rooms.length > 1).length;
    const totalAdvance = activeList.reduce((acc, r) => acc + (Number(r.advance_paid) || 0), 0);
    const totalPending = activeList.reduce((acc, r) => acc + (Number(r.pending_balance) || 0), 0);

    return {
      totalActive: activeList.length,
      pendingConfirm,
      confirmedCount,
      groupCount,
      totalAdvance,
      totalPending
    };
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (listStatusFilter !== 'ALL' && r.status !== listStatusFilter) return false;
      if (listSearch.trim()) {
        const q = listSearch.toLowerCase();
        const roomsStr = (r.rooms || []).map((rm) => rm.room_number).join(' ');
        const match =
          r.code.toLowerCase().includes(q) ||
          (r.guest_name || '').toLowerCase().includes(q) ||
          (r.guest_document || '').toLowerCase().includes(q) ||
          (r.group_name || '').toLowerCase().includes(q) ||
          roomsStr.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [reservations, listStatusFilter, listSearch]);

  // Helper para ubicar qué reserva o estancia ocupa una celda (roomId, dayStr) en el calendario
  const getCellEvent = (roomId: number, dayStr: string) => {
    const resMatch = calendarData.reservations.find(
      (r) =>
        Number(r.room_id) === Number(roomId) &&
        r.check_in_date <= dayStr &&
        r.check_out_date > dayStr
    );
    if (resMatch) {
      return { type: 'RESERVATION' as const, data: resMatch };
    }

    const stayMatch = calendarData.stays.find(
      (s) =>
        Number(s.room_id) === Number(roomId) &&
        s.start_date <= dayStr &&
        (!s.end_date || s.end_date > dayStr || s.end_date === s.start_date)
    );
    if (stayMatch) {
      return { type: 'STAY' as const, data: stayMatch };
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Cabecera Principal del Módulo 3 */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <CalendarRange className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Motor de Reservas y Disponibilidad — {activeHotel?.name || 'Hotel'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calendario visual de ocupación, motor anti-doble asignación transaccional, reservas individuales/grupales, descuentos y anticipos.
              </p>
            </div>
          </div>
        </div>

        {/* Selector de Vistas del Módulo 3 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('CALENDAR')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'CALENDAR'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            <span>Calendario Ocupación</span>
          </button>

          {hasPermission('reservations.manage') && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'NEW') resetReservationForm();
                setActiveTab('NEW');
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'NEW'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/70 hover:bg-emerald-100'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{editingReservationId ? 'Editando Reserva' : 'Disponibilidad y Nueva Reserva'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('LIST')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'LIST'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Listado de Reservas ({reservations.length})</span>
          </button>
        </div>
      </div>

      {/* Mensajes de retroalimentación o error */}
      {feedback && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/70 flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button onClick={() => setFeedback('')} className="text-emerald-600 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/70 flex items-center justify-between text-xs font-semibold text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="shrink-0 min-h-10 px-3 rounded-lg bg-white/70 dark:bg-slate-800 text-xs font-bold text-rose-600">
            Cerrar
          </button>
        </div>
      )}

      {/* KPIs Operativos y Financieros de Reservas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Reservas Activas
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {kpis.totalActive}
            </span>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {kpis.confirmedCount} confirmadas
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 block">
            Por Confirmar
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {kpis.pendingConfirm}
            </span>
            <span className="text-xs text-slate-400">Pendientes</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-violet-500 block">
            Reservas Grupales
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-violet-600 dark:text-violet-400">
              {kpis.groupCount}
            </span>
            <span className="text-xs text-slate-400">Multi-habitación</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 block">
            Anticipos Recibidos
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              ${kpis.totalAdvance.toLocaleString('de-DE')}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500 block">
            Saldo por Cobrar
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
              ${kpis.totalPending.toLocaleString('de-DE')}
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          VISTA 1: CALENDARIO VISUAL DE OCUPACIÓN (TIMELINE / GANTT)
      ===================================================================== */}
      {activeTab === 'CALENDAR' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-indigo-600" />
                <span>Calendario Visual de Ocupación y Disponibilidad</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Haz clic en una celda libre para reservar esa habitación y fecha, o en una reserva existente para gestionarla.
              </p>
            </div>

            {/* Controles de fecha y rango del calendario */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarStart(addDaysStr(calendarStart, -7))}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>-7 días</span>
              </button>

              <button
                type="button"
                onClick={() => setCalendarStart(todayStr)}
                className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500 cursor-pointer"
              >
                Hoy
              </button>

              <input
                type="date"
                value={calendarStart}
                onChange={(e) => e.target.value && setCalendarStart(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              />

              <button
                type="button"
                onClick={() => setCalendarStart(addDaysStr(calendarStart, 7))}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <span>+7 días</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <select
                value={calendarDaysCount}
                onChange={(e) => setCalendarDaysCount(Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                <option value={10}>10 días</option>
                <option value={14}>14 días</option>
                <option value={21}>21 días</option>
                <option value={30}>30 días</option>
              </select>
            </div>
          </div>

          {/* Leyenda de colores del Calendario */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Libre (Clic para reservar)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-indigo-600 inline-block" /> Reserva Confirmada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Reserva Pendiente
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-violet-600 inline-block" /> Reserva Grupal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-600 inline-block" /> Huésped Alojado (Ocupada)
            </span>
          </div>

          {/* Tabla Matriz del Calendario */}
          <div className="table-scroll border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full border-collapse text-left min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xs font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 min-w-[96px] sm:min-w-[190px] px-2.5 sm:px-4">
                    Habitación / Tipo
                  </th>
                  {calendarData.days.map((dayStr) => {
                    const dObj = new Date(`${dayStr}T00:00:00`);
                    const dayName = dObj.toLocaleDateString('es-CO', { weekday: 'short' });
                    const dayNum = dObj.getDate();
                    const monthShort = dObj.toLocaleDateString('es-CO', { month: 'short' });
                    const isToday = dayStr === todayStr;

                    return (
                      <th
                        key={dayStr}
                        className={`px-2 py-2.5 text-center border-r border-slate-200/70 dark:border-slate-800 min-w-[78px] ${
                          isToday
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="text-[10px] uppercase font-bold">{dayName}</div>
                        <div className="text-xs font-black">
                          {dayNum} {monthShort}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                {calendarData.rooms.map((room) => (
                  <tr
                    key={room.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2.5 sm:px-4 py-3 border-r border-slate-200 dark:border-slate-800 max-w-[110px] sm:max-w-none">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-slate-900 dark:text-white text-sm">
                          Hab. {room.number}
                        </span>
                        <span className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Piso {room.floor}
                        </span>
                      </div>
                      <div className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {room.room_type_name || 'Estándar'} · ${Number(room.price).toLocaleString('de-DE')}
                      </div>
                    </td>

                    {calendarData.days.map((dayStr) => {
                      const ev = getCellEvent(room.id, dayStr);
                      const isBlockedRoom =
                        room.status === 'FUERA_DE_SERVICIO' || room.status === 'MANTENIMIENTO';

                      if (ev && ev.type === 'RESERVATION') {
                        const r = ev.data;
                        const isGroup = Boolean(r.is_group);
                        const bgClass =
                          r.status === 'CHECKED_IN'
                            ? 'bg-emerald-600 text-white'
                            : isGroup
                            ? 'bg-violet-600 text-white'
                            : r.status === 'PENDIENTE'
                            ? 'bg-amber-500 text-white'
                            : 'bg-indigo-600 text-white';

                        return (
                          <td
                            key={dayStr}
                            onClick={() => {
                              const full = reservations.find((item) => item.id === r.reservation_id);
                              if (full) setDetailModalRes(full);
                            }}
                            title={`${r.code} · ${r.guest_name} (${r.check_in_date} a ${r.check_out_date})`}
                            className="p-1 border-r border-slate-100 dark:border-slate-800 cursor-pointer"
                          >
                            <div
                              className={`w-full h-11 rounded-lg px-1.5 py-1 flex flex-col justify-center ${bgClass} shadow-2xs hover:opacity-90 transition-opacity`}
                            >
                              <span className="text-[10px] font-black truncate leading-tight">
                                {r.guest_name}
                              </span>
                              <span className="text-[9px] opacity-90 truncate">
                                {isGroup ? `👥 ${r.group_name || 'Grupo'}` : r.code}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      if (ev && ev.type === 'STAY') {
                        const s = ev.data;
                        return (
                          <td
                            key={dayStr}
                            title={`Huésped alojado: ${s.guest_name} (Desde ${s.start_date})`}
                            className="p-1 border-r border-slate-100 dark:border-slate-800"
                          >
                            <div className="w-full h-11 rounded-lg px-1.5 py-1 flex flex-col justify-center bg-rose-600 text-white shadow-2xs">
                              <span className="text-[10px] font-black truncate leading-tight">
                                {s.guest_name}
                              </span>
                              <span className="text-[9px] opacity-90 truncate">Ocupada</span>
                            </div>
                          </td>
                        );
                      }

                      if (isBlockedRoom) {
                        return (
                          <td
                            key={dayStr}
                            title={`Habitación en ${room.status}`}
                            className="p-1 border-r border-slate-100 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 text-center"
                          >
                            <span className="text-[9px] font-bold text-slate-400">Bloq.</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={dayStr}
                          onClick={() => {
                            if (!hasPermission('reservations.manage')) return;
                            resetReservationForm();
                            setAvailFilter((prev) => ({
                              ...prev,
                              check_in_date: dayStr,
                              check_out_date: addDaysStr(dayStr, 1)
                            }));
                            setSelectedRoomRates({ [room.id]: Number(room.price) || 0 });
                            setActiveTab('NEW');
                          }}
                          title={`Disponible el ${dayStr} — Clic para reservar Hab. ${room.number}`}
                          className="p-1 border-r border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer group transition-colors"
                        >
                          <div className="w-full h-11 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VISTA 2: MOTOR DE DISPONIBILIDAD Y NUEVA / EDICIÓN DE RESERVA
      ===================================================================== */}
      {activeTab === 'NEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna Izquierda: Buscador de Disponibilidad y Selección de Habitaciones */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Search className="w-5 h-5 text-indigo-600" />
                    <span>1. Consultar Disponibilidad y Seleccionar Habitaciones</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Selecciona una habitación para reserva individual o varias habitaciones para una reserva grupal.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold">
                  {nightsCount} {nightsCount === 1 ? 'Noche' : 'Noches'}
                </span>
              </div>

              {/* Filtros de Fechas, Horas, Tipo y Capacidad */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    Fecha Check-in
                  </label>
                  <input
                    type="date"
                    value={availFilter.check_in_date}
                    onChange={(e) => {
                      const nextIn = e.target.value;
                      setAvailFilter((prev) => ({
                        ...prev,
                        check_in_date: nextIn,
                        check_out_date:
                          prev.check_out_date <= nextIn ? addDaysStr(nextIn, 1) : prev.check_out_date
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    Fecha Check-out
                  </label>
                  <input
                    type="date"
                    min={addDaysStr(availFilter.check_in_date, 1)}
                    value={availFilter.check_out_date}
                    onChange={(e) =>
                      setAvailFilter((prev) => ({ ...prev, check_out_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    Hora Llegada / Salida
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={availFilter.check_in_time}
                      onChange={(e) =>
                        setAvailFilter((prev) => ({ ...prev, check_in_time: e.target.value }))
                      }
                      className="w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    />
                    <input
                      type="time"
                      value={availFilter.check_out_time}
                      onChange={(e) =>
                        setAvailFilter((prev) => ({ ...prev, check_out_time: e.target.value }))
                      }
                      className="w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    Tipo de Habitación
                  </label>
                  <select
                    value={availFilter.room_type_id}
                    onChange={(e) =>
                      setAvailFilter((prev) => ({ ...prev, room_type_id: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="ALL">Todos los tipos</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={String(rt.id)}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    Capacidad Mínima
                  </label>
                  <select
                    value={availFilter.capacity}
                    onChange={(e) =>
                      setAvailFilter((prev) => ({ ...prev, capacity: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="1">1+ Huéspedes</option>
                    <option value="2">2+ Huéspedes</option>
                    <option value="3">3+ Huéspedes</option>
                    <option value="4">4+ Huéspedes</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => checkAvailabilityNow()}
                    disabled={checkingAvailability}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    {checkingAvailability ? 'Verificando...' : 'Actualizar Disponibilidad'}
                  </button>
                </div>
              </div>

              {/* Lista de Habitaciones Disponibles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Habitaciones Disponibles ({availableRooms.length})</span>
                  </h3>
                  {Object.keys(selectedRoomRates).length > 0 && (
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {Object.keys(selectedRoomRates).length} seleccionada(s)
                    </span>
                  )}
                </div>

                {availableRooms.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center text-xs text-slate-500">
                    No hay habitaciones disponibles que coincidan con las fechas y filtros seleccionados.
                  </div>
                ) : (
                  <div className="list-scroll grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableRooms.map((room) => {
                      const isSelected = selectedRoomRates[room.id] !== undefined;
                      return (
                        <div
                          key={room.id}
                          onClick={() => toggleSelectRoom(room)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-500/15 border-indigo-500 shadow-xs'
                              : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded text-indigo-600"
                              />
                              <span className="font-black text-sm text-slate-900 dark:text-white">
                                Habitación {room.number}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                              Piso {room.floor} · Cap. {room.effective_capacity || room.capacity}
                            </span>
                          </div>

                          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                            <span>{room.room_type_name || 'Estándar'} · {room.bed_config}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              ${Number(room.price).toLocaleString('de-DE')}/noche
                            </span>
                          </div>

                          {isSelected && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2.5 pt-2.5 border-t border-indigo-200/70 dark:border-indigo-500/70 flex items-center justify-between gap-2"
                            >
                              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                Tarifa por noche ($):
                              </span>
                              <input
                                type="text"
                                value={Number(selectedRoomRates[room.id] || 0).toLocaleString('de-DE')}
                                onChange={(e) => handleRateChange(room.id, e.target.value)}
                                className="w-28 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-500 text-xs font-black text-right"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Habitaciones con Conflicto Detectado */}
              {conflictingRooms.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    <span>
                      Habitaciones No Disponibles en este Rango ({conflictingRooms.length})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {conflictingRooms.map((cRoom) => (
                      <div
                        key={cRoom.id}
                        className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-500/15 border border-rose-200/70 dark:border-rose-500/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-black text-rose-800 dark:text-rose-300">
                            Hab. {cRoom.number} ({cRoom.room_type_name || 'Estándar'})
                          </span>
                          <ul className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                            {cRoom.conflicts.map((conf, idx) => (
                              <li key={idx}>• {conf.message}</li>
                            ))}
                          </ul>
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 shrink-0 self-start sm:self-center">
                          Conflicto Bloqueado
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Datos del Huésped, Descuentos, Anticipo y Confirmación */}
          <div className="lg:col-span-5">
            <form
              onSubmit={handleSaveReservation}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-emerald-600" />
                  <span>
                    {editingReservationId
                      ? '2. Modificar Reserva Existente'
                      : '2. Datos del Titular, Tarifas y Anticipo'}
                  </span>
                </h2>
                {editingReservationId && (
                  <button
                    type="button"
                    onClick={resetReservationForm}
                    className="shrink-0 min-h-10 px-3 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              {/* Switch Reserva Grupal */}
              <div className="p-3 rounded-2xl bg-violet-50/70 dark:bg-violet-500/15 border border-violet-200/70 dark:border-violet-500/70 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold text-violet-900 dark:text-violet-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-600" />
                    <span>Reserva Grupal / Corporativa / Multi-habitación</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={resForm.is_group || financialSummary.roomsCount > 1}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, is_group: e.target.checked }))
                    }
                    className="rounded text-violet-600"
                  />
                </label>

                {(resForm.is_group || financialSummary.roomsCount > 1) && (
                  <input
                    type="text"
                    placeholder="Nombre del grupo, empresa o delegación (Ej: Delegación Deportiva)"
                    value={resForm.group_name}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, group_name: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-500 text-xs font-semibold"
                  />
                )}
              </div>

              {/* Datos del Huésped Titular */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Nombre Completo del Huésped Titular *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carlos Andrés Mendoza"
                    value={resForm.guest_name}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, guest_name: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Documento / NIT / Pasaporte
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 1094950123"
                    value={resForm.guest_document}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, guest_document: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 3104567890"
                    value={resForm.guest_phone}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, guest_phone: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    placeholder="cliente@correo.com"
                    value={resForm.guest_email}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, guest_email: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      Adultos
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={resForm.adults}
                      onChange={(e) =>
                        setResForm((prev) => ({ ...prev, adults: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      Niños
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={resForm.children}
                      onChange={(e) =>
                        setResForm((prev) => ({ ...prev, children: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Descuentos Autorizados y Anticipos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Descuento Autorizado ($)
                  </label>
                  <input
                    type="text"
                    value={resForm.discount_amount}
                    onChange={(e) =>
                      setResForm((prev) => ({
                        ...prev,
                        discount_amount: e.target.value.replace(/\D/g, '')
                      }))
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Motivo del Descuento
                  </label>
                  <input
                    type="text"
                    value={resForm.discount_reason}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, discount_reason: e.target.value }))
                    }
                    placeholder="Convenio, frecuente..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>

                {!editingReservationId && (
                  <>
                    <div>
                      <label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                        Anticipo Inicial Recibido ($)
                      </label>
                      <input
                        type="text"
                        value={resForm.advance_paid}
                        onChange={(e) =>
                          setResForm((prev) => ({
                            ...prev,
                            advance_paid: e.target.value.replace(/\D/g, '')
                          }))
                        }
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500 text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">
                        Medio de Pago Anticipo
                      </label>
                      <select
                        value={resForm.payment_method}
                        onChange={(e) =>
                          setResForm((prev) => ({ ...prev, payment_method: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia / Nequi / Daviplata</option>
                        <option value="TARJETA">Tarjeta Débito / Crédito</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Estado Inicial de Reserva
                  </label>
                  <select
                    value={resForm.status}
                    onChange={(e) =>
                      setResForm((prev) => ({
                        ...prev,
                        status: e.target.value as ReservationStatus
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="CONFIRMADA">Confirmada</option>
                    <option value="PENDIENTE">Pendiente de Confirmación</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Observaciones / Requerimientos
                  </label>
                  <input
                    type="text"
                    value={resForm.observations}
                    onChange={(e) =>
                      setResForm((prev) => ({ ...prev, observations: e.target.value }))
                    }
                    placeholder="Llegada tarde, cuna adicional..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Resumen Financiero Automático */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>
                    Habitaciones ({financialSummary.roomsCount}) × {nightsCount} noche(s):
                  </span>
                  <span className="font-bold">
                    ${financialSummary.subtotal.toLocaleString('de-DE')}
                  </span>
                </div>
                {financialSummary.discount > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span>Descuento autorizado:</span>
                    <span className="font-bold">
                      -${financialSummary.discount.toLocaleString('de-DE')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Reserva:</span>
                  <span>${financialSummary.total.toLocaleString('de-DE')}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Anticipo Abonado:</span>
                  <span>${financialSummary.advance.toLocaleString('de-DE')}</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-extrabold">
                  <span>Saldo Pendiente al Check-in:</span>
                  <span>${financialSummary.pending.toLocaleString('de-DE')}</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
              >
                {editingReservationId
                  ? 'Guardar Cambios en la Reserva'
                  : 'Confirmar y Registrar Reserva'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          VISTA 3: LISTADO Y GESTIÓN INTEGRAL DE RESERVAS
      ===================================================================== */}
      {activeTab === 'LIST' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-indigo-600" />
                <span>Gestión de Reservas Individuales y Grupales</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Confirma reservas pendientes, registra anticipos en caja, modifica fechas/habitaciones o ejecuta el Check-in directo.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Código, huésped, grupo, hab..."
                  className="pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                />
              </div>

              <select
                value={listStatusFilter}
                onChange={(e) => setListStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                <option value="ALL">Todos los estados</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="CONFIRMADA">Confirmadas</option>
                <option value="CHECKED_IN">En Casa (Check-in)</option>
                <option value="CANCELADA">Canceladas</option>
                <option value="NO_SHOW">No-Show</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Cargando reservas del establecimiento...
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No se encontraron reservas con los criterios seleccionados.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Código / Tipo</th>
                    <th className="py-3 px-3">Huésped / Grupo</th>
                    <th className="py-3 px-3">Habitaciones</th>
                    <th className="py-3 px-3">Check-in → Check-out</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-3 text-right">Total / Anticipo / Saldo</th>
                    <th className="py-3 px-3 text-right">Acciones Operativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredReservations.map((res) => {
                    const badge = STATUS_BADGE[res.status] || STATUS_BADGE.PENDIENTE;
                    const isGroup = Boolean(res.is_group) || (res.rooms && res.rooms.length > 1);

                    return (
                      <tr
                        key={res.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-3">
                          <div className="font-black text-slate-900 dark:text-white">
                            {res.code}
                          </div>
                          {isGroup ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 mt-0.5">
                              <Users className="w-3 h-3" /> Grupal ({res.rooms.length} hab)
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Individual</span>
                          )}
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-800 dark:text-slate-100">
                            {res.guest_name}
                          </div>
                          {res.group_name && (
                            <div className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                              🏢 {res.group_name}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400">
                            {res.guest_document ? `Doc: ${res.guest_document}` : ''}{' '}
                            {res.guest_phone ? `· 📞 ${res.guest_phone}` : ''}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(res.rooms || []).map((rm) => (
                              <span
                                key={rm.room_id}
                                className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 text-[11px]"
                              >
                                Hab. {rm.room_number}
                              </span>
                            ))}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {res.adults} adulto(s), {res.children || 0} niño(s)
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {res.check_in_date} → {res.check_out_date}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {res.nights || calcNightsBetween(res.check_in_date, res.check_out_date)}{' '}
                            noche(s) · {res.check_in_time || '15:00'}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {badge.label}
                          </span>
                          {res.cancellation_reason && (
                            <div className="text-[10px] text-rose-500 mt-1 max-w-[160px] truncate">
                              Motivo: {res.cancellation_reason}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="font-black text-slate-900 dark:text-white">
                            ${Number(res.total_price || 0).toLocaleString('de-DE')}
                          </div>
                          {Number(res.discount_amount) > 0 && (
                            <div className="text-[10px] text-amber-600">
                              Desc: -${Number(res.discount_amount).toLocaleString('de-DE')}
                            </div>
                          )}
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            Abono: ${Number(res.advance_paid || 0).toLocaleString('de-DE')}
                          </div>
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                            Saldo: ${Number(res.pending_balance || 0).toLocaleString('de-DE')}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {res.status === 'PENDIENTE' && hasPermission('reservations.manage') && (
                              <button
                                type="button"
                                onClick={() => handleStatusAction(res, 'CONFIRMADA')}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer"
                                title="Confirmar reserva"
                              >
                                Confirmar
                              </button>
                            )}

                            {(res.status === 'PENDIENTE' || res.status === 'CONFIRMADA') &&
                              hasPermission('reception.checkin') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `¿Realizar Check-in ahora para la reserva ${res.code} (${res.guest_name})? Esto marcará la(s) habitación(es) como OCUPADA y abrirá el folio de estancia.`
                                      )
                                    ) {
                                      handleStatusAction(res, 'CHECKED_IN');
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                                  title="Realizar Check-in y ocupar habitaciones"
                                >
                                  Check-in
                                </button>
                              )}

                            {(res.status === 'PENDIENTE' ||
                              res.status === 'CONFIRMADA' ||
                              res.status === 'CHECKED_IN') &&
                              hasPermission('reservations.manage') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdvanceModalRes(res);
                                    setAdvanceAmount('');
                                    setAdvanceNotes('');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500 font-bold text-[11px] cursor-pointer"
                                  title="Registrar anticipo o abono"
                                >
                                  + Anticipo
                                </button>
                              )}

                            {(res.status === 'PENDIENTE' || res.status === 'CONFIRMADA') &&
                              hasPermission('reservations.manage') && (
                                <button
                                  type="button"
                                  onClick={() => startEditReservation(res)}
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 cursor-pointer"
                                  title="Modificar fechas, habitaciones o tarifas"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              )}

                            {(res.status === 'PENDIENTE' || res.status === 'CONFIRMADA') &&
                              hasPermission('reservations.manage') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelModalRes(res);
                                    setCancelReason('');
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 text-rose-600 dark:text-rose-400 cursor-pointer"
                                  title="Cancelar reserva"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL: DETALLE RÁPIDO DESDE EL CALENDARIO
      ===================================================================== */}
      {detailModalRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                  {detailModalRes.code}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {detailModalRes.guest_name}
                </h3>
              </div>
              <button
                onClick={() => setDetailModalRes(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl">
              <div>
                <span className="text-slate-400 block">Fechas:</span>
                <span className="font-bold">
                  {detailModalRes.check_in_date} → {detailModalRes.check_out_date}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Habitaciones:</span>
                <span className="font-bold">
                  {(detailModalRes.rooms || []).map((r) => `Hab. ${r.room_number}`).join(', ')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Total Reserva:</span>
                <span className="font-black text-slate-900 dark:text-white">
                  ${Number(detailModalRes.total_price).toLocaleString('de-DE')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Anticipo / Saldo:</span>
                <span className="font-bold text-emerald-600">
                  ${Number(detailModalRes.advance_paid).toLocaleString('de-DE')}
                </span>{' '}
                /{' '}
                <span className="font-bold text-rose-600">
                  ${Number(detailModalRes.pending_balance).toLocaleString('de-DE')}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {(detailModalRes.status === 'PENDIENTE' ||
                detailModalRes.status === 'CONFIRMADA') && (
                <>
                  <button
                    type="button"
                    onClick={() => startEditReservation(detailModalRes)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    Modificar Reserva
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdvanceModalRes(detailModalRes);
                      setDetailModalRes(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Registrar Anticipo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusAction(detailModalRes, 'CHECKED_IN')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Ejecutar Check-in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: REGISTRAR ANTICIPO EN CAJA
      ===================================================================== */}
      {advanceModalRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleRegisterAdvance}
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Registrar Anticipo — {advanceModalRes.code}
              </h3>
              <button
                type="button"
                onClick={() => setAdvanceModalRes(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Huésped: <strong>{advanceModalRes.guest_name}</strong> · Saldo pendiente actual:{' '}
              <strong className="text-rose-600">
                ${Number(advanceModalRes.pending_balance).toLocaleString('de-DE')}
              </strong>
            </p>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Monto del Anticipo ($) *
              </label>
              <input
                type="text"
                required
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej: 50000"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-black"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Medio de Pago
              </label>
              <select
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia / Nequi / Daviplata</option>
                <option value="TARJETA">Tarjeta Débito / Crédito</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Comprobante / Observación
              </label>
              <input
                type="text"
                value={advanceNotes}
                onChange={(e) => setAdvanceNotes(e.target.value)}
                placeholder="Ref transferencia o nota de caja"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdvanceModalRes(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Guardar Anticipo en Caja
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: CANCELAR RESERVA CON MOTIVO DE AUDITORÍA
      ===================================================================== */}
      {cancelModalRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-rose-600">
                Cancelar Reserva {cancelModalRes.code}
              </h3>
              <button
                type="button"
                onClick={() => setCancelModalRes(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Esta acción liberará las habitaciones asignadas para nuevas reservas y registrará la cancelación en la bitácora de auditoría.
            </p>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Motivo de la Cancelación *
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej: Solicitud del cliente, cambio de fecha, No-Show..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalRes(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() =>
                  handleStatusAction(
                    cancelModalRes,
                    'CANCELADA',
                    cancelReason.trim() || 'Cancelada por recepción'
                  )
                }
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Confirmar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
