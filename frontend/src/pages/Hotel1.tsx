import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Calendar, 
  User, 
  Phone, 
  FileText, 
  Check, 
  X, 
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Trash2,
  Pencil
} from 'lucide-react';

import API_URL from '../config/api';
import { getTodayString } from '../utils/date';

interface Guest {
  name: string;
  document?: string;
  phone?: string;
  check_in_date: string;
  payment_type: string;
  next_payment_date: string;
}

interface Room {
  id: number;
  number: string;
  price: number;
  status: 'Libre' | 'Ocupada' | 'Pendiente de pago';
  observations?: string;
  guest_name?: string;
  guest_phone?: string;
  guest_document?: string;
  check_in_date?: string;
  payment_type?: string;
  next_payment_date?: string;
}

interface DashboardData {
  rooms: { total: number; occupied: number; free: number };
  today: { income: number; expense: number; balance: number };
  month: { income: number; expense: number; balance: number };
}

interface Transaction {
  id: number;
  type: 'Ingreso' | 'Gasto';
  category: string;
  amount: number;
  date: string;
  description?: string;
}

export default function Hotel1() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modales
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [showRoomsModal, setShowRoomsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Formulario Editar Habitación y Huésped
  const [editForm, setEditForm] = useState({
    number: '',
    price: '',
    observations: '',
    guest_name: '',
    guest_document: '',
    guest_phone: '',
    payment_type: 'Pago diario',
    next_payment_date: getTodayString()
  });

  // Formulario Asignación Huésped
  const [guestForm, setGuestForm] = useState({
    name: '',
    document: '',
    phone: '',
    checkInDate: getTodayString(),
    paymentType: 'Pago diario'
  });

  // Formulario Registrar Pago
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayString());

  // Formulario Crear Habitación
  const [roomForm, setRoomForm] = useState({
    number: '',
    price: '',
    observations: ''
  });

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
      const headers = { Authorization: `Bearer ${token}` };
      
      const [dbRes, roomsRes, txRes] = await Promise.all([
        fetch(`${API_URL}/api/hotel-1/dashboard`, { headers }),
        fetch(`${API_URL}/api/hotel-1/rooms`, { headers }),
        fetch(`${API_URL}/api/hotel-1/transactions`, { headers })
      ]);

      if (!dbRes.ok || !roomsRes.ok || !txRes.ok) {
        throw new Error('Error al obtener datos del Hotel 1');
      }

      const dbData = await dbRes.json();
      const roomsData = await roomsRes.json();
      const txData = await txRes.json();

      setDashboard(dbData);
      setRooms(roomsData);
      setTransactions(txData);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;

    try {
      const response = await fetch(`${API_URL}/api/hotel-1/rooms/${selectedRoom.id}/guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(guestForm)
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
        paymentType: 'Pago diario'
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;

    try {
      const response = await fetch(`${API_URL}/api/hotel-1/rooms/${selectedRoom.id}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount.replace(/\./g, '')),
          date: paymentDate
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al registrar pago');
      }

      setShowPaymentModal(false);
      setSelectedRoom(null);
      setPaymentAmount('');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditModal = (room: Room) => {
    setSelectedRoom(room);
    setEditForm({
      number: room.number,
      price: room.price ? Number(room.price).toLocaleString('de-DE') : '',
      observations: room.observations || '',
      guest_name: room.guest_name || '',
      guest_document: room.guest_document || '',
      guest_phone: room.guest_phone || '',
      payment_type: room.payment_type || 'Pago diario',
      next_payment_date: room.next_payment_date || getTodayString()
    });
    setShowEditModal(true);
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom) return;

    try {
      const response = await fetch(`${API_URL}/api/hotel-1/rooms/${selectedRoom.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          number: editForm.number,
          price: parseFloat(editForm.price.replace(/\./g, '')),
          observations: editForm.observations,
          guest_name: editForm.guest_name,
          guest_document: editForm.guest_document,
          guest_phone: editForm.guest_phone,
          payment_type: editForm.payment_type,
          next_payment_date: editForm.next_payment_date
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al actualizar habitación');
      }

      setShowEditModal(false);
      setSelectedRoom(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCheckout = async (roomId: number) => {
    if (!confirm('¿Está seguro de realizar el Check-out y liberar la habitación?')) return;

    try {
      const response = await fetch(`${API_URL}/api/hotel-1/rooms/${roomId}/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al liberar habitación');
      }

      setSelectedRoom(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/hotel-1/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          number: roomForm.number,
          price: parseFloat(roomForm.price.replace(/\./g, '')),
          observations: roomForm.observations
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al crear habitación');
      }

      setShowAddRoomModal(false);
      setRoomForm({ number: '', price: '', observations: '' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddTx = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/hotel-1/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
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
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta transacción? Esta acción no se puede deshacer y afectará los reportes y balances.')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/hotel-1/transactions/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al eliminar transacción');
      }

      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500 font-medium animate-pulse">Cargando datos del Hotel 1...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Listón Superior */}
      <div className="w-full h-2.5 bg-emerald-500 rounded-full mb-4 shadow-sm"></div>
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-emerald-500 text-white rounded-2xl border border-emerald-600 shadow-sm"><Building2 className="w-6 h-6" /></span>
            Hotel 1
          </h1>
          <p className="text-slate-655 dark:text-slate-400 text-sm">Dashboard operativo y control de habitaciones.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowAddRoomModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-350 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Habitación</span>
          </button>
          <button
            onClick={() => setShowAddTxModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Transacción</span>
          </button>
        </div>
      </div>

      {/* Métricas del Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Habitaciones</span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{dashboard.rooms.total}</span>
              <div className="text-xs font-medium space-x-2 text-slate-500 dark:text-slate-400">
                <span className="text-emerald-600 dark:text-emerald-400">🟢 {dashboard.rooms.free} Libres</span>
                <span className="text-red-500 dark:text-red-400">🔴 {dashboard.rooms.occupied} Ocup.</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              Ingresos de hoy
              <span className="inline-flex p-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg"><TrendingUp className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                ${Number(dashboard.today.income || 0).toLocaleString('de-DE')}
              </span>
              <span className="text-xs text-slate-400">Total recibido hoy</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              Gastos del día
              <span className="inline-flex p-1 bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-lg"><TrendingDown className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                ${Number(dashboard.today.expense || 0).toLocaleString('de-DE')}
              </span>
              <span className="text-xs text-slate-400">Total egresado hoy</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Balance Mensual</span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                ${Number(dashboard.month.balance || 0).toLocaleString('de-DE')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Ing: ${Number(dashboard.month.income || 0).toLocaleString('de-DE')} | Gas: ${Number(dashboard.month.expense || 0).toLocaleString('de-DE')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sección Habitaciones */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight flex items-center justify-center sm:justify-start gap-2">
            <Building2 className="w-5 h-5 text-emerald-500" />
            Estado de Habitaciones
          </h2>
          <p className="text-slate-550 dark:text-slate-400 text-sm">Administra las habitaciones libres, ocupadas y registra huéspedes.</p>
        </div>
        <button
          onClick={() => setShowRoomsModal(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.98]"
        >
          <Building2 className="w-4 h-4" />
          <span>Ver / Gestionar Habitaciones ({rooms.length})</span>
        </button>
      </div>

      {/* Historial de Transacciones */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          Historial Financiero Reciente (Hotel 1)
        </h2>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl pr-1">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-medium">
                <th className="py-3 px-2">Fecha</th>
                <th className="py-3 px-2">Tipo</th>
                <th className="py-3 px-2">Categoría</th>
                <th className="py-3 px-2">Descripción</th>
                <th className="py-3 px-2 text-right">Monto</th>
                <th className="py-3 px-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-2 text-slate-500 dark:text-slate-400">{tx.date}</td>
                  <td className="py-3.5 px-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      tx.type === 'Ingreso' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-2 text-slate-700 dark:text-slate-200 font-medium">{tx.category}</td>
                  <td className="py-3.5 px-2 text-slate-500 max-w-xs truncate">{tx.description || '-'}</td>
                  <td className={`py-3.5 px-2 text-right font-semibold ${
                    tx.type === 'Ingreso' ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    ${Number(tx.amount || 0).toLocaleString('de-DE')}
                  </td>
                  <td className="py-3.5 px-2 text-center">
                    <button
                      onClick={() => handleDeleteTransaction(tx.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                      title="Eliminar transacción"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-450">No hay transacciones registradas aún.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL DETALLE HABITACIÓN --- */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Habitación {selectedRoom.number}</h3>
                <span className="text-sm text-slate-500 font-medium">Tarifa: ${Number(selectedRoom.price || 0).toLocaleString('de-DE')} / día</span>
              </div>
              <button 
                onClick={() => setSelectedRoom(null)} 
                className="p-1 text-slate-400 bg-slate-100 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Estado actual</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  selectedRoom.status === 'Libre'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : selectedRoom.status === 'Ocupada'
                    ? 'bg-red-50 text-red-600 border-red-100'
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  {selectedRoom.status}
                </span>
              </div>
              {selectedRoom.observations && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500 font-medium block mb-0.5">Observaciones</span>
                  <span className="text-slate-700">{selectedRoom.observations}</span>
                </div>
              )}
            </div>

            {selectedRoom.status === 'Libre' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">La habitación está lista. Puedes realizar el Check-in para asignarla a un huésped.</p>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
                >
                  Asignar Huésped (Check-in)
                </button>
                <button
                  onClick={() => openEditModal(selectedRoom)}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" /> Editar Habitación
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <h4 className="font-semibold text-slate-800 flex items-center gap-2"><User className="w-4 h-4" /> Datos del Huésped</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Nombre</span>
                      <span className="font-medium text-slate-800">{selectedRoom.guest_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Teléfono</span>
                      <span className="font-medium text-slate-800">{selectedRoom.guest_phone || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Documento</span>
                      <span className="font-medium text-slate-800">{selectedRoom.guest_document || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Frecuencia de pago</span>
                      <span className="font-medium text-slate-800">{selectedRoom.payment_type}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Ingreso</span>
                      <span className="font-medium text-slate-800">{selectedRoom.check_in_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Próximo Cobro</span>
                      <span className="font-semibold text-amber-600">{selectedRoom.next_payment_date}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
                    >
                      Registrar Pago / Abono
                    </button>
                    <button
                      onClick={() => handleCheckout(selectedRoom.id)}
                      className="py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
                    >
                      Liberar (Check-out)
                    </button>
                  </div>
                  <button
                    onClick={() => openEditModal(selectedRoom)}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Pencil className="w-4 h-4 text-slate-600" /> Editar Habitación / Huésped
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL ASIGNAR HUÉSPED --- */}
      {showAssignModal && selectedRoom && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Check-in Habitación {selectedRoom.number}</h3>
              <button onClick={() => setShowAssignModal(false)} className="p-1 text-slate-450 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignGuest} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Nombre del Huésped *</label>
                <input
                  type="text"
                  required
                  value={guestForm.name}
                  onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                  placeholder="Nombre completo"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Documento</label>
                  <input
                    type="text"
                    value={guestForm.document}
                    onChange={(e) => setGuestForm({ ...guestForm, document: e.target.value })}
                    placeholder="Opcional"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Teléfono</label>
                  <input
                    type="text"
                    value={guestForm.phone}
                    onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                    placeholder="Opcional"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Fecha Ingreso *</label>
                <input
                  type="date"
                  required
                  value={guestForm.checkInDate}
                  onChange={(e) => setGuestForm({ ...guestForm, checkInDate: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Frecuencia de Cobro *</label>
                <select
                  value={guestForm.paymentType}
                  onChange={(e) => setGuestForm({ ...guestForm, paymentType: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                >
                  <option value="Pago diario">Pago diario</option>
                  <option value="Pago cada 3 días">Pago cada 3 días</option>
                  <option value="Pago semanal">Pago semanal</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
              >
                Completar Check-in
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REGISTRAR PAGO --- */}
      {showPaymentModal && selectedRoom && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Registrar Pago / Abono</h3>
              <button onClick={() => setShowPaymentModal(false)} className="p-1 text-slate-450 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterPayment} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Valor recibido ($) *</label>
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
                  placeholder={`Tarifa sugerida: $${Number(selectedRoom.price || 0).toLocaleString('de-DE')}`}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Fecha del Pago *</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <p className="text-xs text-slate-400">
                Al registrar el abono se extenderá la fecha de cobro automáticamente según el tipo de pago del huésped ({selectedRoom.payment_type}).
              </p>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
              >
                Confirmar Pago
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR HABITACIÓN --- */}
      {showAddRoomModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Crear Habitación</h3>
              <button onClick={() => setShowAddRoomModal(false)} className="p-1 text-slate-450 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRoom} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Número de Habitación *</label>
                <input
                  type="text"
                  required
                  value={roomForm.number}
                  onChange={(e) => setRoomForm({ ...roomForm, number: e.target.value })}
                  placeholder="Ej: 101"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Precio por día ($) *</label>
                <input
                  type="text"
                  required
                  value={roomForm.price}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, '');
                    if (!isNaN(Number(raw)) || raw === '') {
                      const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                      setRoomForm({ ...roomForm, price: formatted });
                    }
                  }}
                  placeholder="Ej: 20.000"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Observaciones</label>
                <textarea
                  value={roomForm.observations}
                  onChange={(e) => setRoomForm({ ...roomForm, observations: e.target.value })}
                  placeholder="Detalles sobre camas, ventilador, baño, etc."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
              >
                Guardar Habitación
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REGISTRAR TRANSACCIÓN MANUAL (Ingreso/Gasto) --- */}
      {showAddTxModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Registrar Transacción Manual</h3>
              <button onClick={() => setShowAddTxModal(false)} className="p-1 text-slate-450 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: 'Gasto', category: 'Mercado' })}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                    txForm.type === 'Gasto' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: 'Ingreso', category: 'Manual' })}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                    txForm.type === 'Ingreso' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ingreso
                </button>
              </div>

              {txForm.type === 'Gasto' ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Concepto / Categoría *</label>
                  <select
                    value={txForm.category}
                    onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  >
                    <option value="Mercado">Mercado</option>
                    <option value="Servicios">Servicios</option>
                    <option value="Aseo">Aseo</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Concepto / Categoría *</label>
                  <select
                    value={txForm.category}
                    onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  >
                    <option value="Manual">Ingreso Manual</option>
                    <option value="Hospedaje">Ingreso Hospedaje</option>
                  </select>
                </div>
              )}

               <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Monto ($) *</label>
                <input
                  type="text"
                  required
                  value={txForm.amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, '');
                    if (!isNaN(Number(raw)) || raw === '') {
                      const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                      setTxForm({ ...txForm, amount: formatted });
                    }
                  }}
                  placeholder="Monto"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Fecha *</label>
                <input
                  type="date"
                  required
                  value={txForm.date}
                  onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Descripción / Observación</label>
                <textarea
                  value={txForm.description}
                  onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                  placeholder="Detalles adicionales..."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-650 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
              >
                Guardar Transacción
              </button>
            </form>
          </div>
        </div>
      )}
      {/* --- MODAL GESTIONAR HABITACIONES --- */}
      {showRoomsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-5 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Estado de Habitaciones</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Selecciona una habitación para ver detalles, realizar check-in, cobros o check-out.</p>
              </div>
              <button 
                onClick={() => setShowRoomsModal(false)} 
                className="p-1 text-slate-400 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`p-5 rounded-2xl border text-left flex flex-col justify-between h-40 transition-all hover:scale-[1.01] hover:shadow-xs active:scale-[0.99] ${
                    room.status === 'Libre'
                      ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      : room.status === 'Ocupada'
                      ? 'bg-red-50/40 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-950 dark:text-red-200'
                      : 'bg-amber-50/50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-950 dark:text-amber-200 animate-pulse'
                  }`}
                >
                  <div className="w-full flex justify-between items-start">
                    <span className="text-2xl font-bold">Hab. {room.number}</span>
                    <span className={`w-3.5 h-3.5 rounded-full border ${
                      room.status === 'Libre'
                        ? 'bg-emerald-500 border-emerald-600'
                        : room.status === 'Ocupada'
                        ? 'bg-red-500 border-red-600'
                        : 'bg-amber-500 border-amber-600'
                    }`} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-450 dark:text-slate-400 uppercase block">Tarifa diaria</span>
                    <span className="text-lg font-bold">${Number(room.price || 0).toLocaleString('de-DE')}</span>
                    {room.guest_name && (
                      <div className="flex flex-col space-y-1 mt-1.5">
                        <span className="text-xs font-medium block truncate max-w-[120px]">👤 {room.guest_name}</span>
                        {room.status === 'Ocupada' ? (
                          <span className="inline-flex items-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/60 px-1.5 py-0.5 rounded-md self-start">Al día</span>
                        ) : (
                          <span className="inline-flex items-center text-[9px] font-bold text-red-650 dark:text-red-400 bg-red-50 dark:bg-red-950/60 border border-red-100 dark:border-red-900/60 px-1.5 py-0.5 rounded-md self-start animate-pulse">Debe pago</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* --- MODAL EDITAR HABITACIÓN Y HUÉSPED --- */}
      {showEditModal && selectedRoom && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Editar Habitación {selectedRoom.number}</h3>
                <p className="text-xs text-slate-500">Modifica la información de la habitación y del huésped.</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 text-slate-450 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRoom} className="space-y-5">
              {/* Sección Habitación */}
              <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" /> Datos de la Habitación
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Número *</label>
                    <input
                      type="text"
                      required
                      value={editForm.number}
                      onChange={(e) => setEditForm({ ...editForm, number: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Precio por día ($) *</label>
                    <input
                      type="text"
                      required
                      value={editForm.price}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\./g, '');
                        if (!isNaN(Number(raw)) || raw === '') {
                          const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                          setEditForm({ ...editForm, price: formatted });
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Observaciones</label>
                  <textarea
                    value={editForm.observations}
                    onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                    rows={2}
                    placeholder="Detalles sobre la habitación..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Sección Huésped (Si la habitación está ocupada o tiene datos de huésped) */}
              {(selectedRoom.status !== 'Libre' || selectedRoom.guest_name) && (
                <div className="space-y-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <h4 className="font-semibold text-indigo-900 text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" /> Información del Huésped y Pago
                  </h4>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Nombre del Huésped *</label>
                    <input
                      type="text"
                      required
                      value={editForm.guest_name}
                      onChange={(e) => setEditForm({ ...editForm, guest_name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Documento</label>
                      <input
                        type="text"
                        value={editForm.guest_document}
                        onChange={(e) => setEditForm({ ...editForm, guest_document: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Teléfono</label>
                      <input
                        type="text"
                        value={editForm.guest_phone}
                        onChange={(e) => setEditForm({ ...editForm, guest_phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Frecuencia / Tipo de Pago *</label>
                    <select
                      value={editForm.payment_type}
                      onChange={(e) => {
                        const newType = e.target.value;
                        let baseDate = selectedRoom.check_in_date ? new Date(selectedRoom.check_in_date) : new Date();
                        let nextP = new Date(baseDate);
                        if (newType === 'Pago diario') nextP.setDate(baseDate.getDate() + 1);
                        else if (newType === 'Pago cada 3 días') nextP.setDate(baseDate.getDate() + 3);
                        else if (newType === 'Pago semanal') nextP.setDate(baseDate.getDate() + 7);

                        const formattedDate = nextP.toISOString().split('T')[0];
                        setEditForm({ ...editForm, payment_type: newType, next_payment_date: formattedDate });
                      }}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Pago diario">Pago diario</option>
                      <option value="Pago cada 3 días">Pago cada 3 días</option>
                      <option value="Pago semanal">Pago semanal</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Próxima Fecha de Cobro *</label>
                    <input
                      type="date"
                      required
                      value={editForm.next_payment_date}
                      onChange={(e) => setEditForm({ ...editForm, next_payment_date: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="w-1/2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm shadow-xs transition-all active:scale-[0.99]"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
