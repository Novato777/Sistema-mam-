import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Plus,
  User,
  X,
  ClipboardList,
  Trash2,
  Pencil,
  Settings,
  BedDouble,
  Users,
  History,
  Search,
  Filter,
  RotateCcw,
  Layers,
  Tag,
  CalendarRange
} from 'lucide-react';

import API_URL from '../config/api';
import { getTodayString } from '../utils/date';
import { useHotel, HotelEntity } from '../context/HotelContext';

export type RoomStatus =
  | 'DISPONIBLE'
  | 'RESERVADA'
  | 'OCUPADA'
  | 'PENDIENTE_LIMPIEZA'
  | 'EN_LIMPIEZA'
  | 'LIMPIA'
  | 'INSPECCION_PENDIENTE'
  | 'FUERA_DE_SERVICIO'
  | 'MANTENIMIENTO';

export const ROOM_STATUS_CATALOG: {
  value: RoomStatus;
  label: string;
  badgeClass: string;
  cardClass: string;
  dotClass: string;
}[] = [
  {
    value: 'DISPONIBLE',
    label: 'Disponible',
    badgeClass:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500',
    cardClass:
      'bg-white dark:bg-slate-900 border-emerald-200/80 dark:border-emerald-500/70 hover:border-emerald-400',
    dotClass: 'bg-emerald-500'
  },
  {
    value: 'LIMPIA',
    label: 'Limpia',
    badgeClass:
      'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500',
    cardClass:
      'bg-teal-50/20 dark:bg-slate-900 border-teal-200/80 dark:border-teal-500/70 hover:border-teal-400',
    dotClass: 'bg-teal-500'
  },
  {
    value: 'RESERVADA',
    label: 'Reservada',
    badgeClass:
      'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500',
    cardClass:
      'bg-indigo-50/35 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/70 hover:border-indigo-400',
    dotClass: 'bg-indigo-500'
  },
  {
    value: 'OCUPADA',
    label: 'Ocupada',
    badgeClass:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500',
    cardClass:
      'bg-rose-50/35 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/70 hover:border-rose-400',
    dotClass: 'bg-rose-500'
  },
  {
    value: 'PENDIENTE_LIMPIEZA',
    label: 'Pendiente de limpieza',
    badgeClass:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500',
    cardClass:
      'bg-amber-50/35 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/70 hover:border-amber-400',
    dotClass: 'bg-amber-500'
  },
  {
    value: 'EN_LIMPIEZA',
    label: 'En limpieza',
    badgeClass:
      'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500',
    cardClass:
      'bg-sky-50/35 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/70 hover:border-sky-400',
    dotClass: 'bg-sky-500'
  },
  {
    value: 'INSPECCION_PENDIENTE',
    label: 'Inspección pendiente',
    badgeClass:
      'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500',
    cardClass:
      'bg-purple-50/35 dark:bg-purple-500/15 border-purple-200 dark:border-purple-500/70 hover:border-purple-400',
    dotClass: 'bg-purple-500'
  },
  {
    value: 'MANTENIMIENTO',
    label: 'En mantenimiento',
    badgeClass:
      'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500',
    cardClass:
      'bg-orange-50/35 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/70 hover:border-orange-400',
    dotClass: 'bg-orange-500'
  },
  {
    value: 'FUERA_DE_SERVICIO',
    label: 'Fuera de servicio',
    badgeClass:
      'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    cardClass:
      'bg-slate-100/70 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 hover:border-slate-400',
    dotClass: 'bg-slate-500'
  }
];

const getStatusMeta = (status: string) => {
  return (
    ROOM_STATUS_CATALOG.find((s) => s.value === status) ||
    ROOM_STATUS_CATALOG[0]
  );
};

interface RoomTypeItem {
  id: number;
  name: string;
  code: string;
  base_price: number;
  rate_3_days?: number | null;
  rate_weekly?: number | null;
  capacity: number;
  bed_config: string;
  amenities: string;
  photos_list?: string[];
  description?: string;
  rooms_count?: number;
}

interface Room {
  id: number;
  number: string;
  floor: string;
  active: number;
  room_type_id?: number;
  room_type_name?: string;
  room_type_code?: string;
  price: number;
  rate_3_days?: number | null;
  rate_weekly?: number | null;
  capacity: number;
  bed_config: string;
  amenities: string;
  photos: string[];
  status: RoomStatus;
  observations?: string;
  stays_count?: number;
  guest_name?: string;
  guest_phone?: string;
  guest_document?: string;
  check_in_date?: string;
  payment_type?: string;
  next_payment_date?: string;
  pending_balance?: number;
  total_pending?: number;
  accrued_periods?: number;
  accrued_amount?: number;
}

interface RoomHistoryResponse {
  room: {
    id: number;
    number: string;
    floor: string;
    room_type_name: string;
    status: RoomStatus;
    active: number;
  };
  occupancy_history: {
    stay_id: number;
    guest_name: string;
    guest_document: string;
    guest_phone: string;
    check_in_time: string;
    check_out_time: string | null;
    payment_type: string;
    rate_per_period: number;
    total_charges: number;
    total_paid: number;
    balance: number;
    status: string;
  }[];
  cleaning_history: {
    id: number;
    category: string;
    previous_status: string;
    new_status: string;
    notes: string;
    created_at: string;
    user_name?: string;
  }[];
  maintenance_history: {
    id: number;
    category: string;
    previous_status: string;
    new_status: string;
    notes: string;
    cost: number;
    created_at: string;
    user_name?: string;
  }[];
}

interface DashboardData {
  hotel?: HotelEntity;
  rooms: {
    total: number;
    occupied: number;
    free: number;
    available?: number;
    reserved?: number;
    cleaning?: number;
    maintenance?: number;
    occupancy_rate?: number;
  };
  today: { income: number; expense: number; balance: number };
  month: { income: number; expense: number; balance: number };
}

interface Transaction {
  id: number;
  type: 'Ingreso' | 'Gasto';
  category: string;
  payment_method?: string;
  amount: number;
  date: string;
  description?: string;
}

export default function Hotel() {
  const location = useLocation();
  const params = useParams<{ hotelId?: string }>();
  const { setActiveHotelId, refreshHotels, hasPermission } = useHotel();

  const resolvedHotelId = params.hotelId
    ? parseInt(params.hotelId, 10)
    : location.pathname === '/hotel-2'
    ? 2
    : 1;

  const apiBase = `/api/hotels/${resolvedHotelId}`;

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros del Rack Visual de Habitaciones
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [floorFilter, setFloorFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);

  // Modales operativos y administrativos
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRoomTypesModal, setShowRoomTypesModal] = useState(false);

  // Modal de Historial por Habitación (Ocupación, Limpieza, Mantenimiento)
  const [historyData, setHistoryData] = useState<RoomHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<'OCCUPANCY' | 'CLEANING' | 'MAINTENANCE'>('OCCUPANCY');
  const [historyEventForm, setHistoryEventForm] = useState({
    category: 'CLEANING',
    new_status: 'LIMPIA' as RoomStatus,
    notes: '',
    cost: ''
  });

  // Cambio rápido de estado en modal detalle
  const [statusChangeNotes, setStatusChangeNotes] = useState('');
  const [checkoutNextStatus, setCheckoutNextStatus] = useState<RoomStatus>('PENDIENTE_LIMPIEZA');

  // Formulario Crear Habitación (Módulo 2 completo)
  const [roomForm, setRoomForm] = useState({
    number: '',
    floor: '1',
    room_type_id: '',
    price: '',
    rate_3_days: '',
    rate_weekly: '',
    capacity: '2',
    bed_config: '1 Cama Doble',
    amenities: 'Baño privado, TV, Wi-Fi, Ventilador',
    photos: '',
    status: 'DISPONIBLE' as RoomStatus,
    observations: ''
  });

  // Formulario Editar Habitación y Huésped
  const [editForm, setEditForm] = useState({
    number: '',
    floor: '1',
    room_type_id: '',
    price: '',
    rate_3_days: '',
    rate_weekly: '',
    capacity: '2',
    bed_config: '1 Cama Doble',
    amenities: '',
    photos: '',
    status: 'DISPONIBLE' as RoomStatus,
    observations: '',
    guest_name: '',
    guest_document: '',
    guest_phone: '',
    payment_type: 'Pago diario',
    next_payment_date: getTodayString(),
    pending_balance: ''
  });

  // Formulario Tipos de Habitación
  const [rtForm, setRtForm] = useState({
    id: 0,
    name: '',
    code: 'STD',
    base_price: '',
    rate_3_days: '',
    rate_weekly: '',
    capacity: '2',
    bed_config: '1 Cama Doble',
    amenities: 'Baño privado, TV, Wi-Fi',
    photos: '',
    description: ''
  });

  // Formulario Asignación Huésped
  const [guestForm, setGuestForm] = useState({
    name: '',
    document: '',
    phone: '',
    checkInDate: getTodayString(),
    paymentType: 'Pago diario',
    initialPayment: ''
  });

  // Formulario Registrar Pago
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayString());

  // Formulario Crear Transacción Manual
  const [txForm, setTxForm] = useState({
    type: 'Gasto',
    category: 'Mercado',
    amount: '',
    date: getTodayString(),
    description: ''
  });

  const token = localStorage.getItem('token');

  const fetchData = async () => {
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-Hotel-Id': String(resolvedHotelId)
      };

      const [dbRes, roomsRes, rtRes, txRes] = await Promise.all([
        fetch(`${API_URL}${apiBase}/dashboard`, { headers }),
        fetch(
          `${API_URL}${apiBase}/rooms${includeInactive ? '?includeInactive=1' : ''}`,
          { headers }
        ),
        fetch(`${API_URL}${apiBase}/room-types`, { headers }),
        fetch(`${API_URL}${apiBase}/transactions`, { headers })
      ]);

      if (!dbRes.ok || !roomsRes.ok) {
        throw new Error('Error al obtener datos del establecimiento hotelero');
      }

      const dbData = await dbRes.json();
      const roomsData: Room[] = await roomsRes.json();
      const rtData: RoomTypeItem[] = rtRes.ok ? await rtRes.json() : [];
      const txData: Transaction[] = txRes.ok ? await txRes.json() : [];

      setDashboard(dbData);
      setRooms(roomsData);
      setRoomTypes(rtData);
      setTransactions(txData);

      if (selectedRoom) {
        const updatedSel = roomsData.find((r) => r.id === selectedRoom.id);
        if (updatedSel) setSelectedRoom(updatedSel);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveHotelId(resolvedHotelId);
    setLoading(true);
    fetchData();
  }, [resolvedHotelId, location.pathname, includeInactive]);

  const floorsList = useMemo(() => {
    const s = new Set<string>();
    rooms.forEach((r) => s.add(r.floor || '1'));
    return Array.from(s).sort();
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'GROUP_CLEANING') {
          if (
            ![
              'PENDIENTE_LIMPIEZA',
              'EN_LIMPIEZA',
              'LIMPIA',
              'INSPECCION_PENDIENTE'
            ].includes(r.status)
          ) {
            return false;
          }
        } else if (statusFilter === 'GROUP_MAINTENANCE') {
          if (!['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(r.status)) {
            return false;
          }
        } else if (r.status !== statusFilter) {
          return false;
        }
      }

      if (floorFilter !== 'ALL' && (r.floor || '1') !== floorFilter) {
        return false;
      }

      if (typeFilter !== 'ALL' && String(r.room_type_id) !== typeFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = r.number.toLowerCase().includes(q);
        const matchGuest = (r.guest_name || '').toLowerCase().includes(q);
        const matchDoc = (r.guest_document || '').toLowerCase().includes(q);
        const matchType = (r.room_type_name || '').toLowerCase().includes(q);
        const matchAmenities = (r.amenities || '').toLowerCase().includes(q);
        if (!matchNum && !matchGuest && !matchDoc && !matchType && !matchAmenities) {
          return false;
        }
      }

      return true;
    });
  }, [rooms, statusFilter, floorFilter, typeFilter, searchQuery]);

  const openHistoryModal = async (room: Room) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}${apiBase}/rooms/${room.id}/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        }
      });
      if (res.ok) {
        const data: RoomHistoryResponse = await res.json();
        setHistoryData(data);
        setHistoryEventForm({
          category: 'CLEANING',
          new_status: room.status,
          notes: '',
          cost: ''
        });
      }
    } catch (err) {
      console.error('Error al cargar historial de habitación:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAddHistoryEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyData) return;

    try {
      const res = await fetch(`${API_URL}${apiBase}/rooms/${historyData.room.id}/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          category: historyEventForm.category,
          new_status: historyEventForm.new_status,
          notes: historyEventForm.notes,
          cost: historyEventForm.cost
            ? parseFloat(historyEventForm.cost.replace(/\./g, ''))
            : 0
        })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al guardar registro en bitácora');
      }

      setHistoryEventForm({ ...historyEventForm, notes: '', cost: '' });
      await fetchData();
      const targetRoom = rooms.find((r) => r.id === historyData.room.id);
      if (targetRoom) await openHistoryModal(targetRoom);
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleQuickStatusChange = async (room: Room, newStatus: RoomStatus) => {
    try {
      const res = await fetch(`${API_URL}${apiBase}/rooms/${room.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          status: newStatus,
          notes: statusChangeNotes || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo cambiar el estado de la habitación');
      }

      setStatusChangeNotes('');
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteOrDeactivateRoom = async (room: Room) => {
    const confirmMsg =
      (room.stays_count || 0) > 0
        ? `La habitación #${room.number} tiene ${room.stays_count} estadía(s) en su historial. Por protección de auditoría será DESACTIVADA conservando intacto su historial. ¿Deseas continuar?`
        : `¿Deseas eliminar o desactivar la habitación #${room.number}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${API_URL}${apiBase}/rooms/${room.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar habitación');

      setSelectedRoom(null);
      setShowEditModal(false);
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleActivateRoom = async (room: Room) => {
    try {
      const res = await fetch(`${API_URL}${apiBase}/rooms/${room.id}/activate`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reactivar habitación');

      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAssignGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;

    try {
      const initialPayVal = guestForm.initialPayment
        ? parseFloat(guestForm.initialPayment.replace(/\./g, ''))
        : undefined;

      const response = await fetch(`${API_URL}${apiBase}/rooms/${selectedRoom.id}/guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          ...guestForm,
          initialPayment: initialPayVal
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al asignar huésped');
      }

      setShowAssignModal(false);
      setSelectedRoom(null);
      setGuestForm({
        name: '',
        document: '',
        phone: '',
        checkInDate: getTodayString(),
        paymentType: 'Pago diario',
        initialPayment: ''
      });
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const submitPayment = async (amountNum: number, pDate: string) => {
    if (!selectedRoom) return;
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor ingrese un monto válido mayor a cero.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}${apiBase}/rooms/${selectedRoom.id}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          amount: amountNum,
          date: pDate
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al registrar pago');
      }

      setShowPaymentModal(false);
      setSelectedRoom(null);
      setPaymentAmount('');
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(paymentAmount.replace(/\./g, ''));
    await submitPayment(parsedAmount, paymentDate);
  };

  const openEditModal = (room: Room) => {
    setSelectedRoom(room);
    setEditForm({
      number: room.number,
      floor: room.floor || '1',
      room_type_id: room.room_type_id ? String(room.room_type_id) : '',
      price: room.price ? Number(room.price).toLocaleString('de-DE') : '',
      rate_3_days: room.rate_3_days ? Number(room.rate_3_days).toLocaleString('de-DE') : '',
      rate_weekly: room.rate_weekly ? Number(room.rate_weekly).toLocaleString('de-DE') : '',
      capacity: String(room.capacity || 2),
      bed_config: room.bed_config || '1 Cama Doble',
      amenities: room.amenities || 'Baño privado, TV, Wi-Fi',
      photos: (room.photos || []).join(', '),
      status: room.status,
      observations: room.observations || '',
      guest_name: room.guest_name || '',
      guest_document: room.guest_document || '',
      guest_phone: room.guest_phone || '',
      payment_type: room.payment_type || 'Pago diario',
      next_payment_date: room.next_payment_date || getTodayString(),
      pending_balance:
        room.pending_balance !== undefined
          ? Number(room.pending_balance).toLocaleString('de-DE')
          : '0'
    });
    setShowEditModal(true);
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;

    try {
      const response = await fetch(`${API_URL}${apiBase}/rooms/${selectedRoom.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          number: editForm.number,
          floor: editForm.floor,
          room_type_id: editForm.room_type_id ? Number(editForm.room_type_id) : null,
          price: parseFloat(editForm.price.replace(/\./g, '')),
          rate_3_days: editForm.rate_3_days
            ? parseFloat(editForm.rate_3_days.replace(/\./g, ''))
            : null,
          rate_weekly: editForm.rate_weekly
            ? parseFloat(editForm.rate_weekly.replace(/\./g, ''))
            : null,
          capacity: Number(editForm.capacity || 2),
          bed_config: editForm.bed_config,
          amenities: editForm.amenities,
          photos: editForm.photos
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          status: editForm.status,
          observations: editForm.observations,
          guest_name: editForm.guest_name,
          guest_document: editForm.guest_document,
          guest_phone: editForm.guest_phone,
          payment_type: editForm.payment_type,
          next_payment_date: editForm.next_payment_date,
          pending_balance: parseFloat(editForm.pending_balance.replace(/\./g, '')) || 0
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al actualizar habitación');
      }

      setShowEditModal(false);
      setSelectedRoom(null);
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCheckout = async (roomId: number, nextStatus: RoomStatus = 'DISPONIBLE') => {
    if (!confirm('¿Está seguro de realizar el Check-out y liberar la habitación?')) return;

    try {
      const response = await fetch(`${API_URL}${apiBase}/rooms/${roomId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({ nextStatus })
      });

      if (!response.ok) {
        throw new Error('Error al liberar habitación');
      }

      setSelectedRoom(null);
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}${apiBase}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          number: roomForm.number,
          floor: roomForm.floor || '1',
          room_type_id: roomForm.room_type_id ? Number(roomForm.room_type_id) : null,
          price: parseFloat(roomForm.price.replace(/\./g, '')),
          rate_3_days: roomForm.rate_3_days
            ? parseFloat(roomForm.rate_3_days.replace(/\./g, ''))
            : null,
          rate_weekly: roomForm.rate_weekly
            ? parseFloat(roomForm.rate_weekly.replace(/\./g, ''))
            : null,
          capacity: Number(roomForm.capacity || 2),
          bed_config: roomForm.bed_config,
          amenities: roomForm.amenities,
          photos: roomForm.photos
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          status: roomForm.status,
          observations: roomForm.observations
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al crear habitación');
      }

      setShowAddRoomModal(false);
      setRoomForm({
        number: '',
        floor: '1',
        room_type_id: '',
        price: '',
        rate_3_days: '',
        rate_weekly: '',
        capacity: '2',
        bed_config: '1 Cama Doble',
        amenities: 'Baño privado, TV, Wi-Fi, Ventilador',
        photos: '',
        status: 'DISPONIBLE',
        observations: ''
      });
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveRoomType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isEdit = rtForm.id > 0;
      const url = isEdit
        ? `${API_URL}${apiBase}/room-types/${rtForm.id}`
        : `${API_URL}${apiBase}/room-types`;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          name: rtForm.name,
          code: rtForm.code,
          base_price: parseFloat(rtForm.base_price.replace(/\./g, '')) || 0,
          rate_3_days: rtForm.rate_3_days
            ? parseFloat(rtForm.rate_3_days.replace(/\./g, ''))
            : null,
          rate_weekly: rtForm.rate_weekly
            ? parseFloat(rtForm.rate_weekly.replace(/\./g, ''))
            : null,
          capacity: Number(rtForm.capacity || 2),
          bed_config: rtForm.bed_config,
          amenities: rtForm.amenities,
          photos: rtForm.photos
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          description: rtForm.description
        })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al guardar tipo de habitación');
      }

      setRtForm({
        id: 0,
        name: '',
        code: 'STD',
        base_price: '',
        rate_3_days: '',
        rate_weekly: '',
        capacity: '2',
        bed_config: '1 Cama Doble',
        amenities: 'Baño privado, TV, Wi-Fi',
        photos: '',
        description: ''
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteRoomType = async (rtId: number) => {
    if (!window.confirm('¿Eliminar este tipo de habitación?')) return;
    try {
      const res = await fetch(`${API_URL}${apiBase}/room-types/${rtId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        }
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo eliminar');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddTx = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}${apiBase}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        },
        body: JSON.stringify({
          type: txForm.type,
          category: txForm.category,
          amount: parseFloat(txForm.amount.replace(/\./g, '')),
          date: txForm.date,
          description: txForm.description
        })
      });

      if (!response.ok) {
        throw new Error('Error al registrar transacción');
      }

      setShowAddTxModal(false);
      setTxForm({
        type: 'Gasto',
        category: 'Mercado',
        amount: '',
        date: getTodayString(),
        description: ''
      });
      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (
      !window.confirm(
        '¿Estás seguro de que deseas anular esta transacción? Quedará registrada en la auditoría del hotel.'
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}${apiBase}/transactions/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Hotel-Id': String(resolvedHotelId)
        }
      });

      if (!response.ok) {
        throw new Error('Error al anular transacción');
      }

      await fetchData();
      await refreshHotels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const hotelName = dashboard?.hotel?.name || `Hotel ${resolvedHotelId}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500 font-medium animate-pulse">
          Cargando inventario de habitaciones y operación de {hotelName}...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Listón Superior */}
      <div
        className={`w-full h-2.5 rounded-full mb-4 shadow-sm ${
          resolvedHotelId === 2 ? 'bg-teal-500' : 'bg-emerald-500'
        }`}
      ></div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Cabecera Operativa */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span
              className={`p-2.5 text-white rounded-2xl border shadow-sm ${
                resolvedHotelId === 2
                  ? 'bg-teal-500 border-teal-600'
                  : 'bg-emerald-500 border-emerald-600'
              }`}
            >
              <Building2 className="w-6 h-6" />
            </span>
            <span>{hotelName}</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
            {dashboard?.hotel?.legal_name ? `${dashboard.hotel.legal_name} · ` : ''}
            {dashboard?.hotel?.tax_id ? `NIT: ${dashboard.hotel.tax_id} · ` : ''}
            Check-in: {dashboard?.hotel?.check_in_time || '15:00'} / Check-out:{' '}
            {dashboard?.hotel?.check_out_time || '13:00'} ({dashboard?.hotel?.currency || 'COP'})
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {hasPermission('reservations.view') && (
            <Link
              to="/reservas"
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all"
            >
              <CalendarRange className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Reservas y Calendario</span>
            </Link>
          )}

          {hasPermission('reception.view') && (
            <Link
              to="/recepcion"
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all"
            >
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Recepción y Folios</span>
            </Link>
          )}

          {hasPermission('cash.view') && (
            <Link
              to="/caja"
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all"
            >
              <ClipboardList className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Control de Caja</span>
            </Link>
          )}

          {hasPermission('rooms.manage') && (
            <>
              <button
                type="button"
                onClick={() => setShowRoomTypesModal(true)}
                className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
              >
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Tipos y Tarifas ({roomTypes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const defaultRt = roomTypes[0];
                  setRoomForm({
                    number: '',
                    floor: '1',
                    room_type_id: defaultRt ? String(defaultRt.id) : '',
                    price: defaultRt
                      ? Number(defaultRt.base_price).toLocaleString('de-DE')
                      : '25.000',
                    rate_3_days: defaultRt?.rate_3_days
                      ? Number(defaultRt.rate_3_days).toLocaleString('de-DE')
                      : '',
                    rate_weekly: defaultRt?.rate_weekly
                      ? Number(defaultRt.rate_weekly).toLocaleString('de-DE')
                      : '',
                    capacity: defaultRt ? String(defaultRt.capacity) : '2',
                    bed_config: defaultRt?.bed_config || '1 Cama Doble',
                    amenities: defaultRt?.amenities || 'Baño privado, TV, Wi-Fi',
                    photos: '',
                    status: 'DISPONIBLE',
                    observations: ''
                  });
                  setShowAddRoomModal(true);
                }}
                className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Habitación</span>
              </button>
            </>
          )}

          {hasPermission('cash.operate') && (
            <button
              type="button"
              onClick={() => setShowAddTxModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Movimiento</span>
            </button>
          )}

          {hasPermission('config.view') && (
            <Link
              to="/configuracion"
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium rounded-xl text-xs shadow-xs"
              title="Configuración general del establecimiento"
            >
              <Settings className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* KPIs Rápidos de la Sede */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="min-w-0 bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide">
              Habitaciones Activas
            </span>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {dashboard.rooms.total}
              </span>
              <div className="text-xs font-semibold space-x-2">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {dashboard.rooms.free} Libres
                </span>
                <span className="text-rose-600 dark:text-rose-400">
                  {dashboard.rooms.occupied} Ocup.
                </span>
              </div>
            </div>
          </div>

          <div className="min-w-0 bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
              <span>Ingresos Hoy</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </span>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 min-w-0">
              <span className="text-lg sm:text-3xl font-black break-all leading-tight text-emerald-600 dark:text-emerald-400">
                ${Number(dashboard.today.income || 0).toLocaleString('de-DE')}
              </span>
              <span className="text-[11px] text-slate-400">Recibido hoy</span>
            </div>
          </div>

          <div className="min-w-0 bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
              <span>Egresos Hoy</span>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </span>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 min-w-0">
              <span className="text-lg sm:text-3xl font-black break-all leading-tight text-rose-600 dark:text-rose-400">
                ${Number(dashboard.today.expense || 0).toLocaleString('de-DE')}
              </span>
              <span className="text-[11px] text-slate-400">Gastos hoy</span>
            </div>
          </div>

          <div className="min-w-0 bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide">
              Balance del Mes
            </span>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 min-w-0">
              <span className="text-lg sm:text-3xl font-black break-all leading-tight text-slate-900 dark:text-white">
                ${Number(dashboard.month.balance || 0).toLocaleString('de-DE')}
              </span>
              <span className="text-[11px] text-slate-400">
                Ing: ${Number(dashboard.month.income || 0).toLocaleString('de-DE')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MÓDULO 2: RACK VISUAL DE HABITACIONES Y GESTIÓN INTEGRAL
      ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Rack Visual de Habitaciones — {hotelName}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Administra disponibilidad, los 9 estados operativos, tarifas, capacidad, camas,
              características e historial de cada habitación.
            </p>
          </div>

          {/* Buscador y Filtros por Piso / Tipo / Inactivas */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar hab, huésped, cama..."
                className="w-full h-11 pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="min-w-0 h-11 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={floorFilter}
                onChange={(e) => setFloorFilter(e.target.value)}
                className="min-w-0 w-full bg-transparent font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">Todos los pisos</option>
                {floorsList.map((fl) => (
                  <option key={fl} value={fl}>
                    Piso {fl}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0 h-11 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="min-w-0 w-full bg-transparent font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">Todos los tipos</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={String(rt.id)}>
                    {rt.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="col-span-2 sm:col-span-1 h-11 inline-flex items-center gap-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Ver desactivadas</span>
            </label>
          </div>
        </div>

        {/* Píldoras de Filtro por los 9 Estados de Habitación */}
        <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`shrink-0 min-h-10 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Todas ({rooms.length})
          </button>

          {ROOM_STATUS_CATALOG.map((st) => {
            const count = rooms.filter((r) => r.status === st.value && r.active === 1).length;
            const isSelected = statusFilter === st.value;
            return (
              <button
                key={st.value}
                type="button"
                onClick={() => setStatusFilter(isSelected ? 'ALL' : st.value)}
                className={`shrink-0 whitespace-nowrap min-h-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-indigo-500 ' + st.badgeClass
                    : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${st.dotClass}`} />
                <span>{st.label}</span>
                <span className="opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Grilla Visual de Habitaciones (Rack) */}
        {filteredRooms.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
            <BedDouble className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              No se encontraron habitaciones con los filtros seleccionados
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Prueba cambiando el filtro de estado o crea una nueva habitación.
            </p>
          </div>
        ) : (
          <div className="list-scroll grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRooms.map((room) => {
              const statusMeta = getStatusMeta(room.status);
              const isInactive = room.active === 0;
              const hasDebt = (room.total_pending || 0) > 0;
              const amenitiesList = (room.amenities || '')
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean);
              const coverPhoto = room.photos && room.photos.length > 0 ? room.photos[0] : null;

              return (
                <div
                  key={room.id}
                  className={`rounded-2xl border p-4 flex flex-col justify-between transition-all shadow-2xs ${
                    isInactive
                      ? 'bg-slate-100/70 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-700 opacity-75'
                      : statusMeta.cardClass
                  }`}
                >
                  <div className="space-y-3">
                    {/* Fotografía opcional de la habitación */}
                    {coverPhoto && (
                      <div className="h-28 w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 relative">
                        <img
                          src={coverPhoto}
                          alt={`Habitación ${room.number}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-bold">
                          {room.photos.length} foto(s)
                        </span>
                      </div>
                    )}

                    {/* Cabecera de la tarjeta: Número, Piso y Estado */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black text-slate-900 dark:text-white">
                            Hab. {room.number}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            Piso {room.floor || '1'}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          {room.room_type_name || 'Estándar'}
                        </span>
                      </div>

                      {isInactive ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                          Desactivada
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${statusMeta.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                          <span>{statusMeta.label}</span>
                        </span>
                      )}
                    </div>

                    {/* Tarifas y Capacidad / Camas */}
                    <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/60 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          Tarifa diaria:
                        </span>
                        <span className="font-black text-slate-900 dark:text-white text-sm">
                          ${Number(room.price || 0).toLocaleString('de-DE')}
                        </span>
                      </div>
                      {(room.rate_3_days || room.rate_weekly) && (
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          {room.rate_3_days && (
                            <span>3 días: ${Number(room.rate_3_days).toLocaleString('de-DE')}</span>
                          )}
                          {room.rate_weekly && (
                            <span>Semanal: ${Number(room.rate_weekly).toLocaleString('de-DE')}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <b>{room.capacity || 2}</b> pers.
                        </span>
                        <span className="truncate max-w-[140px]" title={room.bed_config}>
                          🛏️ {room.bed_config || '1 Cama Doble'}
                        </span>
                      </div>
                    </div>

                    {/* Amenidades / Características */}
                    {amenitiesList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {amenitiesList.slice(0, 4).map((am, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                          >
                            {am}
                          </span>
                        ))}
                        {amenitiesList.length > 4 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-400">
                            +{amenitiesList.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Huésped Alojado Actualmente (si aplica) */}
                    {room.guest_name ? (
                      <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-950/60 border border-rose-200/70 dark:border-rose-500/70 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            👤 {room.guest_name}
                          </span>
                          {hasDebt ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-black">
                              Debe ${Number(room.total_pending).toLocaleString('de-DE')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                              Al día
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Próx. cobro: <b>{room.next_payment_date || '-'}</b> ({room.payment_type})
                        </p>
                      </div>
                    ) : (
                      room.observations && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-2">
                          “{room.observations}”
                        </p>
                      )
                    )}
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div className="pt-3 mt-3 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-1.5">
                    {isInactive ? (
                      <button
                        type="button"
                        onClick={() => handleActivateRoom(room)}
                        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reactivar Habitación</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedRoom(room)}
                          className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          {room.status === 'OCUPADA' ? 'Gestionar / Cobrar' : 'Operar / Estado'}
                        </button>

                        <button
                          type="button"
                          onClick={() => openHistoryModal(room)}
                          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all cursor-pointer"
                          title="Ver historial de ocupación, limpieza y mantenimiento"
                        >
                          <History className="w-4 h-4" />
                        </button>

                        {hasPermission('rooms.manage') && (
                          <button
                            type="button"
                            onClick={() => openEditModal(room)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all cursor-pointer"
                            title="Editar configuración de habitación"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historial de Transacciones de Caja */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <span>Historial Financiero Reciente ({hotelName})</span>
        </h2>
        <div className="table-scroll border border-slate-100 dark:border-slate-800 rounded-2xl pr-1">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium">
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-3">Categoría</th>
                <th className="py-3 px-3">Descripción</th>
                <th className="py-3 px-3 text-right">Monto</th>
                <th className="py-3 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400">{tx.date}</td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        tx.type === 'Ingreso'
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-slate-700 dark:text-slate-200 font-medium">
                    {tx.category}
                  </td>
                  <td className="py-3.5 px-3 text-slate-500 max-w-xs truncate">
                    {tx.description || '-'}
                  </td>
                  <td
                    className={`py-3.5 px-3 text-right font-semibold ${
                      tx.type === 'Ingreso' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    ${Number(tx.amount || 0).toLocaleString('de-DE')}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteTransaction(tx.id)}
                      className="w-10 h-10 inline-flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                      title="Anular transacción"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No hay transacciones registradas aún en este establecimiento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          MODAL 1: OPERAR HABITACIÓN / CAMBIO DE LOS 9 ESTADOS / RECEPCIÓN
      ===================================================================== */}
      {selectedRoom && !showEditModal && !showAssignModal && !showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                    Habitación {selectedRoom.number}
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Piso {selectedRoom.floor} · {selectedRoom.room_type_name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tarifa diaria: <b>${Number(selectedRoom.price || 0).toLocaleString('de-DE')}</b> ·
                  Capacidad: <b>{selectedRoom.capacity} personas</b> · {selectedRoom.bed_config}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoom(null)}
                className="p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector rápido de los 9 Estados Operativos de Habitación */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/70 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Estado Operativo Actual
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    getStatusMeta(selectedRoom.status).badgeClass
                  }`}
                >
                  {getStatusMeta(selectedRoom.status).label}
                </span>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={statusChangeNotes}
                  onChange={(e) => setStatusChangeNotes(e.target.value)}
                  placeholder="Nota opcional para el cambio de estado (ej. Aseo completado, revisión A/C)..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {ROOM_STATUS_CATALOG.map((st) => {
                    const isCurrent = selectedRoom.status === st.value;
                    return (
                      <button
                        key={st.value}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => handleQuickStatusChange(selectedRoom, st.value)}
                        className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                          isCurrent
                            ? 'ring-2 ring-indigo-500 ' + st.badgeClass
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${st.dotClass}`} />
                        <span className="truncate">{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Si no tiene huésped alojado, permitir Check-in */}
            {!selectedRoom.guest_name && selectedRoom.status !== 'OCUPADA' ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(true)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer"
                >
                  Asignar Huésped (Realizar Check-in)
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => openHistoryModal(selectedRoom)}
                    className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <History className="w-4 h-4" />
                    <span>Ver Historial</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedRoom)}
                    className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Editar Habitación</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Si está ocupada, mostrar datos del huésped, cobros y Check-out */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700 space-y-3">
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span>Huésped Alojado Actualmente</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px]">
                        Nombre
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {selectedRoom.guest_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px]">
                        Documento / Teléfono
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {selectedRoom.guest_document || '-'} · {selectedRoom.guest_phone || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px]">
                        Ingreso / Modalidad
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {selectedRoom.check_in_date} ({selectedRoom.payment_type})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px]">
                        Próximo Cobro
                      </span>
                      <span className="font-bold text-amber-600">
                        {selectedRoom.next_payment_date}
                      </span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span className="font-bold text-slate-600 dark:text-slate-300">
                        Total Cobro Pendiente:
                      </span>
                      <span className="text-base font-black text-rose-600 dark:text-rose-400">
                        ${Number(selectedRoom.total_pending || 0).toLocaleString('de-DE')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer"
                  >
                    Registrar Pago o Abono de Estancia
                  </button>

                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-500/15 border border-rose-200/70 dark:border-rose-500/70">
                    <select
                      value={checkoutNextStatus}
                      onChange={(e) => setCheckoutNextStatus(e.target.value as RoomStatus)}
                      className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      <option value="PENDIENTE_LIMPIEZA">Pasar a Pendiente de limpieza</option>
                      <option value="DISPONIBLE">Pasar a Disponible directamente</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleCheckout(selectedRoom.id, checkoutNextStatus)}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-all cursor-pointer"
                    >
                      Realizar Check-out
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openHistoryModal(selectedRoom)}
                      className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                      <span>Historial Habitación</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(selectedRoom)}
                      className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Editar Habitación / Huésped</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: HISTORIAL DE HABITACIÓN (OCUPACIÓN, LIMPIEZA, MANTENIMIENTO)
      ===================================================================== */}
      {historyData && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <span>
                    Historial Integral — Habitación {historyData.room.number} (Piso{' '}
                    {historyData.room.floor})
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Trazabilidad histórica de ocupación, limpieza/housekeeping y mantenimiento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryData(null)}
                className="p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas del Historial */}
            <div className="flex flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setHistoryTab('OCCUPANCY')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  historyTab === 'OCCUPANCY'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Ocupación ({historyData.occupancy_history.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('CLEANING')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  historyTab === 'CLEANING'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Limpieza / Housekeeping ({historyData.cleaning_history.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('MAINTENANCE')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  historyTab === 'MAINTENANCE'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Mantenimiento ({historyData.maintenance_history.length})
              </button>
            </div>

            {/* Contenido de la Pestaña Seleccionada */}
            {loadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-400">Cargando historial...</div>
            ) : historyTab === 'OCCUPANCY' ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {historyData.occupancy_history.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No hay estadías registradas aún en esta habitación.
                  </p>
                ) : (
                  historyData.occupancy_history.map((st) => (
                    <div
                      key={st.stay_id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {st.guest_name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              st.status === 'ACTIVA'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {st.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Check-in: {st.check_in_time} · Check-out: {st.check_out_time || 'En curso'}{' '}
                          · {st.payment_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-600 block">
                          Pagado: ${st.total_paid.toLocaleString('de-DE')}
                        </span>
                        {st.balance > 0 && (
                          <span className="text-[11px] font-bold text-rose-600">
                            Saldo: ${st.balance.toLocaleString('de-DE')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : historyTab === 'CLEANING' ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {historyData.cleaning_history.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Sin eventos de limpieza registrados aún.
                  </p>
                ) : (
                  historyData.cleaning_history.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/70 text-xs flex justify-between items-center"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {ev.previous_status ? `${ev.previous_status} → ` : ''}
                          {ev.new_status}
                        </span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {ev.notes}
                        </p>
                      </div>
                      <div className="text-right text-[10px] text-slate-400">
                        <div>{ev.user_name || 'Personal'}</div>
                        <div>{ev.created_at.replace('T', ' ').slice(0, 16)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {historyData.maintenance_history.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Sin reportes de mantenimiento en esta habitación.
                  </p>
                ) : (
                  historyData.maintenance_history.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-2xl bg-orange-50/50 dark:bg-orange-500/15 border border-orange-100 dark:border-orange-500/70 text-xs flex justify-between items-center"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {ev.new_status}
                        </span>
                        {ev.cost > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-bold text-[10px]">
                            Costo: ${ev.cost.toLocaleString('de-DE')}
                          </span>
                        )}
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {ev.notes}
                        </p>
                      </div>
                      <div className="text-right text-[10px] text-slate-400">
                        <div>{ev.user_name || 'Mantenimiento'}</div>
                        <div>{ev.created_at.replace('T', ' ').slice(0, 16)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Formulario para registrar evento de Limpieza o Mantenimiento en la Habitación */}
            <form
              onSubmit={handleAddHistoryEvent}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 space-y-3"
            >
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                Registrar Novedad de Limpieza, Inspección o Mantenimiento
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={historyEventForm.category}
                  onChange={(e) =>
                    setHistoryEventForm({
                      ...historyEventForm,
                      category: e.target.value,
                      new_status:
                        e.target.value === 'CLEANING' ? 'LIMPIA' : 'MANTENIMIENTO'
                    })
                  }
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                >
                  <option value="CLEANING">Evento de Limpieza / Inspección</option>
                  <option value="MAINTENANCE">Evento de Mantenimiento</option>
                </select>

                <select
                  value={historyEventForm.new_status}
                  onChange={(e) =>
                    setHistoryEventForm({
                      ...historyEventForm,
                      new_status: e.target.value as RoomStatus
                    })
                  }
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                >
                  {ROOM_STATUS_CATALOG.map((st) => (
                    <option key={st.value} value={st.value}>
                      Estado: {st.label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={historyEventForm.cost}
                  onChange={(e) =>
                    setHistoryEventForm({ ...historyEventForm, cost: e.target.value })
                  }
                  placeholder="Costo repuesto/arreglo ($ opc.)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={historyEventForm.notes}
                  onChange={(e) =>
                    setHistoryEventForm({ ...historyEventForm, notes: e.target.value })
                  }
                  placeholder="Describe la labor realizada o daño reportado..."
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  Guardar Bitácora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: ADMINISTRAR TIPOS DE HABITACIÓN Y TARIFAS
      ===================================================================== */}
      {showRoomTypesModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  <span>Tipos de Habitación y Tarifas ({hotelName})</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Clasifica habitaciones por categoría, capacidad, configuración de camas,
                  características y tarifas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRoomTypesModal(false)}
                className="p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {roomTypes.map((rt) => (
                <div
                  key={rt.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{rt.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                        {rt.code}
                      </span>
                      <span className="text-slate-400">
                        ({rt.rooms_count || 0} habs · {rt.capacity} pers. · {rt.bed_config})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{rt.amenities}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-black text-emerald-600 dark:text-emerald-400 block">
                        ${Number(rt.base_price).toLocaleString('de-DE')} / día
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRtForm({
                          id: rt.id,
                          name: rt.name,
                          code: rt.code || 'STD',
                          base_price: String(rt.base_price),
                          rate_3_days: rt.rate_3_days ? String(rt.rate_3_days) : '',
                          rate_weekly: rt.rate_weekly ? String(rt.rate_weekly) : '',
                          capacity: String(rt.capacity || 2),
                          bed_config: rt.bed_config || '1 Cama Doble',
                          amenities: rt.amenities || '',
                          photos: (rt.photos_list || []).join(', '),
                          description: rt.description || ''
                        })
                      }
                      className="p-1.5 bg-slate-200/70 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="Editar tipo"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRoomType(rt.id)}
                      className="p-1.5 bg-rose-50 dark:bg-rose-500/15 rounded-lg text-rose-600 cursor-pointer"
                      title="Eliminar tipo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSaveRoomType}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {rtForm.id > 0 ? 'Editar Tipo de Habitación' : 'Nuevo Tipo de Habitación'}
                </span>
                {rtForm.id > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRtForm({
                        id: 0,
                        name: '',
                        code: 'STD',
                        base_price: '',
                        rate_3_days: '',
                        rate_weekly: '',
                        capacity: '2',
                        bed_config: '1 Cama Doble',
                        amenities: 'Baño privado, TV, Wi-Fi',
                        photos: '',
                        description: ''
                      })
                    }
                    className="text-xs text-indigo-600 underline"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={rtForm.name}
                  onChange={(e) => setRtForm({ ...rtForm, name: e.target.value })}
                  placeholder="Nombre (ej. Suite Doble)"
                  className="sm:col-span-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="text"
                  required
                  value={rtForm.code}
                  onChange={(e) => setRtForm({ ...rtForm, code: e.target.value })}
                  placeholder="Código (STD, SUI)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={rtForm.capacity}
                  onChange={(e) => setRtForm({ ...rtForm, capacity: e.target.value })}
                  placeholder="Capacidad (pers.)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={rtForm.base_price}
                  onChange={(e) => setRtForm({ ...rtForm, base_price: e.target.value })}
                  placeholder="Tarifa Base Diaria ($)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="text"
                  value={rtForm.rate_3_days}
                  onChange={(e) => setRtForm({ ...rtForm, rate_3_days: e.target.value })}
                  placeholder="Tarifa 3 Días ($ opc.)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="text"
                  value={rtForm.rate_weekly}
                  onChange={(e) => setRtForm({ ...rtForm, rate_weekly: e.target.value })}
                  placeholder="Tarifa Semanal ($ opc.)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={rtForm.bed_config}
                  onChange={(e) => setRtForm({ ...rtForm, bed_config: e.target.value })}
                  placeholder="Configuración de camas (ej. 1 Cama Doble + 1 Sencilla)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="text"
                  value={rtForm.amenities}
                  onChange={(e) => setRtForm({ ...rtForm, amenities: e.target.value })}
                  placeholder="Características (A/C, TV, Wi-Fi, Baño privado)"
                  className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={rtForm.photos}
                  onChange={(e) => setRtForm({ ...rtForm, photos: e.target.value })}
                  placeholder="URLs de fotografías separadas por coma (opcional)"
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  {rtForm.id > 0 ? 'Actualizar Tipo' : 'Guardar Tipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL ASIGNAR HUÉSPED (CHECK-IN) --- */}
      {showAssignModal && selectedRoom && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-5 sm:p-8 space-y-6">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Check-in Habitación {selectedRoom.number}
              </h3>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 bg-slate-50 dark:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignGuest} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Nombre del Huésped *
                </label>
                <input
                  type="text"
                  required
                  value={guestForm.name}
                  onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                  placeholder="Nombre completo"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    Documento
                  </label>
                  <input
                    type="text"
                    value={guestForm.document}
                    onChange={(e) => setGuestForm({ ...guestForm, document: e.target.value })}
                    placeholder="Cédula / Pasaporte"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={guestForm.phone}
                    onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                    placeholder="Celular"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Fecha Ingreso *
                </label>
                <input
                  type="date"
                  required
                  value={guestForm.checkInDate}
                  onChange={(e) => setGuestForm({ ...guestForm, checkInDate: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Frecuencia de Cobro *
                </label>
                <select
                  value={guestForm.paymentType}
                  onChange={(e) => setGuestForm({ ...guestForm, paymentType: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                >
                  <option value="Pago diario">Pago diario</option>
                  <option value="Pago cada 3 días">Pago cada 3 días</option>
                  <option value="Pago semanal">Pago semanal</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Abono / Pago Inicial ($)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={guestForm.initialPayment}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, '');
                      if (!isNaN(Number(raw)) || raw === '') {
                        const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                        setGuestForm({ ...guestForm, initialPayment: formatted });
                      }
                    }}
                    placeholder={`Por defecto completo: $${Number(
                      selectedRoom.price || 0
                    ).toLocaleString('de-DE')}`}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setGuestForm({
                        ...guestForm,
                        initialPayment: Number(selectedRoom.price || 0).toLocaleString('de-DE')
                      })
                    }
                    className="px-3 py-2 text-xs font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl whitespace-nowrap"
                  >
                    Pago Completo
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer"
              >
                Completar Check-in
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REGISTRAR PAGO --- */}
      {showPaymentModal &&
        selectedRoom &&
        (() => {
          const pendingBal = Number(selectedRoom.pending_balance || 0);
          const today = getTodayString();
          const isDue =
            selectedRoom.next_payment_date && selectedRoom.next_payment_date <= today;
          const totalPending =
            selectedRoom.total_pending !== undefined &&
            selectedRoom.total_pending !== null &&
            selectedRoom.total_pending > 0
              ? selectedRoom.total_pending
              : isDue
              ? pendingBal > 0
                ? pendingBal + Number(selectedRoom.price || 0)
                : Number(selectedRoom.price || 0)
              : pendingBal;

          return (
            <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
              <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-5 sm:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Registrar Pago / Abono
                    </h3>
                    <p className="text-xs text-slate-500">
                      Habitación {selectedRoom.number} - {selectedRoom.guest_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 bg-slate-50 dark:bg-slate-800 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 rounded-xl space-y-2 text-sm">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span>Tarifa del periodo:</span>
                    <span className="font-semibold">
                      ${Number(selectedRoom.price || 0).toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span>Saldo pendiente anterior:</span>
                    <span className="font-semibold text-amber-600">
                      ${pendingBal.toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between items-center text-base font-bold text-slate-900 dark:text-white">
                    <span>TOTAL DEUDA PENDIENTE:</span>
                    <span className="text-red-600">${totalPending.toLocaleString('de-DE')}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    submitPayment(
                      totalPending > 0 ? totalPending : Number(selectedRoom.price || 0),
                      paymentDate
                    )
                  }
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>
                    ⚡ Pago Completo ($
                    {(totalPending > 0
                      ? totalPending
                      : Number(selectedRoom.price || 0)
                    ).toLocaleString('de-DE')}
                    )
                  </span>
                </button>

                <form onSubmit={handleRegisterPayment} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Monto de Abono ($) *
                    </label>
                    <input
                      type="text"
                      required
                      value={paymentAmount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(raw)) || raw === '') {
                          const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                          setPaymentAmount(formatted);
                        }
                      }}
                      placeholder="Ingresa valor parcial (ej. 10.000)"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Fecha del Pago *
                    </label>
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer"
                  >
                    Confirmar Abono
                  </button>
                </form>
              </div>
            </div>
          );
        })()}

      {/* =====================================================================
          MODAL 4: CREAR HABITACIÓN (COMPLETO MÓDULO 2)
      ===================================================================== */}
      {showAddRoomModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Crear Nueva Habitación
                </h3>
                <p className="text-xs text-slate-500">
                  Configura número, piso, tipo, tarifas, capacidad, camas, características y fotos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRoomModal(false)}
                className="p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRoom} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Número Hab. *
                  </label>
                  <input
                    type="text"
                    required
                    value={roomForm.number}
                    onChange={(e) => setRoomForm({ ...roomForm, number: e.target.value })}
                    placeholder="Ej: 101"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Piso / Nivel
                  </label>
                  <input
                    type="text"
                    value={roomForm.floor}
                    onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                    placeholder="Ej: 1"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Tipo de Habitación
                  </label>
                  <select
                    value={roomForm.room_type_id}
                    onChange={(e) => {
                      const rt = roomTypes.find((t) => String(t.id) === e.target.value);
                      setRoomForm({
                        ...roomForm,
                        room_type_id: e.target.value,
                        price: rt ? Number(rt.base_price).toLocaleString('de-DE') : roomForm.price,
                        capacity: rt ? String(rt.capacity) : roomForm.capacity,
                        bed_config: rt?.bed_config || roomForm.bed_config,
                        amenities: rt?.amenities || roomForm.amenities
                      });
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  >
                    <option value="">Por defecto</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={String(rt.id)}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Tarifa Diaria ($) *
                  </label>
                  <input
                    type="text"
                    required
                    value={roomForm.price}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, '');
                      if (!isNaN(Number(raw)) || raw === '') {
                        setRoomForm({
                          ...roomForm,
                          price: raw ? Number(raw).toLocaleString('de-DE') : ''
                        });
                      }
                    }}
                    placeholder="Ej: 25.000"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Tarifa 3 Días ($)
                  </label>
                  <input
                    type="text"
                    value={roomForm.rate_3_days}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, '');
                      if (!isNaN(Number(raw)) || raw === '') {
                        setRoomForm({
                          ...roomForm,
                          rate_3_days: raw ? Number(raw).toLocaleString('de-DE') : ''
                        });
                      }
                    }}
                    placeholder="Opcional"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Tarifa Semanal ($)
                  </label>
                  <input
                    type="text"
                    value={roomForm.rate_weekly}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, '');
                      if (!isNaN(Number(raw)) || raw === '') {
                        setRoomForm({
                          ...roomForm,
                          rate_weekly: raw ? Number(raw).toLocaleString('de-DE') : ''
                        });
                      }
                    }}
                    placeholder="Opcional"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Capacidad (Huéspedes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={roomForm.capacity}
                    onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Configuración de Camas
                  </label>
                  <input
                    type="text"
                    value={roomForm.bed_config}
                    onChange={(e) => setRoomForm({ ...roomForm, bed_config: e.target.value })}
                    placeholder="Ej: 1 Cama Doble"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Estado Inicial
                  </label>
                  <select
                    value={roomForm.status}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, status: e.target.value as RoomStatus })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  >
                    {ROOM_STATUS_CATALOG.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                  Características / Amenidades (separadas por coma)
                </label>
                <input
                  type="text"
                  value={roomForm.amenities}
                  onChange={(e) => setRoomForm({ ...roomForm, amenities: e.target.value })}
                  placeholder="Baño privado, TV, Wi-Fi, Aire Acondicionado..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                  Fotografías (URLs separadas por coma)
                </label>
                <input
                  type="text"
                  value={roomForm.photos}
                  onChange={(e) => setRoomForm({ ...roomForm, photos: e.target.value })}
                  placeholder="https://ejemplo.com/foto1.jpg"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                  Observaciones
                </label>
                <textarea
                  value={roomForm.observations}
                  onChange={(e) => setRoomForm({ ...roomForm, observations: e.target.value })}
                  placeholder="Detalles adicionales de la habitación..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer"
              >
                Guardar Habitación
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: EDITAR HABITACIÓN, ESTADOS Y HUÉSPED + DESACTIVAR/ELIMINAR
      ===================================================================== */}
      {showEditModal && selectedRoom && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Editar Habitación {selectedRoom.number}
                </h3>
                <p className="text-xs text-slate-500">
                  Actualiza atributos técnicos, tarifas, capacidad, camas, fotos, estado o datos del
                  huésped.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1.5 text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRoom} className="space-y-4">
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/70 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span>Configuración de la Habitación</span>
                  </h4>
                  {selectedRoom.status !== 'OCUPADA' && selectedRoom.status !== 'RESERVADA' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteOrDeactivateRoom(selectedRoom)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {(selectedRoom.stays_count || 0) > 0
                          ? 'Desactivar Habitación'
                          : 'Eliminar Habitación'}
                      </span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Número *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.number}
                      onChange={(e) => setEditForm({ ...editForm, number: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Piso</label>
                    <input
                      type="text"
                      value={editForm.floor}
                      onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Tipo de Habitación
                    </label>
                    <select
                      value={editForm.room_type_id}
                      onChange={(e) => setEditForm({ ...editForm, room_type_id: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">Estándar</option>
                      {roomTypes.map((rt) => (
                        <option key={rt.id} value={String(rt.id)}>
                          {rt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Tarifa Diaria ($) *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.price}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(raw)) || raw === '') {
                          setEditForm({
                            ...editForm,
                            price: raw ? Number(raw).toLocaleString('de-DE') : ''
                          });
                        }
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Tarifa 3 Días ($)
                    </label>
                    <input
                      type="text"
                      value={editForm.rate_3_days}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(raw)) || raw === '') {
                          setEditForm({
                            ...editForm,
                            rate_3_days: raw ? Number(raw).toLocaleString('de-DE') : ''
                          });
                        }
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Tarifa Semanal ($)
                    </label>
                    <input
                      type="text"
                      value={editForm.rate_weekly}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(raw)) || raw === '') {
                          setEditForm({
                            ...editForm,
                            rate_weekly: raw ? Number(raw).toLocaleString('de-DE') : ''
                          });
                        }
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Capacidad (Personas)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editForm.capacity}
                      onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Camas
                    </label>
                    <input
                      type="text"
                      value={editForm.bed_config}
                      onChange={(e) => setEditForm({ ...editForm, bed_config: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Estado Operativo
                    </label>
                    <select
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm({ ...editForm, status: e.target.value as RoomStatus })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    >
                      {ROOM_STATUS_CATALOG.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Características / Amenidades
                    </label>
                    <input
                      type="text"
                      value={editForm.amenities}
                      onChange={(e) => setEditForm({ ...editForm, amenities: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      URLs de Fotografías
                    </label>
                    <input
                      type="text"
                      value={editForm.photos}
                      onChange={(e) => setEditForm({ ...editForm, photos: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">
                    Observaciones
                  </label>
                  <textarea
                    value={editForm.observations}
                    onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Sección Huésped si está alojado */}
              {selectedRoom.guest_name && (
                <div className="space-y-3 p-4 bg-indigo-50/50 dark:bg-indigo-500/15 rounded-2xl border border-indigo-100 dark:border-indigo-500/70">
                  <h4 className="font-bold text-indigo-900 dark:text-indigo-200 text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span>Información del Huésped y Folio</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      value={editForm.guest_name}
                      onChange={(e) => setEditForm({ ...editForm, guest_name: e.target.value })}
                      placeholder="Nombre del huésped"
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                    <input
                      type="text"
                      value={editForm.guest_document}
                      onChange={(e) =>
                        setEditForm({ ...editForm, guest_document: e.target.value })
                      }
                      placeholder="Documento"
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                    <input
                      type="text"
                      value={editForm.guest_phone}
                      onChange={(e) => setEditForm({ ...editForm, guest_phone: e.target.value })}
                      placeholder="Teléfono"
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      value={editForm.payment_type}
                      onChange={(e) => setEditForm({ ...editForm, payment_type: e.target.value })}
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="Pago diario">Pago diario</option>
                      <option value="Pago cada 3 días">Pago cada 3 días</option>
                      <option value="Pago semanal">Pago semanal</option>
                    </select>
                    <input
                      type="date"
                      required
                      value={editForm.next_payment_date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, next_payment_date: e.target.value })
                      }
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                    <input
                      type="text"
                      value={editForm.pending_balance}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(raw)) || raw === '') {
                          setEditForm({
                            ...editForm,
                            pending_balance: raw ? Number(raw).toLocaleString('de-DE') : ''
                          });
                        }
                      }}
                      placeholder="Saldo pendiente ($)"
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-amber-600"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="w-1/2 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REGISTRAR TRANSACCIÓN MANUAL --- */}
      {showAddTxModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-5 sm:p-8 space-y-6">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Registrar Movimiento Manual
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 bg-slate-50 dark:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: 'Gasto', category: 'Mercado' })}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                    txForm.type === 'Gasto'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: 'Ingreso', category: 'Manual' })}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                    txForm.type === 'Ingreso'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Ingreso
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                  Categoría *
                </label>
                <select
                  value={txForm.category}
                  onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                >
                  {txForm.type === 'Gasto' ? (
                    <>
                      <option value="Mercado">Mercado</option>
                      <option value="Servicios">Servicios</option>
                      <option value="Aseo">Aseo</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Otros">Otros</option>
                    </>
                  ) : (
                    <>
                      <option value="Manual">Ingreso Manual</option>
                      <option value="Hospedaje">Ingreso Hospedaje</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                  Monto ($) *
                </label>
                <input
                  type="text"
                  required
                  value={txForm.amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, '');
                    if (!isNaN(Number(raw)) || raw === '') {
                      setTxForm({
                        ...txForm,
                        amount: raw ? Number(raw).toLocaleString('de-DE') : ''
                      });
                    }
                  }}
                  placeholder="Monto"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                  Fecha *
                </label>
                <input
                  type="date"
                  required
                  value={txForm.date}
                  onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                  Descripción
                </label>
                <textarea
                  value={txForm.description}
                  onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs cursor-pointer"
              >
                Guardar Transacción
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
