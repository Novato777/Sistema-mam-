import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Plus,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  Lock,
  History,
  DollarSign,
  Camera
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import { getTodayString } from '../utils/date';

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

interface MaintenanceTicket {
  id: number;
  ticket_number: string;
  room_id: number;
  room_number: string;
  room_floor: string;
  room_status: string;
  issue_type: 'CORRECTIVO' | 'PREVENTIVO';
  category: string;
  priority: string;
  title: string;
  description: string;
  status: string;
  block_room: number;
  room_blocked_status: string | null;
  scheduled_date: string;
  estimated_cost: number;
  materials_cost: number;
  labor_cost: number;
  actual_cost: number;
  evidence: string[];
  resolution_notes: string | null;
  reported_by_name: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface RoomRef {
  id: number;
  number: string;
  floor: string;
  status: string;
  room_type_name: string;
}

interface StaffRef {
  id: number;
  full_name: string;
  role: string;
}

interface RoomTechHistory {
  room: RoomRef;
  summary: {
    total_tickets: number;
    open_tickets: number;
    preventive_count: number;
    corrective_count: number;
    total_maintenance_cost: number;
  };
  tickets: MaintenanceTicket[];
  events: {
    id: number;
    category: string;
    previous_status: string;
    new_status: string;
    notes: string;
    cost: number;
    user_name: string | null;
    created_at: string;
  }[];
}

const CATEGORIES = [
  'Plomería',
  'Electricidad',
  'Climatización / AC',
  'Carpintería / Cerraduras',
  'Pintura / Locativo',
  'Mobiliario / Colchones',
  'Televisión / Internet',
  'General'
];

const STATUS_BADGE: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  EN_PROCESO: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  RESUELTO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
};

export default function Mantenimiento() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();
  const canOperate = hasPermission('maintenance.operate');

  const today = getTodayString();
  const [activeTab, setActiveTab] = useState<'ORDENES' | 'HISTORIAL'>('ORDENES');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [rooms, setRooms] = useState<RoomRef[]>([]);
  const [staff, setStaff] = useState<StaffRef[]>([]);
  const [kpis, setKpis] = useState({
    pending_count: 0,
    in_progress_count: 0,
    resolved_month_count: 0,
    preventive_scheduled_count: 0,
    blocked_rooms_count: 0,
    total_cost_month: 0
  });

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modal nueva orden
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    room_id: '',
    issue_type: 'CORRECTIVO',
    category: 'Plomería',
    priority: 'ALTA',
    title: '',
    description: '',
    scheduled_date: today,
    assigned_to: '',
    block_room: false,
    room_blocked_status: 'MANTENIMIENTO',
    estimated_cost: '0',
    evidence_text: ''
  });

  // Modal resolver orden
  const [resolveTarget, setResolveTarget] = useState<MaintenanceTicket | null>(null);
  const [resolveForm, setResolveForm] = useState({
    materials_cost: '0',
    labor_cost: '0',
    resolution_notes: '',
    evidence_text: '',
    unlock_room: true,
    next_room_status: 'DISPONIBLE'
  });

  // Historial técnico por habitación
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomHistory, setRoomHistory] = useState<RoomTechHistory | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const fetchOverview = useCallback(async () => {
    if (!activeHotelId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (typeFilter !== 'ALL') q.set('issue_type', typeFilter);

      const data = await apiRequest('GET', `/hotels/${activeHotelId}/maintenance/overview?${q.toString()}`);
      setTickets(data.tickets || []);
      setRooms(data.rooms || []);
      setStaff(data.staff || []);
      if (data.kpis) setKpis(data.kpis);
      if (data.rooms?.length && !selectedRoomId) {
        setSelectedRoomId(String(data.rooms[0].id));
      }
      if (data.rooms?.length && !createForm.room_id) {
        setCreateForm((f) => ({ ...f, room_id: String(data.rooms[0].id) }));
      }
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al cargar mantenimiento.');
    } finally {
      setLoading(false);
    }
  }, [activeHotelId, statusFilter, typeFilter]);

  const fetchRoomHistory = useCallback(async (roomId: string) => {
    if (!activeHotelId || !roomId) return;
    try {
      const data = await apiRequest(
        'GET',
        `/hotels/${activeHotelId}/maintenance/rooms/${roomId}/history`
      );
      setRoomHistory(data);
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al cargar historial técnico.');
    }
  }, [activeHotelId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (activeTab === 'HISTORIAL' && selectedRoomId) {
      fetchRoomHistory(selectedRoomId);
    }
  }, [activeTab, selectedRoomId, fetchRoomHistory]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const evidenceArr = createForm.evidence_text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await apiRequest('POST', `/hotels/${activeHotelId}/maintenance/tickets`, {
        ...createForm,
        room_id: Number(createForm.room_id),
        assigned_to: createForm.assigned_to ? Number(createForm.assigned_to) : null,
        estimated_cost: Number(createForm.estimated_cost || 0),
        evidence: evidenceArr
      });
      showMsg('success', res.message || 'Orden creada.');
      setCreateModalOpen(false);
      setCreateForm((f) => ({
        ...f,
        title: '',
        description: '',
        estimated_cost: '0',
        evidence_text: '',
        block_room: false
      }));
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al crear orden.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTicket = async (ticketId: number) => {
    try {
      await apiRequest('POST', `/hotels/${activeHotelId}/maintenance/tickets/${ticketId}/start`, {});
      showMsg('success', 'Orden iniciada.');
      await fetchOverview();
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al iniciar orden.');
    }
  };

  const openResolveModal = (t: MaintenanceTicket) => {
    setResolveTarget(t);
    setResolveForm({
      materials_cost: String(t.materials_cost || 0),
      labor_cost: String(t.labor_cost || 0),
      resolution_notes: '',
      evidence_text: (t.evidence || []).join(', '),
      unlock_room: true,
      next_room_status: 'DISPONIBLE'
    });
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;
    setSubmitting(true);
    try {
      const evidenceArr = resolveForm.evidence_text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiRequest(
        'POST',
        `/hotels/${activeHotelId}/maintenance/tickets/${resolveTarget.id}/resolve`,
        {
          materials_cost: Number(resolveForm.materials_cost || 0),
          labor_cost: Number(resolveForm.labor_cost || 0),
          resolution_notes: resolveForm.resolution_notes,
          evidence: evidenceArr,
          unlock_room: resolveForm.unlock_room,
          next_room_status: resolveForm.next_room_status
        }
      );
      showMsg('success', res.message || 'Orden resuelta.');
      setResolveTarget(null);
      await fetchOverview();
      if (activeTab === 'HISTORIAL' && selectedRoomId) {
        await fetchRoomHistory(selectedRoomId);
      }
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : 'Error al resolver orden.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Mantenimiento Preventivo y Correctivo
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Órdenes técnicas, costos de materiales/mano de obra, bloqueo sincronizado con reservas e historial por habitación ·{' '}
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {activeHotel?.name}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canOperate && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              Nueva Orden / Programación
            </button>
          )}
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="shrink-0 min-h-10 px-3 ml-3 rounded-lg bg-white/70 dark:bg-slate-800 text-xs font-bold">
            Cerrar
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Órdenes Pendientes / En Curso</p>
          <p className="text-xl font-bold text-amber-600 mt-1">
            {kpis.pending_count} / {kpis.in_progress_count}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {kpis.preventive_scheduled_count} preventivos programados
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Habitaciones Bloqueadas</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{kpis.blocked_rooms_count}</p>
          <p className="text-[11px] text-slate-400 mt-1">Bloqueadas en motor de reservas</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Resueltas este Mes</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{kpis.resolved_month_count}</p>
          <p className="text-[11px] text-slate-400 mt-1">Atenciones completadas</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500">Costo Mantenimiento Mes</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {formatCOP(kpis.total_cost_month)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Materiales + Mano de obra</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('ORDENES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
            activeTab === 'ORDENES' ? 'bg-orange-600 text-white' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Órdenes de Mantenimiento ({tickets.length})
        </button>
        <button
          onClick={() => setActiveTab('HISTORIAL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
            activeTab === 'HISTORIAL' ? 'bg-orange-600 text-white' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <History className="w-4 h-4" />
          Historial Técnico por Habitación
        </button>
      </div>

      {activeTab === 'ORDENES' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 text-xs">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EN_PROCESO">En Proceso</option>
              <option value="RESUELTO">Resueltos</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
            >
              <option value="ALL">Preventivo y Correctivo</option>
              <option value="CORRECTIVO">Solo Correctivos (Daños)</option>
              <option value="PREVENTIVO">Solo Preventivos (Programados)</option>
            </select>
          </div>

          <div className="list-scroll grid grid-cols-1 md:grid-cols-2 gap-4">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {t.ticket_number}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${STATUS_BADGE[t.status] || ''}`}>
                        {t.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                        {t.issue_type} · {t.priority}
                      </span>
                      {t.block_room === 1 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800">
                          <Lock className="w-3 h-3" />
                          {t.room_blocked_status || 'BLOQUEADA'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                      Hab. #{t.room_number} — {t.title}
                    </h3>
                    <p className="text-slate-500 mt-0.5">{t.description || 'Sin descripción adicional.'}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {formatCOP(t.status === 'RESUELTO' ? t.actual_cost : t.estimated_cost)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {t.status === 'RESUELTO' ? 'Costo real' : 'Estimado'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span>Categoría: <b>{t.category}</b></span>
                  <span>Programado: <b>{t.scheduled_date || '-'}</b></span>
                  <span>Responsable: <b>{t.assigned_to_name || 'Sin asignar'}</b></span>
                </div>

                {t.evidence.length > 0 && (
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" />
                    Evidencias: {t.evidence.join(' | ')}
                  </p>
                )}

                {t.resolution_notes && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 p-2 rounded-xl">
                    Resolución: {t.resolution_notes} (Mat: {formatCOP(t.materials_cost)} · MO: {formatCOP(t.labor_cost)})
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {canOperate && t.status === 'PENDIENTE' && (
                    <button
                      onClick={() => handleStartTicket(t.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-600 text-white font-bold"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Iniciar
                    </button>
                  )}
                  {canOperate && t.status !== 'RESUELTO' && (
                    <button
                      onClick={() => openResolveModal(t)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolver y Desbloquear
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedRoomId(String(t.room_id));
                      setActiveTab('HISTORIAL');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                  >
                    <History className="w-3.5 h-3.5" />
                    Ver Historial Hab. #{t.room_number}
                  </button>
                </div>
              </div>
            ))}
            {tickets.length === 0 && (
              <div className="col-span-full bg-white dark:bg-slate-900 p-8 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-400">
                No hay órdenes de mantenimiento con los filtros actuales.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'HISTORIAL' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
            <label className="font-bold">Habitación:</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Hab. #{r.number} (Piso {r.floor}) · {r.status}
                </option>
              ))}
            </select>
          </div>

          {roomHistory && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-base font-bold">
                  Resumen Técnico Hab. #{roomHistory.room.number}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <p className="text-slate-500">Total Órdenes</p>
                    <p className="text-lg font-extrabold">{roomHistory.summary.total_tickets}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <p className="text-slate-500">Costo Acumulado</p>
                    <p className="text-lg font-extrabold text-orange-600">
                      {formatCOP(roomHistory.summary.total_maintenance_cost)}
                    </p>
                  </div>
                </div>
                <p className="text-slate-500">
                  Preventivos: <b>{roomHistory.summary.preventive_count}</b> · Correctivos:{' '}
                  <b>{roomHistory.summary.corrective_count}</b> · Abiertos:{' '}
                  <b>{roomHistory.summary.open_tickets}</b>
                </p>
              </div>

              <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-base font-bold">Bitácora Técnica y Cambios de Estado</h3>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {roomHistory.events.map((ev) => (
                    <div key={ev.id} className="py-2.5 flex justify-between gap-2">
                      <div>
                        <span className="font-bold text-indigo-600">{ev.category}</span> ·{' '}
                        <span className="text-slate-500">
                          {ev.previous_status} → <b>{ev.new_status}</b>
                        </span>
                        <p className="text-slate-700 dark:text-slate-300 mt-0.5">{ev.notes}</p>
                      </div>
                      <div className="text-right shrink-0 text-[11px] text-slate-400">
                        <p>{ev.created_at?.slice(0, 10)}</p>
                        {Number(ev.cost) > 0 && <p className="font-bold text-slate-700">{formatCOP(ev.cost)}</p>}
                      </div>
                    </div>
                  ))}
                  {roomHistory.events.length === 0 && (
                    <p className="text-slate-400 py-4 text-center">Sin eventos técnicos registrados aún.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Nueva Orden de Mantenimiento */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleCreateTicket}
            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-bold">Nueva Orden de Mantenimiento</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Habitación</label>
                <select
                  required
                  value={createForm.room_id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, room_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Hab. #{r.number} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Tipo</label>
                <select
                  value={createForm.issue_type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, issue_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="CORRECTIVO">Correctivo (Daño / Falla)</option>
                  <option value="PREVENTIVO">Preventivo (Programado)</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Categoría</label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Prioridad</label>
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="URGENTE">URGENTE</option>
                  <option value="ALTA">ALTA</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="BAJA">BAJA</option>
                </select>
              </div>
            </div>

            <input
              required
              placeholder="Título del daño o tarea preventiva"
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <textarea
              rows={2}
              placeholder="Descripción detallada..."
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-bold block mb-1">Fecha Programada</label>
                <input
                  type="date"
                  value={createForm.scheduled_date}
                  onChange={(e) => setCreateForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                  className="w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Responsable</label>
                <select
                  value={createForm.assigned_to}
                  onChange={(e) => setCreateForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">Sin asignar</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Costo Estimado</label>
                <input
                  type="number"
                  min="0"
                  value={createForm.estimated_cost}
                  onChange={(e) => setCreateForm((f) => ({ ...f, estimated_cost: e.target.value }))}
                  className="w-full px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <input
              placeholder="Evidencias / enlaces o notas de foto (separados por coma)"
              value={createForm.evidence_text}
              onChange={(e) => setCreateForm((f) => ({ ...f, evidence_text: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />

            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500 space-y-2">
              <label className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.block_room}
                  onChange={(e) => setCreateForm((f) => ({ ...f, block_room: e.target.checked }))}
                />
                Bloquear habitación automáticamente en Reservas y Recepción
              </label>
              {createForm.block_room && (
                <select
                  value={createForm.room_blocked_status}
                  onChange={(e) => setCreateForm((f) => ({ ...f, room_blocked_status: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-rose-200"
                >
                  <option value="MANTENIMIENTO">Estado: MANTENIMIENTO</option>
                  <option value="FUERA_DE_SERVICIO">Estado: FUERA DE SERVICIO</option>
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800"
              >
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl font-bold bg-orange-600 text-white">
                Crear Orden
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Resolver Orden */}
      {resolveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <form
            onSubmit={handleResolveTicket}
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
          >
            <h3 className="text-base font-bold">
              Resolver {resolveTarget.ticket_number} · Hab. #{resolveTarget.room_number}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold block mb-1">Costo Materiales</label>
                <input
                  type="number"
                  min="0"
                  value={resolveForm.materials_cost}
                  onChange={(e) => setResolveForm((f) => ({ ...f, materials_cost: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Costo Mano de Obra</label>
                <input
                  type="number"
                  min="0"
                  value={resolveForm.labor_cost}
                  onChange={(e) => setResolveForm((f) => ({ ...f, labor_cost: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <textarea
              required
              rows={2}
              placeholder="Notas técnicas de la solución aplicada..."
              value={resolveForm.resolution_notes}
              onChange={(e) => setResolveForm((f) => ({ ...f, resolution_notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <input
              placeholder="Evidencias de cierre (separadas por coma)"
              value={resolveForm.evidence_text}
              onChange={(e) => setResolveForm((f) => ({ ...f, evidence_text: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 space-y-2">
              <label className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resolveForm.unlock_room}
                  onChange={(e) => setResolveForm((f) => ({ ...f, unlock_room: e.target.checked }))}
                />
                Desbloquear habitación automáticamente si estaba en mantenimiento
              </label>
              {resolveForm.unlock_room && (
                <select
                  value={resolveForm.next_room_status}
                  onChange={(e) => setResolveForm((f) => ({ ...f, next_room_status: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200"
                >
                  <option value="DISPONIBLE">Habilitar como DISPONIBLE</option>
                  <option value="PENDIENTE_LIMPIEZA">Enviar a PENDIENTE DE LIMPIEZA</option>
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolveTarget(null)}
                className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800"
              >
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl font-bold bg-emerald-600 text-white">
                Confirmar Resolución
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

