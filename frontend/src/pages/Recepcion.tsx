import React, { useEffect, useState, useMemo } from 'react';
import {
  UserCheck,
  Users,
  BedDouble,
  FileText,
  ArrowLeftRight,
  LogOut,
  Plus,
  CheckCircle2,
  AlertTriangle,
  History,
  UserPlus,
  Trash2,
  Edit,
  Wallet,
  Sparkles,
  Clock,
  Wrench,
  CalendarDays
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import {
  INPUT,
  money,
  StatCard,
  MiniFigure,
  Field,
  MoneyInput,
  SearchInput,
  Segmented,
  OptionButton,
  PayMethodPicker,
  Panel,
  EmptyText,
  EmptyState,
  Notice,
  SecondaryBtn,
  PrimaryBtn,
  Modal,
  flat,
  toneFromBg,
  SURFACE,
  HEAD_BTN,
  ModuleHeader
} from '../components/ModuleUI';

interface CompanionItem {
  id?: number;
  full_name: string;
  doc_type: string;
  document: string;
  nationality: string;
  birth_date: string;
  relationship: string;
  is_minor: number | boolean;
  parental_auth_notes: string;
}

interface StayItem {
  id: number;
  hotel_id: number;
  reservation_id: number | null;
  room_id: number;
  room_number: string;
  room_floor: string;
  room_status: string;
  room_type_name: string;
  guest_id: number;
  guest_name: string;
  doc_type: string;
  guest_document: string;
  guest_phone: string;
  guest_email: string;
  guest_nationality: string;
  origin_city: string;
  destination_city: string;
  travel_purpose: string;
  vehicle_plate: string;
  check_in_time: string;
  check_out_time: string | null;
  expected_check_out: string;
  payment_type: string;
  next_payment_date: string;
  rate_per_period: number;
  adults: number;
  children: number;
  status: string;
  observations: string;
  authorized_balance_checkout: number;
  checkout_auth_reason: string;
  documents: string[];
  companions: CompanionItem[];
  account_id: number;
  total_charges: number;
  total_paid: number;
  balance: number;
  account_status: string;
  legal_compliance: {
    tra_ready: boolean;
    sire_applicable: boolean;
    sire_ready: boolean;
  };
}

interface GuestItem {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  doc_type: string;
  document: string;
  phone: string;
  email: string;
  nationality: string;
  origin_city: string;
  destination_city: string;
  travel_purpose: string;
  occupation: string;
  company: string;
  vehicle_plate: string;
  emergency_contact: string;
  address: string;
  birth_date: string;
  observations: string;
  vip_status: number;
  documents: string[];
  total_stays: number;
  active_stays: number;
  last_visit_date: string | null;
  total_billed: number;
  pending_balance: number;
}

interface RoomBasic {
  id: number;
  number: string;
  floor: string;
  room_type_name: string;
  price: number;
  rate_3_days?: number | null;
  rate_weekly?: number | null;
  capacity: number;
  status: string;
}

interface FolioDetailData {
  stay: StayItem;
  companions: CompanionItem[];
  charges: Array<{
    id: number;
    type: string;
    description: string;
    amount: number;
    date: string;
  }>;
  payments: Array<{
    id: number;
    method: string;
    amount: number;
    date: string;
    reference: string;
  }>;
}

export default function Recepcion() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const token = localStorage.getItem('token');
  const apiBase = `/api/hotels/${activeHotelId}`;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [activeTab, setActiveTab] = useState<'RACK' | 'IN_HOUSE' | 'CHECKIN' | 'GUESTS'>('RACK');
  const [rackSearch, setRackSearch] = useState('');
  const [rackStatusFilter, setRackStatusFilter] = useState<'ALL' | 'DISPONIBLE' | 'OCUPADA' | 'LIMPIEZA'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Datos principales
  const [stays, setStays] = useState<StayItem[]>([]);
  const [stayStatusFilter, setStayStatusFilter] = useState<'ACTIVA' | 'FINALIZADA' | 'ALL'>(
    'ACTIVA'
  );
  const [staySearch, setStaySearch] = useState('');

  const [guests, setGuests] = useState<GuestItem[]>([]);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestNatFilter, setGuestNatFilter] = useState<'ALL' | 'NACIONAL' | 'EXTRANJERO'>('ALL');

  const [rooms, setRooms] = useState<RoomBasic[]>([]);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);

  // Modal para Crear Nueva Habitación Directamente desde Recepción
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoomForm, setNewRoomForm] = useState({
    number: '',
    floor: '1',
    room_type_id: '',
    price: '60000',
    capacity: '2'
  });

  // Estado del Formulario de Check-in Profesional
  const [checkinForm, setCheckinForm] = useState({
    room_id: '',
    guest_id: '',
    first_name: '',
    last_name: '',
    doc_type: 'CC',
    document: '',
    phone: '',
    email: '',
    nationality: 'Colombiana',
    origin_city: 'Bogotá D.C.',
    destination_city: activeHotel?.city || 'La Dorada, Caldas',
    travel_purpose: 'Turismo',
    occupation: '',
    company: '',
    vehicle_plate: '',
    emergency_contact: '',
    payment_type: 'Pago diario',
    expected_check_out: tomorrowStr,
    rate_per_period: '',
    initial_charge: '',
    initial_payment: '0',
    payment_method: 'EFECTIVO',
    adults: '1',
    children: '0',
    documents_text: '',
    observations: '',
    force_clean_override: false
  });
  const [checkinCompanions, setCheckinCompanions] = useState<CompanionItem[]>([]);

  // Modal de Folio de Estancia (Cargos, Pagos, Acompañantes)
  const [folioModal, setFolioModal] = useState<FolioDetailData | null>(null);
  const [newChargeForm, setNewChargeForm] = useState({
    type: 'SERVICIO_ADICIONAL',
    description: '',
    amount: ''
  });
  const [newPaymentForm, setNewPaymentForm] = useState({
    amount: '',
    method: 'EFECTIVO',
    reference: '',
    next_payment_date: ''
  });
  const [newCompForm, setNewCompForm] = useState<CompanionItem>({
    full_name: '',
    doc_type: 'CC',
    document: '',
    nationality: 'Colombiana',
    birth_date: '',
    relationship: 'Acompañante',
    is_minor: false,
    parental_auth_notes: ''
  });

  // Modal de Cambio de Habitación
  const [changeRoomStay, setChangeRoomStay] = useState<StayItem | null>(null);
  const [changeRoomForm, setChangeRoomForm] = useState({
    new_room_id: '',
    new_rate_per_period: '',
    price_adjustment: '0',
    old_room_next_status: 'PENDIENTE_LIMPIEZA',
    reason: ''
  });

  // Modal de Check-out y Liquidación
  const [checkoutStay, setCheckoutStay] = useState<StayItem | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({
    settle_payment_amount: '0',
    payment_method: 'EFECTIVO',
    payment_reference: 'Liquidación total en Check-out',
    authorize_pending_balance: false,
    checkout_auth_reason: '',
    next_room_status: 'PENDIENTE_LIMPIEZA',
    observations: ''
  });

  // Modal de Historial de Huésped y Modal de Crear/Editar Huésped
  const [guestHistoryModal, setGuestHistoryModal] = useState<any>(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<number | null>(null);
  const [guestForm, setGuestForm] = useState({
    first_name: '',
    last_name: '',
    doc_type: 'CC',
    document: '',
    phone: '',
    email: '',
    nationality: 'Colombiana',
    origin_city: '',
    destination_city: '',
    travel_purpose: 'Turismo',
    occupation: '',
    company: '',
    vehicle_plate: '',
    emergency_contact: '',
    address: '',
    birth_date: '',
    observations: '',
    documents_text: '',
    vip_status: false
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Hotel-Id': String(activeHotelId)
  };

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [staysResp, guestsResp, roomsResp, rtResp] = await Promise.all([
        fetch(`${API_URL}${apiBase}/reception/stays?status=ALL`, { headers }),
        fetch(`${API_URL}${apiBase}/reception/guests`, { headers }),
        fetch(`${API_URL}${apiBase}/rooms`, { headers }),
        fetch(`${API_URL}${apiBase}/room-types`, { headers })
      ]);

      if (!staysResp.ok || !guestsResp.ok) {
        throw new Error('Error al cargar la información del módulo de recepción.');
      }

      const [staysData, guestsData, roomsData, rtJson] = await Promise.all([
        staysResp.json(),
        guestsResp.json(),
        roomsResp.ok ? roomsResp.json() : [],
        rtResp.ok ? rtResp.json() : []
      ]);

      setStays(Array.isArray(staysData) ? staysData : []);
      setGuests(Array.isArray(guestsData) ? guestsData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setRoomTypes(Array.isArray(rtJson) ? rtJson : []);
    } catch (err: any) {
      setError(err.message || 'Error inesperado cargando recepción');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomForm.number.trim()) {
      alert('Ingresa el número o nombre de la habitación');
      return;
    }

    try {
      const resp = await fetch(`${API_URL}${apiBase}/rooms`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number: newRoomForm.number.trim(),
          floor: newRoomForm.floor.trim() || '1',
          room_type_id: newRoomForm.room_type_id ? Number(newRoomForm.room_type_id) : undefined,
          price: Number(String(newRoomForm.price).replace(/\D/g, '')) || 0,
          capacity: Number(newRoomForm.capacity) || 2,
          status: 'DISPONIBLE'
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'No se pudo crear la habitación');

      setFeedback(`¡Habitación #${newRoomForm.number.trim()} creada exitosamente y lista para usar!`);
      setShowAddRoomModal(false);
      setNewRoomForm({
        number: '',
        floor: '1',
        room_type_id: '',
        price: '60000',
        capacity: '2'
      });
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [activeHotelId]);

  const openFolioDetail = async (stayId: number) => {
    try {
      const resp = await fetch(`${API_URL}${apiBase}/reception/stays/${stayId}/folio`, {
        headers
      });
      if (!resp.ok) throw new Error('No se pudo cargar el folio de la estancia.');
      const data: FolioDetailData = await resp.json();
      setFolioModal(data);
      const pendingBal = Number(data.stay?.balance || 0);
      setNewPaymentForm({
        amount: pendingBal > 0 ? String(pendingBal) : '',
        method: 'EFECTIVO',
        reference: pendingBal > 0 ? 'Abono / Cancelación de saldo' : '',
        next_payment_date: ''
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openCheckoutModal = (stay: StayItem) => {
    setCheckoutStay(stay);
    setCheckoutForm({
      settle_payment_amount: String(stay.balance || 0),
      payment_method: 'EFECTIVO',
      payment_reference: 'Liquidación de folio en Check-out',
      authorize_pending_balance: false,
      checkout_auth_reason: '',
      next_room_status: 'PENDIENTE_LIMPIEZA',
      observations: ''
    });
  };

  const openChangeRoomModal = (stay: StayItem) => {
    setChangeRoomStay(stay);
    setChangeRoomForm({
      new_room_id: '',
      new_rate_per_period: String(stay.rate_per_period || 0),
      price_adjustment: '0',
      old_room_next_status: 'PENDIENTE_LIMPIEZA',
      reason: ''
    });
  };

  const handleQuickClean = async (roomId: number) => {
    try {
      const res = await fetch(`${API_URL}${apiBase}/rooms/${roomId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'DISPONIBLE',
          notes: 'Limpieza confirmada desde Recepción'
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo actualizar estado');
      setFeedback('Habitación marcada como limpia y lista');
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleQuickCheckin = (room: RoomBasic) => {
    const baseRate = Number(room.price || 0);
    setCheckinForm((prev) => ({
      ...prev,
      room_id: String(room.id),
      rate_per_period: String(baseRate),
      expected_check_out: tomorrowStr,
      initial_charge: String(baseRate),
      initial_payment: String(baseRate),
      force_clean_override: false
    }));
    setActiveTab('CHECKIN');
  };

  const handleDocumentInput = (docVal: string) => {
    const clean = docVal.trim();
    const matched =
      clean.length >= 5
        ? guests.find((g) => (g.document || '').trim().toLowerCase() === clean.toLowerCase())
        : undefined;

    if (matched) {
      setCheckinForm((prev) => ({
        ...prev,
        document: docVal,
        guest_id: String(matched.id),
        first_name: matched.first_name || matched.full_name || prev.first_name,
        last_name: matched.last_name || '',
        doc_type: matched.doc_type || prev.doc_type,
        phone: matched.phone || prev.phone,
        email: matched.email || prev.email,
        nationality: matched.nationality || prev.nationality,
        origin_city: matched.origin_city || prev.origin_city,
        vehicle_plate: matched.vehicle_plate || prev.vehicle_plate
      }));
    } else {
      setCheckinForm((prev) => ({
        ...prev,
        document: docVal,
        guest_id: ''
      }));
    }
  };

  const availableRoomsForCheckin = useMemo(
    () =>
      rooms.filter((r) =>
        ['DISPONIBLE', 'LIMPIA', 'RESERVADA', 'PENDIENTE_LIMPIEZA'].includes(r.status)
      ),
    [rooms]
  );

  // KPIs de Recepción
  const kpis = useMemo(() => {
    const activeStays = stays.filter((s) => s.status === 'ACTIVA');
    const companionsTotal = activeStays.reduce((sum, s) => sum + (s.companions?.length || 0), 0);
    const totalInHousePeople = activeStays.length + companionsTotal;
    const readyRooms = rooms.filter((r) => ['DISPONIBLE', 'LIMPIA'].includes(r.status)).length;
    const activePendingBalance = activeStays.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
    const foreignCount = activeStays.filter((s) => s.legal_compliance?.sire_applicable).length;

    return {
      activeStaysCount: activeStays.length,
      companionsTotal,
      totalInHousePeople,
      readyRooms,
      activePendingBalance,
      foreignCount,
      totalGuestsDir: guests.length
    };
  }, [stays, rooms, guests]);

  const rackStats = useMemo(() => {
    const total = rooms.length;
    const libres = rooms.filter((r) => ['DISPONIBLE', 'LIMPIA'].includes(r.status)).length;
    const ocupadas = rooms.filter((r) => r.status === 'OCUPADA').length;
    const sucias = rooms.filter((r) =>
      ['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA'].includes(r.status)
    ).length;
    return { total, libres, ocupadas, sucias };
  }, [rooms]);

  const filteredRackRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (
        rackStatusFilter === 'DISPONIBLE' &&
        !['DISPONIBLE', 'LIMPIA'].includes(r.status)
      )
        return false;
      if (rackStatusFilter === 'OCUPADA' && r.status !== 'OCUPADA') return false;
      if (
        rackStatusFilter === 'LIMPIEZA' &&
        !['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA'].includes(r.status)
      )
        return false;

      if (rackSearch.trim()) {
        const q = rackSearch.toLowerCase();
        return (
          r.number.toLowerCase().includes(q) ||
          r.room_type_name.toLowerCase().includes(q) ||
          r.floor.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rooms, rackStatusFilter, rackSearch]);

  const filteredStays = useMemo(() => {
    return stays.filter((s) => {
      if (stayStatusFilter !== 'ALL' && s.status !== stayStatusFilter) {
        return false;
      }
      if (!staySearch.trim()) return true;
      const q = staySearch.toLowerCase();
      return (
        s.room_number.toLowerCase().includes(q) ||
        s.guest_name.toLowerCase().includes(q) ||
        (s.guest_document || '').toLowerCase().includes(q) ||
        (s.origin_city || '').toLowerCase().includes(q) ||
        (s.vehicle_plate || '').toLowerCase().includes(q)
      );
    });
  }, [stays, stayStatusFilter, staySearch]);

  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      if (guestNatFilter === 'EXTRANJERO' && (g.nationality || 'Colombiana').toLowerCase() === 'colombiana') {
        return false;
      }
      if (guestNatFilter === 'NACIONAL' && (g.nationality || 'Colombiana').toLowerCase() !== 'colombiana') {
        return false;
      }
      if (guestSearch.trim()) {
        const q = guestSearch.toLowerCase();
        return (
          g.full_name.toLowerCase().includes(q) ||
          (g.document || '').toLowerCase().includes(q) ||
          (g.phone || '').toLowerCase().includes(q) ||
          (g.email || '').toLowerCase().includes(q) ||
          (g.company || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [guests, guestSearch, guestNatFilter]);

  // Cálculo automático de noches y total a pagar
  const getNightsCount = () => {
    try {
      const cin = new Date(todayStr);
      const cout = new Date(checkinForm.expected_check_out || tomorrowStr);
      const diffTime = cout.getTime() - cin.getTime();
      const diffNights = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffNights > 0 ? diffNights : 1;
    } catch {
      return 1;
    }
  };

  const currentNights = getNightsCount();

  const handleSelectNights = (nightsCount: number) => {
    const d = new Date();
    d.setDate(d.getDate() + nightsCount);
    const newDateStr = d.toISOString().split('T')[0];

    const targetRoom = rooms.find((r) => String(r.id) === checkinForm.room_id);
    const baseRate = targetRoom ? Number(targetRoom.price || 0) : Number(checkinForm.rate_per_period || 0);
    const totalCharge = baseRate * nightsCount;

    setCheckinForm((prev) => ({
      ...prev,
      expected_check_out: newDateStr,
      rate_per_period: String(baseRate),
      initial_charge: String(totalCharge),
      initial_payment: String(totalCharge)
    }));
  };

  const handleCheckOutDateChange = (newDateStr: string) => {
    try {
      const cin = new Date(todayStr);
      const cout = new Date(newDateStr);
      const diffTime = cout.getTime() - cin.getTime();
      const diffNights = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

      const targetRoom = rooms.find((r) => String(r.id) === checkinForm.room_id);
      const baseRate = targetRoom ? Number(targetRoom.price || 0) : Number(checkinForm.rate_per_period || 0);
      const totalCharge = baseRate * diffNights;

      setCheckinForm((prev) => ({
        ...prev,
        expected_check_out: newDateStr,
        rate_per_period: String(baseRate),
        initial_charge: String(totalCharge),
        initial_payment: String(totalCharge)
      }));
    } catch {
      setCheckinForm((prev) => ({ ...prev, expected_check_out: newDateStr }));
    }
  };

  const handleSelectRoomForCheckin = (roomIdStr: string) => {
    const r = rooms.find((item) => String(item.id) === roomIdStr);
    const baseRate = r ? Number(r.price || 0) : 0;
    const nights = getNightsCount();
    const total = baseRate * nights;

    setCheckinForm((prev) => ({
      ...prev,
      room_id: roomIdStr,
      rate_per_period: String(baseRate),
      initial_charge: String(total),
      initial_payment: String(total)
    }));
  };

  const handleSelectExistingGuestForCheckin = (guestIdStr: string) => {
    const g = guests.find((item) => String(item.id) === guestIdStr);
    if (!g) {
      setCheckinForm((prev) => ({ ...prev, guest_id: '' }));
      return;
    }
    setCheckinForm((prev) => ({
      ...prev,
      guest_id: String(g.id),
      first_name: g.first_name || g.full_name,
      last_name: g.last_name || '',
      doc_type: g.doc_type || 'CC',
      document: g.document || '',
      phone: g.phone || '',
      email: g.email || '',
      nationality: g.nationality || 'Colombiana',
      origin_city: g.origin_city || prev.origin_city,
      destination_city: g.destination_city || prev.destination_city,
      travel_purpose: g.travel_purpose || 'Turismo',
      occupation: g.occupation || '',
      company: g.company || '',
      vehicle_plate: g.vehicle_plate || '',
      emergency_contact: g.emergency_contact || ''
    }));
  };

  const handlePerformCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');

    if (!checkinForm.room_id) {
      alert('Seleccione una habitación para el Check-in.');
      return;
    }

    const docsArray = checkinForm.documents_text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const resp = await fetch(`${API_URL}${apiBase}/reception/checkin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          room_id: Number(checkinForm.room_id),
          guest_id: checkinForm.guest_id ? Number(checkinForm.guest_id) : null,
          first_name: checkinForm.first_name.trim(),
          last_name: checkinForm.last_name.trim(),
          doc_type: checkinForm.doc_type,
          document: checkinForm.document.trim(),
          phone: checkinForm.phone.trim(),
          email: checkinForm.email.trim(),
          nationality: checkinForm.nationality.trim(),
          origin_city: checkinForm.origin_city.trim(),
          destination_city: checkinForm.destination_city.trim(),
          travel_purpose: checkinForm.travel_purpose,
          occupation: checkinForm.occupation.trim(),
          company: checkinForm.company.trim(),
          vehicle_plate: checkinForm.vehicle_plate.trim(),
          emergency_contact: checkinForm.emergency_contact.trim(),
          payment_type: checkinForm.payment_type,
          expected_check_out: checkinForm.expected_check_out,
          next_payment_date: checkinForm.expected_check_out,
          rate_per_period: Number(String(checkinForm.rate_per_period).replace(/\D/g, '')) || 0,
          initial_charge: Number(String(checkinForm.initial_charge).replace(/\D/g, '')) || 0,
          initial_payment: Number(String(checkinForm.initial_payment).replace(/\D/g, '')) || 0,
          payment_method: checkinForm.payment_method,
          adults: Number(checkinForm.adults) || 1,
          children: Number(checkinForm.children) || 0,
          companions: checkinCompanions,
          documents: docsArray,
          observations: checkinForm.observations.trim(),
          force_clean_override: checkinForm.force_clean_override
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Error al realizar el Check-in');
      }

      setFeedback(
        `Check-in exitoso en Hab. #${data.room_number}. Folio #${data.account_id} abierto (Saldo: $${Number(
          data.balance
        ).toLocaleString('es-CO')}).`
      );
      setCheckinCompanions([]);
      setCheckinForm((prev) => ({
        ...prev,
        room_id: '',
        guest_id: '',
        first_name: '',
        last_name: '',
        document: '',
        phone: '',
        email: '',
        vehicle_plate: '',
        documents_text: '',
        observations: '',
        expected_check_out: tomorrowStr,
        rate_per_period: '',
        initial_charge: '',
        initial_payment: '0',
        force_clean_override: false
      }));
      await fetchAll();
      setActiveTab('RACK');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const submitFolioCharge = async (type: string, description: string, amount: number) => {
    if (!folioModal) return;
    if (!description.trim() || amount <= 0) {
      alert('Ingrese una descripción y un monto mayor a 0.');
      return;
    }

    try {
      const resp = await fetch(
        `${API_URL}${apiBase}/reception/stays/${folioModal.stay.id}/charges`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type,
            description: description.trim(),
            amount
          })
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al agregar cargo al folio');

      setNewChargeForm({ type: 'SERVICIO_ADICIONAL', description: '', amount: '' });
      await openFolioDetail(folioModal.stay.id);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddFolioCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = Number(newChargeForm.amount.replace(/\D/g, '')) || 0;
    await submitFolioCharge(newChargeForm.type, newChargeForm.description, cleanAmount);
  };

  const handleAddFolioPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folioModal) return;
    const cleanAmount = Number(newPaymentForm.amount.replace(/\D/g, '')) || 0;
    if (cleanAmount <= 0) {
      alert('Ingrese un monto de pago mayor a 0.');
      return;
    }

    try {
      const resp = await fetch(
        `${API_URL}${apiBase}/reception/stays/${folioModal.stay.id}/payments`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            amount: cleanAmount,
            method: newPaymentForm.method,
            reference: newPaymentForm.reference.trim(),
            next_payment_date: newPaymentForm.next_payment_date || undefined
          })
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al registrar pago en el folio');

      setNewPaymentForm({ amount: '', method: 'EFECTIVO', reference: '', next_payment_date: '' });
      await openFolioDetail(folioModal.stay.id);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddCompanionToStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folioModal) return;
    try {
      const resp = await fetch(
        `${API_URL}${apiBase}/reception/stays/${folioModal.stay.id}/companions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(newCompForm)
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al agregar acompañante');

      setNewCompForm({
        full_name: '',
        doc_type: 'CC',
        document: '',
        nationality: 'Colombiana',
        birth_date: '',
        relationship: 'Acompañante',
        is_minor: false,
        parental_auth_notes: ''
      });
      await openFolioDetail(folioModal.stay.id);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveCompanionFromStay = async (companionId: number) => {
    if (!folioModal) return;
    try {
      await fetch(
        `${API_URL}${apiBase}/reception/stays/${folioModal.stay.id}/companions/${companionId}`,
        {
          method: 'DELETE',
          headers
        }
      );
      await openFolioDetail(folioModal.stay.id);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExecuteChangeRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeRoomStay) return;

    try {
      const resp = await fetch(
        `${API_URL}${apiBase}/reception/stays/${changeRoomStay.id}/change-room`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            new_room_id: Number(changeRoomForm.new_room_id),
            new_rate_per_period: changeRoomForm.new_rate_per_period
              ? Number(String(changeRoomForm.new_rate_per_period).replace(/\D/g, ''))
              : undefined,
            price_adjustment: Number(String(changeRoomForm.price_adjustment).replace(/\D/g, '')) || 0,
            old_room_next_status: changeRoomForm.old_room_next_status,
            reason: changeRoomForm.reason.trim()
          })
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al realizar el cambio de habitación');

      setFeedback(data.message);
      setChangeRoomStay(null);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExecuteCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutStay) return;

    try {
      const resp = await fetch(
        `${API_URL}${apiBase}/reception/stays/${checkoutStay.id}/checkout`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            settle_payment_amount:
              Number(String(checkoutForm.settle_payment_amount).replace(/\D/g, '')) || 0,
            payment_method: checkoutForm.payment_method,
            payment_reference: checkoutForm.payment_reference.trim(),
            authorize_pending_balance: checkoutForm.authorize_pending_balance,
            checkout_auth_reason: checkoutForm.checkout_auth_reason.trim(),
            next_room_status: checkoutForm.next_room_status,
            observations: checkoutForm.observations.trim()
          })
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al ejecutar Check-out');

      setFeedback(data.message);
      setCheckoutStay(null);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveGuestProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const docsArray = guestForm.documents_text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const url = editingGuestId
        ? `${API_URL}${apiBase}/reception/guests/${editingGuestId}`
        : `${API_URL}${apiBase}/reception/guests`;
      const method = editingGuestId ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          ...guestForm,
          documents: docsArray
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al guardar huésped');

      setFeedback(data.message);
      setShowGuestModal(false);
      setEditingGuestId(null);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openGuestHistory = async (guestId: number) => {
    try {
      const resp = await fetch(`${API_URL}${apiBase}/reception/guests/${guestId}`, { headers });
      if (!resp.ok) throw new Error('Error al consultar historial del huésped');
      const data = await resp.json();
      setGuestHistoryModal(data);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const canCheckin = hasPermission('reception.checkin');
  const canCheckout = hasPermission('reception.checkout');

  const openNewGuestModal = () => {
    setEditingGuestId(null);
    setGuestForm({
      first_name: '',
      last_name: '',
      doc_type: 'CC',
      document: '',
      phone: '',
      email: '',
      nationality: 'Colombiana',
      origin_city: '',
      destination_city: '',
      travel_purpose: 'Turismo',
      occupation: '',
      company: '',
      vehicle_plate: '',
      emergency_contact: '',
      address: '',
      birth_date: '',
      observations: '',
      documents_text: '',
      vip_status: false
    });
    setShowGuestModal(true);
  };

  const openEditGuestModal = (g: GuestItem) => {
    setEditingGuestId(g.id);
    setGuestForm({
      first_name: g.first_name || g.full_name,
      last_name: g.last_name || '',
      doc_type: g.doc_type || 'CC',
      document: g.document || '',
      phone: g.phone || '',
      email: g.email || '',
      nationality: g.nationality || 'Colombiana',
      origin_city: g.origin_city || '',
      destination_city: g.destination_city || '',
      travel_purpose: g.travel_purpose || 'Turismo',
      occupation: g.occupation || '',
      company: g.company || '',
      vehicle_plate: g.vehicle_plate || '',
      emergency_contact: g.emergency_contact || '',
      address: g.address || '',
      birth_date: g.birth_date || '',
      observations: g.observations || '',
      documents_text: (g.documents || []).join(', '),
      vip_status: g.vip_status === 1
    });
    setShowGuestModal(true);
  };

  const startCheckinForGuest = (g: GuestItem) => {
    handleSelectExistingGuestForCheckin(String(g.id));
    setActiveTab('CHECKIN');
  };

  const roomView = (r: RoomBasic, currentStay?: StayItem) => {
    if (r.status === 'OCUPADA' || currentStay)
      return { kind: 'OCUPADA' as const, tone: 'rose' as const, label: 'Ocupada', band: 'bg-rose-700', icon: <Users className="w-4 h-4" /> };
    if (['DISPONIBLE', 'LIMPIA'].includes(r.status))
      return { kind: 'LIBRE' as const, tone: 'emerald' as const, label: 'Libre', band: 'bg-emerald-700', icon: <CheckCircle2 className="w-4 h-4" /> };
    if (['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA'].includes(r.status))
      return { kind: 'ASEO' as const, tone: 'amber' as const, label: 'Por limpiar', band: 'bg-amber-700', icon: <Sparkles className="w-4 h-4" /> };
    if (['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(r.status))
      return { kind: 'MANT' as const, tone: 'slate' as const, label: 'Mantenimiento', band: 'bg-slate-700', icon: <Wrench className="w-4 h-4" /> };
    return { kind: 'OTRO' as const, tone: 'slate' as const, label: r.status.replace(/_/g, ' ').toLowerCase(), band: 'bg-slate-700', icon: <BedDouble className="w-4 h-4" /> };
  };

  const shortDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '';

  const TABS: Array<{
    id: 'RACK' | 'IN_HOUSE' | 'CHECKIN' | 'GUESTS';
    label: string;
    short: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: 'RACK', label: 'Habitaciones', short: 'Habitac.', icon: <BedDouble className="w-5 h-5 shrink-0" />, badge: rooms.length },
    { id: 'IN_HOUSE', label: 'Alojados', short: 'Alojados', icon: <FileText className="w-5 h-5 shrink-0" />, badge: kpis.activeStaysCount },
    ...(canCheckin
      ? [{ id: 'CHECKIN' as const, label: 'Registrar llegada', short: 'Llegada', icon: <UserCheck className="w-5 h-5 shrink-0" /> }]
      : []),
    { id: 'GUESTS', label: 'Huéspedes', short: 'Huéspedes', icon: <Users className="w-5 h-5 shrink-0" />, badge: kpis.totalGuestsDir }
  ];

  const selectedCheckinRoom = rooms.find((rm) => String(rm.id) === String(checkinForm.room_id));
  const checkinTotal = Number(checkinForm.initial_charge || 0);
  const checkinPaid = Number(checkinForm.initial_payment || 0);
  const checkinOwes = checkinTotal - checkinPaid;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ================= ENCABEZADO + PESTAÑAS ================= */}
      <ModuleHeader
        icon={<UserCheck className="w-5 h-5" />}
        iconColor="bg-indigo-700"
        title={
          <>
            Recepción
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {' '}
              · {activeHotel?.name || 'Hotel'}
            </span>
          </>
        }
        subtitle={
          loading
            ? 'Cargando…'
            : `${kpis.activeStaysCount} habitación(es) ocupada(s) · ${kpis.readyRooms} libre(s)`
        }
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ================= AVISOS ================= */}
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

      {/* ================= TARJETAS DE RESUMEN ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          variant="flat"
          color="bg-slate-800 dark:bg-slate-700"
          label="Habitaciones"
          icon={<BedDouble className="w-5 h-5 shrink-0" />}
          value={rooms.length}
          hint="En total"
          active={activeTab === 'RACK' && rackStatusFilter === 'ALL'}
          onClick={() => {
            setActiveTab('RACK');
            setRackStatusFilter('ALL');
          }}
        />
        <StatCard
          variant="flat"
          color="bg-emerald-600"
          label="Libres"
          icon={<CheckCircle2 className="w-5 h-5 shrink-0" />}
          value={kpis.readyRooms}
          hint="Listas para ocupar"
          active={activeTab === 'RACK' && rackStatusFilter === 'DISPONIBLE'}
          onClick={() => {
            setActiveTab('RACK');
            setRackStatusFilter('DISPONIBLE');
          }}
        />
        <StatCard
          variant="flat"
          color="bg-rose-600"
          label="Ocupadas"
          icon={<Users className="w-5 h-5 shrink-0" />}
          value={kpis.activeStaysCount}
          hint={`${kpis.totalInHousePeople} persona(s)`}
          active={activeTab === 'RACK' && rackStatusFilter === 'OCUPADA'}
          onClick={() => {
            setActiveTab('RACK');
            setRackStatusFilter('OCUPADA');
          }}
        />
        <StatCard
          variant="flat"
          color="bg-amber-600"
          label="Por limpiar"
          icon={<Sparkles className="w-5 h-5 shrink-0" />}
          value={rackStats.sucias}
          hint="Necesitan aseo"
          active={activeTab === 'RACK' && rackStatusFilter === 'LIMPIEZA'}
          onClick={() => {
            setActiveTab('RACK');
            setRackStatusFilter('LIMPIEZA');
          }}
        />
        <StatCard
          variant="flat"
          color="bg-indigo-600"
          label="Por cobrar"
          icon={<Wallet className="w-5 h-5 shrink-0" />}
          value={`$${money(kpis.activePendingBalance)}`}
          hint="Saldo de alojados"
          className="col-span-2 sm:col-span-2 lg:col-span-1"
          onClick={() => {
            setActiveTab('IN_HOUSE');
            setStayStatusFilter('ACTIVA');
          }}
        />
      </div>

      {/* =====================================================================
          PESTAÑA 1: HABITACIONES
      ===================================================================== */}
      {activeTab === 'RACK' && (
        <Panel
          accent="indigo"
          title="Habitaciones"
          subtitle="Toca una habitación para ocuparla, ver su cuenta o marcarla como limpia."
          icon={<BedDouble className="w-5 h-5 shrink-0" />}
          actions={
            <button
              type="button"
              onClick={() => setShowAddRoomModal(true)}
              className="h-11 px-4 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Nueva habitación
            </button>
          }
        >
          <div className="flex flex-col lg:flex-row gap-3">
            <Segmented
              className="flex-1"
              value={rackStatusFilter}
              onChange={setRackStatusFilter}
              options={[
                { id: 'ALL', label: `Todas (${rackStats.total})`, color: 'bg-slate-800' },
                { id: 'DISPONIBLE', label: `Libres (${rackStats.libres})`, color: 'bg-emerald-700' },
                { id: 'OCUPADA', label: `Ocupadas (${rackStats.ocupadas})`, color: 'bg-rose-700' },
                { id: 'LIMPIEZA', label: `Por limpiar (${rackStats.sucias})`, color: 'bg-amber-700' }
              ]}
            />
            <SearchInput
              className="lg:w-72"
              value={rackSearch}
              onChange={setRackSearch}
              placeholder="Buscar número, tipo o piso…"
            />
          </div>

          {rooms.length === 0 ? (
            <EmptyState
              icon={<BedDouble className="w-12 h-12" />}
              title="Aún no hay habitaciones en este hotel"
              text="Crea tu primera habitación indicando su número, piso y precio por noche."
              action={
                <button
                  type="button"
                  onClick={() => setShowAddRoomModal(true)}
                  className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  Crear primera habitación
                </button>
              }
            />
          ) : filteredRackRooms.length === 0 ? (
            <EmptyText>No hay habitaciones con este filtro o búsqueda.</EmptyText>
          ) : (
            <div className="list-scroll grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredRackRooms.map((r) => {
                const currentStay = stays.find((s) => s.room_id === r.id && s.status === 'ACTIVA');
                const v = roomView(r, currentStay);
                const stayBalance = Number(currentStay?.balance || 0);

                return (
                  <article
                    key={r.id}
                    className={`rounded-2xl overflow-hidden flex flex-col ${flat(v.tone, true)}`}
                  >
                    <div className="px-4 pt-3.5 flex items-center justify-between gap-2">
                      <span className="text-2xl font-black text-slate-900 dark:text-white truncate">{r.number}</span>
                      <span className={`${v.band} text-white inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 capitalize`}>
                        {v.icon}
                        {v.label}
                      </span>
                    </div>

                    <div className="px-4 pb-4 pt-1 flex-1 flex flex-col gap-3">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-snug">
                        Piso {r.floor || '1'} · {r.room_type_name || 'Estándar'}
                      </p>

                      {v.kind === 'OCUPADA' && currentStay ? (
                        <div className="space-y-1.5">
                          <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 break-words">
                            {currentStay.guest_name}
                          </p>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            {currentStay.expected_check_out
                              ? `Sale el ${shortDate(currentStay.expected_check_out)}`
                              : 'Sin fecha de salida'}
                          </p>
                          {stayBalance <= 0 ? (
                            <span className="inline-block text-xs font-bold px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                              ✓ Al día
                            </span>
                          ) : (
                            <span className="inline-block text-xs font-bold px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-200">
                              Debe ${money(stayBalance)}
                            </span>
                          )}
                        </div>
                      ) : v.kind === 'LIBRE' ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Precio por noche</p>
                          <p className="text-lg font-black text-slate-900 dark:text-white">${money(r.price)}</p>
                          <p className="text-xs font-medium text-slate-500">Hasta {r.capacity || 2} personas</p>
                        </div>
                      ) : v.kind === 'ASEO' ? (
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                          Cuando termine el aseo, toca “Ya está limpia”.
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          No disponible por el momento.
                        </p>
                      )}

                      <div className="mt-auto pt-1">
                        {v.kind === 'OCUPADA' && currentStay ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => openFolioDetail(currentStay.id)}
                              className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              Cuenta
                            </button>
                            <button
                              type="button"
                              onClick={() => openCheckoutModal(currentStay)}
                              className="h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <LogOut className="w-4 h-4 shrink-0" />
                              Salida
                            </button>
                            <button
                              type="button"
                              onClick={() => openChangeRoomModal(currentStay)}
                              className="col-span-2 h-10 rounded-xl border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <ArrowLeftRight className="w-4 h-4 shrink-0" />
                              Cambiar de habitación
                            </button>
                          </div>
                        ) : v.kind === 'LIBRE' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickCheckin(r)}
                            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <UserCheck className="w-5 h-5 shrink-0" />
                            Ocupar
                          </button>
                        ) : v.kind === 'ASEO' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickClean(r.id)}
                            className="w-full h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className="w-5 h-5 shrink-0" />
                            Ya está limpia
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleQuickClean(r.id)}
                            className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            Habilitar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* =====================================================================
          PESTAÑA 2: ALOJADOS
      ===================================================================== */}
      {activeTab === 'IN_HOUSE' && (
        <Panel
          accent="sky"
          title="Huéspedes alojados"
          subtitle="Consulta la cuenta, cambia de habitación o registra la salida."
          icon={<FileText className="w-5 h-5 shrink-0" />}
        >
          <div className="flex flex-col lg:flex-row gap-3">
            <Segmented
              className="lg:w-[420px]"
              value={stayStatusFilter}
              onChange={setStayStatusFilter}
              options={[
                { id: 'ACTIVA', label: `En el hotel (${kpis.activeStaysCount})`, color: 'bg-emerald-700' },
                { id: 'FINALIZADA', label: 'Ya salieron', color: 'bg-slate-700' },
                { id: 'ALL', label: 'Todas' }
              ]}
            />
            <SearchInput
              className="flex-1"
              value={staySearch}
              onChange={setStaySearch}
              placeholder="Buscar habitación, nombre, cédula o placa…"
            />
          </div>

          {loading ? (
            <EmptyText>Cargando…</EmptyText>
          ) : filteredStays.length === 0 ? (
            <EmptyState
              icon={<Users className="w-12 h-12" />}
              title="No hay huéspedes con este filtro"
              action={
                canCheckin && stayStatusFilter === 'ACTIVA' ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('CHECKIN')}
                    className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black inline-flex items-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="w-5 h-5" />
                    Registrar llegada
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Móvil y tablet: tarjetas */}
              <div className="list-scroll lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredStays.map((s) => {
                  const hasDebt = Number(s.balance || 0) > 0;
                  const isActive = s.status === 'ACTIVA';
                  return (
                    <article
                      key={s.id}
                      className={`rounded-2xl overflow-hidden flex flex-col ${flat(isActive ? 'sky' : 'slate', true)}`}
                    >
                      <div className="px-4 pt-3.5 flex items-center justify-between gap-2">
                        <span className="text-lg font-black text-slate-900 dark:text-white truncate">Hab. {s.room_number}</span>
                        <span
                          className={`text-xs font-bold text-white px-2.5 py-1 rounded-full shrink-0 ${
                            isActive ? 'bg-sky-700' : 'bg-slate-700'
                          }`}
                        >
                          {isActive ? 'En el hotel' : 'Ya salió'}
                        </span>
                      </div>
                      <div className="px-4 pb-4 pt-1 space-y-3 flex-1 flex flex-col">
                        <div className="min-w-0">
                          <p className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 break-words">
                            {s.guest_name}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
                            {s.doc_type} {s.guest_document || 'sin documento'} · {s.guest_phone || 'sin teléfono'}
                          </p>
                        </div>
                        <div
                          className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                            hasDebt
                              ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-200'
                              : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                          }`}
                        >
                          <span className="text-sm font-semibold">{hasDebt ? 'Debe' : 'Al día'}</span>
                          <span className="text-base font-black">${money(s.balance)}</span>
                        </div>
                        <div className={`mt-auto grid gap-2 ${isActive && canCheckout ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          <button
                            type="button"
                            onClick={() => openFolioDetail(s.id)}
                            className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-4 h-4 shrink-0" />
                            Cuenta
                          </button>
                          {isActive && canCheckout && (
                            <button
                              type="button"
                              onClick={() => openCheckoutModal(s)}
                              className="h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <LogOut className="w-4 h-4 shrink-0" />
                              Salida
                            </button>
                          )}
                          {isActive && canCheckin && (
                            <button
                              type="button"
                              onClick={() => openChangeRoomModal(s)}
                              className={`h-10 rounded-xl border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                                canCheckout ? 'col-span-2' : ''
                              }`}
                            >
                              <ArrowLeftRight className="w-4 h-4 shrink-0" />
                              Cambiar de habitación
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Escritorio: tabla */}
              <div className="hidden lg:block table-scroll -mx-5">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="py-3 px-5">Habitación</th>
                      <th className="py-3 px-4">Huésped</th>
                      <th className="py-3 px-4">Llegada / Salida</th>
                      <th className="py-3 px-4 text-right">Cuenta</th>
                      <th className="py-3 px-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStays.map((s) => (
                      <tr key={s.id}>
                        <td className="py-3 px-5">
                          <div className="text-base font-black text-slate-900 dark:text-white">
                            Hab. {s.room_number}
                          </div>
                          <div className="text-xs text-slate-500">
                            Piso {s.room_floor} · {s.room_type_name}
                          </div>
                          <span
                            className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold text-white ${
                              s.status === 'ACTIVA' ? 'bg-emerald-700' : 'bg-slate-600'
                            }`}
                          >
                            {s.status === 'ACTIVA' ? 'En el hotel' : 'Ya salió'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{s.guest_name}</div>
                          <div className="text-xs text-slate-500">
                            {s.doc_type}: {s.guest_document || 'Sin doc.'} · {s.guest_phone || 'Sin teléfono'}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 text-xs text-slate-600 dark:text-slate-300">
                            <span>👥 {s.companions?.length || 0} acomp.</span>
                            {s.vehicle_plate && <span>· 🚗 {s.vehicle_plate}</span>}
                            {s.origin_city && <span>· 📍 {s.origin_city}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            Llegó: {s.check_in_time}
                          </div>
                          {s.check_out_time ? (
                            <div className="text-slate-500">Salió: {s.check_out_time}</div>
                          ) : (
                            <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                              Sale: {s.next_payment_date || s.expected_check_out}
                            </div>
                          )}
                          <div className="text-slate-500">
                            {s.payment_type} · ${money(s.rate_per_period)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-xs">
                          <div className="text-slate-500">Cargos ${money(s.total_charges)}</div>
                          <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            Pagado ${money(s.total_paid)}
                          </div>
                          <div
                            className={`text-base font-black ${
                              s.balance > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            Saldo ${money(s.balance)}
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openFolioDetail(s.id)}
                              className="h-10 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <FileText className="w-4 h-4" />
                              Cuenta
                            </button>
                            {s.status === 'ACTIVA' && canCheckin && (
                              <button
                                type="button"
                                onClick={() => openChangeRoomModal(s)}
                                className="h-10 px-3 rounded-lg border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                title="Cambiar de habitación"
                              >
                                <ArrowLeftRight className="w-4 h-4" />
                                Cambiar
                              </button>
                            )}
                            {s.status === 'ACTIVA' && canCheckout && (
                              <button
                                type="button"
                                onClick={() => openCheckoutModal(s)}
                                className="h-10 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <LogOut className="w-4 h-4" />
                                Salida
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}

      {/* =====================================================================
          PESTAÑA 3: REGISTRAR LLEGADA (CHECK-IN)
      ===================================================================== */}
      {activeTab === 'CHECKIN' && (
        <form onSubmit={handlePerformCheckin} className="space-y-4 sm:space-y-5">
          <Panel
            accent="emerald"
            title="Registrar llegada"
            subtitle="Completa los 3 pasos y presiona “Confirmar llegada”."
            icon={<UserCheck className="w-5 h-5 shrink-0" />}
          >
            <Field label="¿El huésped ya vino antes? Búscalo para llenar sus datos solo">
              <select
                value={checkinForm.guest_id}
                onChange={(e) => handleSelectExistingGuestForCheckin(e.target.value)}
                className={INPUT}
              >
                <option value="">— Es un huésped nuevo —</option>
                {guests.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.full_name} ({g.document || 'Sin doc.'})
                  </option>
                ))}
              </select>
            </Field>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
            {/* ---------- Paso 1: Huésped ---------- */}
            <StepCard n={1} color="bg-sky-700" title="¿Quién se hospeda?" hint="Si escribes una cédula conocida, se llena sola.">
              {checkinForm.guest_id && (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Huésped conocido
                  </span>
                  <button
                    type="button"
                    onClick={() => setCheckinForm((prev) => ({ ...prev, guest_id: '' }))}
                    className="h-9 px-3 rounded-lg bg-white/95 dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500 text-sm font-bold text-emerald-800 dark:text-emerald-200 cursor-pointer shrink-0"
                  >
                    Es otro
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Field label="Tipo *">
                  <select
                    value={checkinForm.doc_type}
                    onChange={(e) => setCheckinForm((prev) => ({ ...prev, doc_type: e.target.value }))}
                    className={`${INPUT} px-2`}
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Número de documento *" className="col-span-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={checkinForm.document}
                    onChange={(e) => handleDocumentInput(e.target.value)}
                    placeholder="Ej: 1094950123"
                    className={INPUT}
                  />
                </Field>
              </div>

              <Field label="Nombre completo *">
                <input
                  type="text"
                  required
                  value={checkinForm.first_name}
                  onChange={(e) => setCheckinForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  placeholder="Ej: Juan Carlos Gómez"
                  className={INPUT}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                <Field label="Teléfono / WhatsApp">
                  <input
                    type="tel"
                    value={checkinForm.phone}
                    onChange={(e) => setCheckinForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Ej: 3101234567"
                    className={INPUT}
                  />
                </Field>
                <Field label="Placa del vehículo">
                  <input
                    type="text"
                    value={checkinForm.vehicle_plate}
                    onChange={(e) =>
                      setCheckinForm((prev) => ({ ...prev, vehicle_plate: e.target.value.toUpperCase() }))
                    }
                    placeholder="Ej: ABC-123"
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <Field label="¿De qué ciudad viene?">
                  <input
                    type="text"
                    value={checkinForm.origin_city}
                    onChange={(e) => setCheckinForm((prev) => ({ ...prev, origin_city: e.target.value }))}
                    placeholder="Ej: Medellín"
                    className={INPUT}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {['La Dorada', 'Bogotá D.C.', 'Medellín', 'Manizales', 'Ibagué', 'Honda'].map((city) => (
                    <Chip
                      key={city}
                      selected={checkinForm.origin_city === city}
                      onClick={() => setCheckinForm((prev) => ({ ...prev, origin_city: city }))}
                      color="bg-sky-700 border-sky-700"
                    >
                      {city}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-300 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 pt-2">
                  Acompañantes ({checkinCompanions.length})
                </p>
                {checkinCompanions.map((comp, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Nombre del acompañante ${idx + 1}`}
                      value={comp.full_name}
                      onChange={(e) => {
                        const next = [...checkinCompanions];
                        next[idx].full_name = e.target.value;
                        setCheckinCompanions(next);
                      }}
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={() => setCheckinCompanions((prev) => prev.filter((_, i) => i !== idx))}
                      className="w-12 h-12 rounded-xl border border-rose-300 dark:border-rose-500 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                      aria-label="Quitar acompañante"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setCheckinCompanions((prev) => [
                      ...prev,
                      {
                        full_name: '',
                        doc_type: 'CC',
                        document: '',
                        nationality: 'Colombiana',
                        birth_date: '',
                        relationship: 'Acompañante',
                        is_minor: false,
                        parental_auth_notes: ''
                      }
                    ])
                  }
                  className="w-full h-11 rounded-xl border-2 border-dashed border-sky-300 dark:border-sky-500 text-sky-800 dark:text-sky-200 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/40"
                >
                  <UserPlus className="w-4 h-4" />
                  Agregar acompañante
                </button>
              </div>
            </StepCard>

            {/* ---------- Paso 2: Habitación y noches ---------- */}
            <StepCard n={2} color="bg-emerald-700" title="Habitación y noches" hint="El valor a cobrar se calcula solo.">
              <Field label="Habitación *">
                <select
                  required
                  value={checkinForm.room_id}
                  onChange={(e) => handleSelectRoomForCheckin(e.target.value)}
                  className={`${INPUT} h-14 text-base font-bold`}
                >
                  <option value="">— Elige una habitación —</option>
                  {availableRoomsForCheckin.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      Hab. {r.number} ({r.room_type_name || 'Estándar'}) — ${money(r.price)}/noche
                      {['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA'].includes(r.status) ? ' · 🧹 por limpiar' : ''}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedCheckinRoom &&
                ['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA', 'INSPECCION_PENDIENTE'].includes(selectedCheckinRoom.status) && (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500 space-y-3">
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-100 flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      La habitación {selectedCheckinRoom.number} aparece “
                      {selectedCheckinRoom.status.replace(/_/g, ' ').toLowerCase()}”.
                    </p>
                    <label className="flex items-center gap-3 cursor-pointer text-sm font-semibold text-amber-950 dark:text-amber-100 select-none">
                      <input
                        type="checkbox"
                        checked={checkinForm.force_clean_override}
                        onChange={(e) =>
                          setCheckinForm((prev) => ({ ...prev, force_clean_override: e.target.checked }))
                        }
                        className="w-5 h-5 accent-amber-600 shrink-0"
                      />
                      Ya fue revisada y aseada, dejar ingresar
                    </label>
                  </div>
                )}

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Cuántas noches?</p>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 7].map((num) => (
                    <OptionButton
                      key={num}
                      selected={currentNights === num}
                      onClick={() => handleSelectNights(num)}
                      color="bg-emerald-600 border-emerald-600"
                    >
                      {num === 7 ? '1 semana' : `${num} ${num === 1 ? 'noche' : 'noches'}`}
                    </OptionButton>
                  ))}
                </div>
              </div>

              <Field label="Fecha de salida">
                <input
                  type="date"
                  value={checkinForm.expected_check_out}
                  onChange={(e) => handleCheckOutDateChange(e.target.value)}
                  className={INPUT}
                />
              </Field>

              <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500 text-sm font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 shrink-0" />
                Se queda {currentNights} {currentNights === 1 ? 'noche' : 'noches'}
              </div>
            </StepCard>

            {/* ---------- Paso 3: Cobro ---------- */}
            <StepCard n={3} color="bg-indigo-700" title="Cobro" hint="Indica cuánto paga hoy y cómo.">
              <div className="rounded-2xl bg-slate-800 text-white p-4 text-center">
                <p className="text-sm font-semibold text-white/80">Total de la estadía</p>
                <p className="text-3xl font-black">${money(checkinForm.initial_charge)}</p>
                <p className="text-sm font-medium text-white/80">
                  ${money(checkinForm.rate_per_period)} × {currentNights} {currentNights === 1 ? 'noche' : 'noches'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Cuánto paga ahora? *</p>
                <div className="grid grid-cols-3 gap-2">
                  <OptionButton
                    selected={checkinTotal > 0 && checkinPaid === checkinTotal}
                    onClick={() => setCheckinForm((prev) => ({ ...prev, initial_payment: prev.initial_charge }))}
                    color="bg-emerald-600 border-emerald-600"
                  >
                    Todo
                  </OptionButton>
                  <OptionButton
                    selected={checkinTotal > 0 && checkinPaid === Math.round(checkinTotal / 2)}
                    onClick={() =>
                      setCheckinForm((prev) => ({
                        ...prev,
                        initial_payment: String(Math.round(Number(prev.initial_charge || 0) / 2))
                      }))
                    }
                    color="bg-amber-600 border-amber-600"
                  >
                    La mitad
                  </OptionButton>
                  <OptionButton
                    selected={checkinPaid === 0}
                    onClick={() => setCheckinForm((prev) => ({ ...prev, initial_payment: '0' }))}
                    color="bg-rose-600 border-rose-600"
                  >
                    Paga después
                  </OptionButton>
                </div>
                <MoneyInput
                  value={checkinForm.initial_payment}
                  onChange={(v) => setCheckinForm((prev) => ({ ...prev, initial_payment: v }))}
                  required
                  big
                  placeholder="0"
                />
              </div>

              {checkinOwes > 0 ? (
                <div className="px-4 py-3 rounded-xl bg-rose-700 text-white flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">Queda debiendo</span>
                  <span className="text-lg font-black">${money(checkinOwes)}</span>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-emerald-700 text-white flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">Cuenta al día</span>
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Cómo pagó?</p>
                <PayMethodPicker
                  value={checkinForm.payment_method}
                  onChange={(v) => setCheckinForm((prev) => ({ ...prev, payment_method: v }))}
                />
              </div>

              <button
                type="submit"
                className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-black inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                Confirmar llegada
              </button>
            </StepCard>
          </div>
        </form>
      )}

      {/* =====================================================================
          PESTAÑA 4: HUÉSPEDES
      ===================================================================== */}
      {activeTab === 'GUESTS' && (
        <Panel
          accent="violet"
          title="Huéspedes registrados"
          subtitle="Busca un cliente, mira sus visitas o regístrale una nueva llegada."
          icon={<Users className="w-5 h-5 shrink-0" />}
          actions={
            <button
              type="button"
              onClick={openNewGuestModal}
              className={HEAD_BTN}
            >
              <Plus className="w-4 h-4 shrink-0" />
              Nuevo huésped
            </button>
          }
        >
          <div className="flex flex-col lg:flex-row gap-3">
            <SearchInput
              className="flex-1"
              value={guestSearch}
              onChange={setGuestSearch}
              placeholder="Buscar nombre, cédula, teléfono o empresa…"
            />
            <Segmented
              className="lg:w-[380px]"
              value={guestNatFilter}
              onChange={setGuestNatFilter}
              options={[
                { id: 'ALL', label: 'Todos' },
                { id: 'NACIONAL', label: 'Colombianos' },
                { id: 'EXTRANJERO', label: 'Extranjeros' }
              ]}
            />
          </div>

          {filteredGuests.length === 0 ? (
            <EmptyText>No se encontraron huéspedes con esta búsqueda.</EmptyText>
          ) : (
            <>
              {/* Móvil y tablet: tarjetas */}
              <div className="list-scroll lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredGuests.map((g) => {
                  const hasDebt = Number(g.pending_balance || 0) > 0;
                  const isVip = g.vip_status === 1;
                  return (
                    <article
                      key={g.id}
                      className={`rounded-2xl p-4 flex flex-col gap-3 ${flat(isVip ? 'amber' : 'violet', true)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl text-white flex items-center justify-center text-base font-black shrink-0 ${
                            isVip ? 'bg-amber-700' : 'bg-violet-700'
                          }`}
                        >
                          {(g.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 break-words">
                            {g.full_name}
                            {isVip && <span className="ml-1.5 text-amber-600">★</span>}
                          </p>
                          <p className="text-sm text-slate-500 leading-snug">
                            {g.doc_type} {g.document || 'sin documento'} · {g.phone || 'sin teléfono'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {g.total_stays} visita(s){g.last_visit_date ? ` · última ${g.last_visit_date}` : ''}
                          </p>
                        </div>
                      </div>
                      {hasDebt && (
                        <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-200 flex items-center justify-between">
                          <span className="text-sm font-semibold">Debe</span>
                          <span className="text-base font-black">${money(g.pending_balance)}</span>
                        </div>
                      )}
                      <div className="mt-auto grid grid-cols-2 gap-2">
                        {canCheckin && (
                          <button
                            type="button"
                            onClick={() => startCheckinForGuest(g)}
                            className="col-span-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4 shrink-0" />
                            Registrar llegada
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openGuestHistory(g.id)}
                          className="h-10 rounded-xl border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <History className="w-4 h-4 shrink-0" />
                          Visitas
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditGuestModal(g)}
                          className="h-10 rounded-xl border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Edit className="w-4 h-4 shrink-0" />
                          Editar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Escritorio: tabla */}
              <div className="hidden lg:block table-scroll -mx-5">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="py-3 px-5">Huésped</th>
                      <th className="py-3 px-4">Contacto</th>
                      <th className="py-3 px-4">Procedencia</th>
                      <th className="py-3 px-4 text-center">Visitas</th>
                      <th className="py-3 px-4 text-right">Facturado</th>
                      <th className="py-3 px-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredGuests.map((g) => (
                      <tr key={g.id}>
                        <td className="py-3 px-5">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {g.full_name}
                            {g.vip_status === 1 && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-700 text-white text-xs font-bold">
                                ★ VIP
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {g.doc_type}: {g.document || 'Sin doc.'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-slate-700 dark:text-slate-200 font-medium">
                            {g.phone || 'Sin teléfono'}
                            {g.email ? ` · ${g.email}` : ''}
                          </div>
                          {g.company && <div className="text-slate-500">🏢 {g.company}</div>}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold text-slate-700 dark:text-slate-200">
                            {g.nationality || 'Colombiana'}
                          </div>
                          <div className="text-slate-500">
                            {g.origin_city || '-'} → {g.destination_city || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex min-w-8 h-8 px-2 rounded-full bg-indigo-700 text-white font-black items-center justify-center">
                            {g.total_stays}
                          </span>
                          {g.last_visit_date && (
                            <div className="text-xs text-slate-500 mt-0.5">Últ. {g.last_visit_date}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold text-slate-800 dark:text-slate-200">${money(g.total_billed)}</div>
                          {g.pending_balance > 0 && (
                            <div className="text-xs font-bold text-rose-700 dark:text-rose-400">
                              Debe ${money(g.pending_balance)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-5">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            {canCheckin && (
                              <button
                                type="button"
                                onClick={() => startCheckinForGuest(g)}
                                className="h-10 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                title="Registrar nueva llegada para este huésped"
                              >
                                <UserCheck className="w-4 h-4" />
                                Llegada
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openGuestHistory(g.id)}
                              className="h-10 px-3 rounded-lg border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <History className="w-4 h-4" />
                              Visitas
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditGuestModal(g)}
                              className="w-10 h-10 rounded-lg border-2 border-slate-400 dark:border-slate-500 bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 inline-flex items-center justify-center cursor-pointer"
                              title="Editar huésped"
                              aria-label="Editar huésped"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}

      {/* =====================================================================
          VENTANA: CUENTA DE LA ESTADÍA (CARGOS, PAGOS, ACOMPAÑANTES)
      ===================================================================== */}
      {folioModal && (
        <Modal
          size="2xl"
          color="bg-indigo-700"
          icon={<FileText className="w-6 h-6" />}
          title={`Cuenta · Hab. ${folioModal.stay.room_number}`}
          subtitle={`${folioModal.stay.guest_name} · ${folioModal.stay.doc_type} ${folioModal.stay.guest_document || 'S/D'}`}
          onClose={() => setFolioModal(null)}
          footer={
            <>
              <SecondaryBtn onClick={() => setFolioModal(null)}>Cerrar</SecondaryBtn>
              {folioModal.stay.status === 'ACTIVA' && canCheckout && (
                <PrimaryBtn
                  color="bg-rose-600 hover:bg-rose-700"
                  onClick={() => {
                    const stayToCheckout = folioModal.stay;
                    setFolioModal(null);
                    openCheckoutModal(stayToCheckout);
                  }}
                >
                  <LogOut className="w-5 h-5" />
                  Dar salida
                </PrimaryBtn>
              )}
            </>
          }
        >
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard variant="flat" compact color="bg-slate-800" label="Consumido" value={`$${money(folioModal.stay.total_charges)}`} />
            <StatCard variant="flat" compact color="bg-emerald-700" label="Pagado" value={`$${money(folioModal.stay.total_paid)}`} />
            <StatCard
              variant="flat"
              compact
              color={Number(folioModal.stay.balance || 0) > 0 ? 'bg-rose-700' : 'bg-emerald-700'}
              label="Debe"
              value={`$${money(folioModal.stay.balance)}`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Cargos */}
            <section className="space-y-3">
              <h4 className="text-base font-black text-slate-900 dark:text-white">
                Consumos y cargos ({folioModal.charges.length})
              </h4>

              {folioModal.stay.status === 'ACTIVA' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {Number(folioModal.stay.rate_per_period || 0) > 0 && (
                      <QuickAdd
                        onClick={() =>
                          submitFolioCharge('ALOJAMIENTO', 'Noche adicional', Number(folioModal.stay.rate_per_period))
                        }
                      >
                        🛏️ +1 noche ${money(folioModal.stay.rate_per_period)}
                      </QuickAdd>
                    )}
                    <QuickAdd onClick={() => submitFolioCharge('MINIBAR', 'Agua / Bebida', 4000)}>
                      💧 Bebida $4.000
                    </QuickAdd>
                    <QuickAdd onClick={() => submitFolioCharge('RESTAURANTE', 'Alimentación / Restaurante', 18000)}>
                      🍽️ Comida $18.000
                    </QuickAdd>
                    <QuickAdd onClick={() => submitFolioCharge('LAVANDERIA', 'Servicio de Lavandería', 15000)}>
                      🧺 Lavandería $15.000
                    </QuickAdd>
                  </div>

                  <form
                    onSubmit={handleAddFolioCharge}
                    className={`p-4 rounded-2xl ${flat('slate')} space-y-3`}
                  >
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Otro cargo</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={newChargeForm.type}
                        onChange={(e) => setNewChargeForm((prev) => ({ ...prev, type: e.target.value }))}
                        className={INPUT}
                        aria-label="Tipo de cargo"
                      >
                        <option value="ALOJAMIENTO">Noche / Alojamiento</option>
                        <option value="RESTAURANTE">Restaurante</option>
                        <option value="MINIBAR">Minibar / Bebidas</option>
                        <option value="LAVANDERIA">Lavandería</option>
                        <option value="SERVICIO_ADICIONAL">Servicio adicional</option>
                        <option value="PENALIDAD">Daño / Multa</option>
                      </select>
                      <MoneyInput
                        value={newChargeForm.amount}
                        onChange={(v) => setNewChargeForm((prev) => ({ ...prev, amount: v }))}
                        placeholder="Valor"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="¿Qué consumió? *"
                      value={newChargeForm.description}
                      onChange={(e) => setNewChargeForm((prev) => ({ ...prev, description: e.target.value }))}
                      className={INPUT}
                    />
                    <button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar cargo
                    </button>
                  </form>
                </>
              )}

              <ul className={`divide-y divide-slate-300 dark:divide-slate-700 rounded-2xl max-h-60 overflow-y-auto ${flat('slate')}`}>
                {folioModal.charges.length === 0 && (
                  <li className="p-4 text-sm text-slate-500 text-center">Sin cargos todavía.</li>
                )}
                {folioModal.charges.map((c) => (
                  <li key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 break-words">{c.description}</p>
                      <p className="text-xs text-slate-500">
                        {chargeTypeLabel(c.type)} · {c.date}
                      </p>
                    </div>
                    <span className="font-black text-slate-900 dark:text-white shrink-0">${money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pagos */}
            <section className="space-y-3">
              <h4 className="text-base font-black text-slate-900 dark:text-white">
                Pagos y abonos ({folioModal.payments.length})
              </h4>

              {folioModal.stay.status === 'ACTIVA' && (
                <form
                  onSubmit={handleAddFolioPayment}
                  className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500 space-y-3"
                >
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Recibir un pago</p>
                  {Number(folioModal.stay.balance || 0) > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <QuickAdd
                        onClick={() =>
                          setNewPaymentForm((prev) => ({
                            ...prev,
                            amount: String(Math.max(0, Number(folioModal.stay.balance || 0)))
                          }))
                        }
                      >
                        Todo ${money(folioModal.stay.balance)}
                      </QuickAdd>
                      <QuickAdd
                        onClick={() =>
                          setNewPaymentForm((prev) => ({
                            ...prev,
                            amount: String(Math.round(Math.max(0, Number(folioModal.stay.balance || 0)) / 2))
                          }))
                        }
                      >
                        Mitad ${money(Math.round(Number(folioModal.stay.balance) / 2))}
                      </QuickAdd>
                    </div>
                  )}
                  <MoneyInput
                    value={newPaymentForm.amount}
                    onChange={(v) => setNewPaymentForm((prev) => ({ ...prev, amount: v }))}
                    placeholder="Valor del pago"
                  />
                  <PayMethodPicker
                    value={newPaymentForm.method}
                    onChange={(v) => setNewPaymentForm((prev) => ({ ...prev, method: v }))}
                    color="bg-emerald-600 border-emerald-600"
                  />
                  <input
                    type="text"
                    placeholder="N.º de comprobante (opcional)"
                    value={newPaymentForm.reference}
                    onChange={(e) => setNewPaymentForm((prev) => ({ ...prev, reference: e.target.value }))}
                    className={INPUT}
                  />
                  <button
                    type="submit"
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Guardar pago
                  </button>
                </form>
              )}

              <ul className={`divide-y divide-slate-300 dark:divide-slate-700 rounded-2xl max-h-60 overflow-y-auto ${flat('slate')}`}>
                {folioModal.payments.length === 0 && (
                  <li className="p-4 text-sm text-slate-500 text-center">Sin pagos todavía.</li>
                )}
                {folioModal.payments.map((p) => (
                  <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 break-words">
                        {payLabel(p.method)} · {p.reference || 'Abono'}
                      </p>
                      <p className="text-xs text-slate-500">{p.date}</p>
                    </div>
                    <span className="font-black text-emerald-700 dark:text-emerald-400 shrink-0">${money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Acompañantes */}
          <section className="space-y-3 pt-4 border-t border-slate-300 dark:border-slate-700">
            <h4 className="text-base font-black text-slate-900 dark:text-white">
              Acompañantes ({folioModal.companions.length})
            </h4>

            {folioModal.stay.status === 'ACTIVA' && (
              <form
                onSubmit={handleAddCompanionToStay}
                className={`p-4 rounded-2xl ${flat('slate')} grid grid-cols-1 sm:grid-cols-2 gap-3`}
              >
                <Field label="Nombre *">
                  <input
                    type="text"
                    required
                    value={newCompForm.full_name}
                    onChange={(e) => setNewCompForm((prev) => ({ ...prev, full_name: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                <Field label="Documento">
                  <input
                    type="text"
                    value={newCompForm.document}
                    onChange={(e) => setNewCompForm((prev) => ({ ...prev, document: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100 cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={Boolean(newCompForm.is_minor)}
                    onChange={(e) => setNewCompForm((prev) => ({ ...prev, is_minor: e.target.checked }))}
                    className="w-5 h-5 accent-amber-600 shrink-0"
                  />
                  Es menor de edad
                </label>
                <Field
                  label={newCompForm.is_minor ? 'Autorización de los padres (Ley 679) *' : 'Parentesco u observación'}
                  className="sm:col-span-2"
                >
                  <input
                    type="text"
                    value={newCompForm.parental_auth_notes}
                    onChange={(e) =>
                      setNewCompForm((prev) => ({ ...prev, parental_auth_notes: e.target.value }))
                    }
                    className={INPUT}
                  />
                </Field>
                <button
                  type="submit"
                  className="sm:col-span-2 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Agregar acompañante
                </button>
              </form>
            )}

            {folioModal.companions.length > 0 && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {folioModal.companions.map((c) => (
                  <li
                    key={c.id}
                    className={`px-4 py-3 rounded-xl flex items-center justify-between gap-2 text-sm ${flat('slate')}`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 break-words">{c.full_name}</p>
                      <p className="text-xs text-slate-500 leading-snug">
                        {c.doc_type}: {c.document || 'S/D'}
                        {Number(c.is_minor) === 1 && ` · Menor · ${c.parental_auth_notes}`}
                      </p>
                    </div>
                    {folioModal.stay.status === 'ACTIVA' && c.id && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCompanionFromStay(c.id!)}
                        className="w-10 h-10 rounded-lg border border-rose-300 dark:border-rose-500 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label={`Quitar a ${c.full_name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: CAMBIAR DE HABITACIÓN
      ===================================================================== */}
      {changeRoomStay && (
        <Modal
          color="bg-indigo-700"
          icon={<ArrowLeftRight className="w-6 h-6" />}
          title="Cambiar de habitación"
          subtitle={`${changeRoomStay.guest_name} · está en la ${changeRoomStay.room_number}`}
          onClose={() => setChangeRoomStay(null)}
          onSubmit={handleExecuteChangeRoom}
          footer={
            <>
              <SecondaryBtn onClick={() => setChangeRoomStay(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-indigo-600 hover:bg-indigo-700">Cambiar</PrimaryBtn>
            </>
          }
        >
          <p className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-500/15 border border-sky-300 dark:border-sky-500 text-sm text-sky-900 dark:text-sky-100">
            El huésped pasa a la nueva habitación, la anterior queda para aseo y la cuenta sigue igual.
          </p>

          <Field label="Nueva habitación *">
            <select
              required
              value={changeRoomForm.new_room_id}
              onChange={(e) => {
                const sel = rooms.find((r) => String(r.id) === e.target.value);
                setChangeRoomForm((prev) => ({
                  ...prev,
                  new_room_id: e.target.value,
                  new_rate_per_period: sel ? String(sel.price) : prev.new_rate_per_period
                }));
              }}
              className={INPUT}
            >
              <option value="">— Elige una habitación libre —</option>
              {rooms
                .filter((r) => r.id !== changeRoomStay.room_id && ['DISPONIBLE', 'LIMPIA'].includes(r.status))
                .map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    Hab. {r.number} ({r.room_type_name}) — ${money(r.price)}
                  </option>
                ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nuevo precio por noche">
              <MoneyInput
                value={changeRoomForm.new_rate_per_period}
                onChange={(v) => setChangeRoomForm((prev) => ({ ...prev, new_rate_per_period: v }))}
              />
            </Field>
            <Field label="Cobro extra (si aplica)">
              <MoneyInput
                value={changeRoomForm.price_adjustment}
                onChange={(v) => setChangeRoomForm((prev) => ({ ...prev, price_adjustment: v }))}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Por qué se cambia? *</p>
            <div className="flex flex-wrap gap-2">
              {['Upgrade solicitado', 'Falla en habitación', 'Preferencia huésped'].map((rs) => (
                <Chip
                  key={rs}
                  selected={changeRoomForm.reason === rs}
                  onClick={() => setChangeRoomForm((prev) => ({ ...prev, reason: rs }))}
                >
                  {rs}
                </Chip>
              ))}
            </div>
            <input
              type="text"
              required
              value={changeRoomForm.reason}
              onChange={(e) => setChangeRoomForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="O escribe el motivo"
              className={INPUT}
            />
          </div>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: SALIDA (CHECK-OUT)
      ===================================================================== */}
      {checkoutStay && (
        <Modal
          color="bg-rose-700"
          icon={<LogOut className="w-6 h-6" />}
          title={`Salida · Hab. ${checkoutStay.room_number}`}
          subtitle={checkoutStay.guest_name}
          onClose={() => setCheckoutStay(null)}
          onSubmit={handleExecuteCheckout}
          footer={
            <>
              <SecondaryBtn onClick={() => setCheckoutStay(null)}>Volver</SecondaryBtn>
              <PrimaryBtn color="bg-rose-600 hover:bg-rose-700">Confirmar salida</PrimaryBtn>
            </>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <MiniFigure label="Consumido" value={`$${money(checkoutStay.total_charges)}`} />
            <MiniFigure label="Pagado" value={`$${money(checkoutStay.total_paid)}`} tone="in" />
            <MiniFigure
              label="Debe"
              value={`$${money(checkoutStay.balance)}`}
              tone={Number(checkoutStay.balance || 0) > 0 ? 'out' : 'in'}
            />
          </div>

          {Number(checkoutStay.balance || 0) > 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Cuánto paga ahora?</p>
                <div className="grid grid-cols-2 gap-2">
                  <OptionButton
                    selected={
                      Number(checkoutForm.settle_payment_amount || 0) === Math.round(Number(checkoutStay.balance || 0))
                    }
                    onClick={() =>
                      setCheckoutForm((prev) => ({
                        ...prev,
                        settle_payment_amount: String(Math.round(Number(checkoutStay.balance || 0)))
                      }))
                    }
                    color="bg-emerald-600 border-emerald-600"
                  >
                    Paga todo
                  </OptionButton>
                  <OptionButton
                    selected={Number(checkoutForm.settle_payment_amount || 0) === 0}
                    onClick={() => setCheckoutForm((prev) => ({ ...prev, settle_payment_amount: '0' }))}
                    color="bg-rose-600 border-rose-600"
                  >
                    No paga ahora
                  </OptionButton>
                </div>
                <MoneyInput
                  value={checkoutForm.settle_payment_amount}
                  onChange={(v) => setCheckoutForm((prev) => ({ ...prev, settle_payment_amount: v }))}
                  big
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Cómo pagó?</p>
                <PayMethodPicker
                  value={checkoutForm.payment_method}
                  onChange={(v) => setCheckoutForm((prev) => ({ ...prev, payment_method: v }))}
                  color="bg-emerald-600 border-emerald-600"
                />
              </div>

              {Number(checkoutForm.settle_payment_amount || 0) < Number(checkoutStay.balance || 0) && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500 space-y-3">
                  <label className="flex items-start gap-3 text-sm font-semibold text-amber-950 dark:text-amber-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkoutForm.authorize_pending_balance}
                      onChange={(e) =>
                        setCheckoutForm((prev) => ({ ...prev, authorize_pending_balance: e.target.checked }))
                      }
                      className="w-5 h-5 accent-amber-600 shrink-0 mt-0.5"
                    />
                    Dejar salir aunque quede debiendo (queda como cuenta por cobrar)
                  </label>
                  {checkoutForm.authorize_pending_balance && (
                    <input
                      type="text"
                      required
                      placeholder="¿Por qué? ¿Quién responde por la deuda? *"
                      value={checkoutForm.checkout_auth_reason}
                      onChange={(e) =>
                        setCheckoutForm((prev) => ({ ...prev, checkout_auth_reason: e.target.value }))
                      }
                      className={INPUT}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              La cuenta está al día. Puede salir.
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿Cómo queda la habitación?</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'PENDIENTE_LIMPIEZA', emoji: '🧹', label: 'Por limpiar' },
                { id: 'EN_LIMPIEZA', emoji: '🧼', label: 'Limpiando ya' },
                { id: 'MANTENIMIENTO', emoji: '🔧', label: 'Mantenimiento' }
              ].map((o) => (
                <OptionButton
                  key={o.id}
                  selected={checkoutForm.next_room_status === o.id}
                  onClick={() => setCheckoutForm((prev) => ({ ...prev, next_room_status: o.id }))}
                  color="bg-amber-600 border-amber-600"
                >
                  <span aria-hidden>{o.emoji}</span>
                  <span>{o.label}</span>
                </OptionButton>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: VISITAS DE UN HUÉSPED
      ===================================================================== */}
      {guestHistoryModal && (
        <Modal
          size="xl"
          color="bg-indigo-700"
          icon={<History className="w-6 h-6" />}
          title={guestHistoryModal.guest?.full_name || 'Huésped'}
          subtitle={`${guestHistoryModal.guest?.doc_type || ''} ${guestHistoryModal.guest?.document || ''} · ${
            guestHistoryModal.stays?.length || 0
          } visita(s)`}
          onClose={() => setGuestHistoryModal(null)}
          footer={<SecondaryBtn onClick={() => setGuestHistoryModal(null)}>Cerrar</SecondaryBtn>}
        >
          {(guestHistoryModal.stays || []).length === 0 ? (
            <EmptyText>Este huésped aún no tiene visitas registradas.</EmptyText>
          ) : (
            <ul className={`divide-y divide-slate-300 dark:divide-slate-700 rounded-2xl ${flat('slate')}`}>
              {(guestHistoryModal.stays || []).map((st: any) => (
                <li key={st.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">
                      Hab. {st.room_number} ({st.room_type_name || 'Estándar'})
                    </p>
                    <p className="text-xs text-slate-500">
                      Llegó: {st.check_in_time} · Salió: {st.check_out_time || 'aún está'}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <p className="font-bold text-slate-900 dark:text-white">Consumo ${money(st.total_charges)}</p>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Pagado ${money(st.total_paid)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: CREAR / EDITAR HUÉSPED
      ===================================================================== */}
      {showGuestModal && (
        <Modal
          size="lg"
          color="bg-indigo-700"
          icon={editingGuestId ? <Edit className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
          title={editingGuestId ? 'Editar huésped' : 'Nuevo huésped'}
          subtitle="Los campos con * son obligatorios"
          onClose={() => setShowGuestModal(false)}
          onSubmit={handleSaveGuestProfile}
          footer={
            <>
              <SecondaryBtn onClick={() => setShowGuestModal(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-indigo-600 hover:bg-indigo-700">Guardar</PrimaryBtn>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombres *">
              <input
                type="text"
                required
                value={guestForm.first_name}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, first_name: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Apellidos">
              <input
                type="text"
                value={guestForm.last_name}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, last_name: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Tipo de documento">
              <select
                value={guestForm.doc_type}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, doc_type: e.target.value }))}
                className={INPUT}
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Número de documento">
              <input
                type="text"
                value={guestForm.document}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, document: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="tel"
                value={guestForm.phone}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, phone: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Nacionalidad">
              <input
                type="text"
                value={guestForm.nationality}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, nationality: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Viene de">
              <input
                type="text"
                value={guestForm.origin_city}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, origin_city: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Va para">
              <input
                type="text"
                value={guestForm.destination_city}
                onChange={(e) => setGuestForm((prev) => ({ ...prev, destination_city: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500 text-sm font-semibold text-amber-950 dark:text-amber-100 cursor-pointer">
            <input
              type="checkbox"
              checked={guestForm.vip_status}
              onChange={(e) => setGuestForm((prev) => ({ ...prev, vip_status: e.target.checked }))}
              className="w-5 h-5 accent-amber-600 shrink-0"
            />
            ★ Cliente frecuente / VIP
          </label>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: NUEVA HABITACIÓN
      ===================================================================== */}
      {showAddRoomModal && (
        <Modal
          color="bg-emerald-700"
          icon={<BedDouble className="w-6 h-6" />}
          title="Nueva habitación"
          subtitle="Aparecerá en el mapa de habitaciones"
          onClose={() => setShowAddRoomModal(false)}
          onSubmit={handleCreateRoom}
          footer={
            <>
              <SecondaryBtn onClick={() => setShowAddRoomModal(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-emerald-600 hover:bg-emerald-700">Guardar</PrimaryBtn>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número o nombre *">
              <input
                type="text"
                required
                placeholder="Ej: 101"
                value={newRoomForm.number}
                onChange={(e) => setNewRoomForm((prev) => ({ ...prev, number: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Piso">
              <input
                type="text"
                placeholder="Ej: 1"
                value={newRoomForm.floor}
                onChange={(e) => setNewRoomForm((prev) => ({ ...prev, floor: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Tipo de habitación">
            <select
              value={newRoomForm.room_type_id}
              onChange={(e) => setNewRoomForm((prev) => ({ ...prev, room_type_id: e.target.value }))}
              className={INPUT}
            >
              <option value="">Estándar (por defecto)</option>
              {roomTypes.map((rt: any) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio por noche *">
              <MoneyInput
                value={newRoomForm.price}
                onChange={(v) => setNewRoomForm((prev) => ({ ...prev, price: v }))}
                required
              />
            </Field>
            <Field label="¿Cuántas personas?">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="10"
                value={newRoomForm.capacity}
                onChange={(e) => setNewRoomForm((prev) => ({ ...prev, capacity: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   AUXILIARES DE PRESENTACIÓN (solo diseño)
========================================================================= */

const DOC_TYPES = [
  { id: 'CC', label: 'CC' },
  { id: 'CE', label: 'CE' },
  { id: 'PASAPORTE', label: 'Pasaporte' },
  { id: 'PPT', label: 'PPT' },
  { id: 'NIT', label: 'NIT' }
];

const payLabel = (m: string) =>
  m === 'EFECTIVO' ? 'Efectivo' : m === 'TRANSFERENCIA' ? 'Nequi / Transf.' : m === 'TARJETA' ? 'Tarjeta' : m;

const chargeTypeLabel = (t: string) =>
  (
    ({
      ALOJAMIENTO: 'Alojamiento',
      RESTAURANTE: 'Restaurante',
      MINIBAR: 'Minibar',
      LAVANDERIA: 'Lavandería',
      SERVICIO_ADICIONAL: 'Servicio adicional',
      PENALIDAD: 'Daño / Multa'
    }) as Record<string, string>
  )[t] || t;

function StepCard({
  n,
  color,
  title,
  hint,
  children
}: {
  n: number;
  color: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel
      accent={toneFromBg(color)}
      title={title}
      subtitle={hint}
      icon={<span className="text-lg font-black">{n}</span>}
    >
      {children}
    </Panel>
  );
}

function Chip({
  selected,
  onClick,
  color = 'bg-indigo-600 border-indigo-600',
  children
}: {
  selected: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-10 px-4 rounded-full text-sm font-semibold border cursor-pointer ${
        selected
          ? `${color} text-white`
          : 'bg-white/95 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}

function QuickAdd({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-10 px-3.5 py-2 rounded-xl bg-white/95 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-100 hover:border-indigo-500 cursor-pointer"
    >
      {children}
    </button>
  );
}
