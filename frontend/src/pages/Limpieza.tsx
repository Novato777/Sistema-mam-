import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  ShieldCheck,
  UserCheck,
  Plus,
  RefreshCw,
  Wrench,
  Smartphone,
  Monitor,
  BedDouble,
  Search,
  CheckSquare,
  XCircle,
  Camera,
  PackageSearch,
  CalendarClock,
  Users,
  Wand2
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';

async function apiRequest(method: string, path: string, body?: any) {
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

interface ChecklistState {
  camas_tendidas: boolean;
  bano_desinfectado: boolean;
  toallas_repuestas: boolean;
  amenidades_repuestas: boolean;
  pisos_limpios: boolean;
  minibar_revisado: boolean;
  papelera_vaciada: boolean;
  ventilacion_olores: boolean;
}

const DEFAULT_CHECKLIST: ChecklistState = {
  camas_tendidas: false,
  bano_desinfectado: false,
  toallas_repuestas: false,
  amenidades_repuestas: false,
  pisos_limpios: false,
  minibar_revisado: false,
  papelera_vaciada: false,
  ventilacion_olores: false
};

const CHECKLIST_LABELS: { key: keyof ChecklistState; label: string }[] = [
  { key: 'camas_tendidas', label: 'Tendido de camas y cambio de lencería limpia' },
  { key: 'bano_desinfectado', label: 'Lavado y desinfección completa de baño y ducha' },
  { key: 'toallas_repuestas', label: 'Reposición de juego completo de toallas' },
  { key: 'amenidades_repuestas', label: 'Reposición de jabón, shampoo, papel y amenidades' },
  { key: 'pisos_limpios', label: 'Barrido, aspirado y trapeado de pisos y superficies' },
  { key: 'minibar_revisado', label: 'Verificación de minibar, vasos y cafetera' },
  { key: 'papelera_vaciada', label: 'Vaciado de papeleras y bolsas nuevas' },
  { key: 'ventilacion_olores', label: 'Ventilación, aromatización y luces verificadas' }
];

const TASK_TYPE_LABELS: Record<string, string> = {
  ASEO_SALIDA: 'Aseo de Salida (Check-out)',
  ASEO_DIARIO: 'Aseo Diario (Huésped Alojado)',
  ASEO_PROFUNDO: 'Aseo Profundo / Desinfección',
  RETOQUE_TURNDOWN: 'Retoque / Apertura Nocturna',
  INSPECCION_RUTINA: 'Inspección de Rutina'
};

const PRIORITY_BADGE: Record<string, string> = {
  URGENTE: 'bg-rose-100 text-rose-800 border-rose-300',
  ALTA: 'bg-amber-100 text-amber-800 border-amber-300',
  NORMAL: 'bg-sky-100 text-sky-800 border-sky-300',
  BAJA: 'bg-slate-100 text-slate-700 border-slate-300'
};

const TASK_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDIENTE: {
    label: 'Pendiente de Aseo',
    cls: 'bg-amber-100 text-amber-800 border-amber-300'
  },
  EN_PROCESO: {
    label: 'En Limpieza',
    cls: 'bg-sky-100 text-sky-800 border-sky-300'
  },
  INSPECCION_PENDIENTE: {
    label: 'Inspección Pendiente',
    cls: 'bg-purple-100 text-purple-800 border-purple-300'
  },
  COMPLETADA: {
    label: 'Completada',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300'
  },
  APROBADA: {
    label: 'Inspeccionada y Lista',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300'
  }
};

const ROOM_STATUS_STYLE: Record<string, { label: string; bg: string; badge: string }> = {
  PENDIENTE_LIMPIEZA: {
    label: 'Pendiente Limpieza',
    bg: 'border-amber-300 bg-amber-50/70',
    badge: 'bg-amber-500 text-white'
  },
  EN_LIMPIEZA: {
    label: 'En Limpieza',
    bg: 'border-sky-300 bg-sky-50/70',
    badge: 'bg-sky-600 text-white'
  },
  INSPECCION_PENDIENTE: {
    label: 'Inspección Pendiente',
    bg: 'border-purple-300 bg-purple-50/70',
    badge: 'bg-purple-600 text-white'
  },
  LIMPIA: {
    label: 'Limpia',
    bg: 'border-teal-300 bg-teal-50/70',
    badge: 'bg-teal-600 text-white'
  },
  DISPONIBLE: {
    label: 'Disponible',
    bg: 'border-emerald-300 bg-emerald-50/60',
    badge: 'bg-emerald-600 text-white'
  },
  OCUPADA: {
    label: 'Ocupada',
    bg: 'border-blue-300 bg-blue-50/60',
    badge: 'bg-blue-600 text-white'
  },
  RESERVADA: {
    label: 'Reservada',
    bg: 'border-indigo-300 bg-indigo-50/60',
    badge: 'bg-indigo-600 text-white'
  },
  MANTENIMIENTO: {
    label: 'En Mantenimiento',
    bg: 'border-orange-300 bg-orange-50/70',
    badge: 'bg-orange-600 text-white'
  },
  FUERA_DE_SERVICIO: {
    label: 'Fuera de Servicio',
    bg: 'border-rose-300 bg-rose-50/70',
    badge: 'bg-rose-600 text-white'
  }
};

export const Limpieza: React.FC = () => {
  const { activeHotel, user, hasPermission } = useHotel();

  const canOperate = hasPermission('housekeeping.operate') || hasPermission('housekeeping.inspect');
  const canInspect = hasPermission('housekeeping.inspect') || hasPermission('rooms.manage');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Modo móvil rápido para camareras (se activa por defecto en pantallas pequeñas o si el rol es LIMPIEZA)
  const [mobileMode, setMobileMode] = useState<boolean>(
    () => window.innerWidth < 768 || user?.role === 'LIMPIEZA'
  );
  const [activeTab, setActiveTab] = useState<'tasks' | 'rooms' | 'staff' | 'damages'>('tasks');

  // Datos del servidor
  const [kpis, setKpis] = useState<any>({});
  const [rooms, setRooms] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [damageReports, setDamageReports] = useState<any[]>([]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVOS');
  const [assignedFilter, setAssignedFilter] = useState<string>('TODOS');
  const [typeFilter, setTypeFilter] = useState('TODOS');
  const [onlyMyTasksMobile, setOnlyMyTasksMobile] = useState(false);

  // Modal Nueva Tarea
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    room_id: '',
    task_type: 'ASEO_SALIDA',
    priority: 'ALTA',
    assigned_to: '',
    notes: '',
    mark_room_pending: true
  });

  // Modal Finalizar Limpieza con Checklist y Evidencias
  const [completeModalTask, setCompleteModalTask] = useState<any | null>(null);
  const [checklistForm, setChecklistForm] = useState<ChecklistState>(DEFAULT_CHECKLIST);
  const [completeNotes, setCompleteNotes] = useState('');
  const [lostAndFound, setLostAndFound] = useState('');
  const [evidenceInput, setEvidenceInput] = useState('');
  const [evidenceList, setEvidenceList] = useState<string[]>([]);
  const [requireInspectionToggle, setRequireInspectionToggle] = useState(true);

  // Modal Inspección y Liberación
  const [inspectModalTask, setInspectModalTask] = useState<any | null>(null);
  const [inspectApproved, setInspectApproved] = useState(true);
  const [inspectNotes, setInspectNotes] = useState('');
  const [inspectTargetStatus, setInspectTargetStatus] = useState<'DISPONIBLE' | 'LIMPIA'>(
    'DISPONIBLE'
  );

  // Modal Reporte de Daño / Faltante hacia Mantenimiento
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [damageForm, setDamageForm] = useState({
    room_id: '',
    housekeeping_task_id: '',
    category: 'Plomería / Baño',
    priority: 'ALTA',
    title: '',
    description: '',
    block_room: false,
    block_status: 'MANTENIMIENTO',
    estimated_cost: ''
  });

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const fetchOverview = async () => {
    if (!activeHotel) return;
    try {
      setLoading(true);
      const data = await apiRequest('GET', `/hotels/${activeHotel.id}/housekeeping/overview`);
      setKpis(data.kpis || {});
      setRooms(data.rooms || []);
      setTasks(data.tasks || []);
      setStaff(data.staff || []);
      setDamageReports(data.damage_reports || []);
    } catch (err: any) {
      showToast('error', err.message || 'Error al cargar el tablero de limpieza.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [activeHotel?.id]);

  // Tareas filtradas
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (mobileMode && onlyMyTasksMobile && user?.id) {
        if (Number(t.assigned_to) !== Number(user.id)) return false;
      }
      if (statusFilter === 'ACTIVOS') {
        if (!['PENDIENTE', 'EN_PROCESO', 'INSPECCION_PENDIENTE'].includes(t.status)) return false;
      } else if (statusFilter !== 'TODOS' && t.status !== statusFilter) {
        return false;
      }
      if (assignedFilter === 'SIN_ASIGNAR' && t.assigned_to) return false;
      if (
        assignedFilter !== 'TODOS' &&
        assignedFilter !== 'SIN_ASIGNAR' &&
        Number(t.assigned_to) !== Number(assignedFilter)
      ) {
        return false;
      }
      if (typeFilter !== 'TODOS' && t.task_type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRoom = String(t.room_number || '')
          .toLowerCase()
          .includes(q);
        const matchStaff = String(t.assigned_to_name || '')
          .toLowerCase()
          .includes(q);
        const matchNotes = String(t.notes || '')
          .toLowerCase()
          .includes(q);
        if (!matchRoom && !matchStaff && !matchNotes) return false;
      }
      return true;
    });
  }, [
    tasks,
    mobileMode,
    onlyMyTasksMobile,
    user?.id,
    statusFilter,
    assignedFilter,
    typeFilter,
    searchQuery
  ]);

  // Crear tarea manual
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHotel || !newTaskForm.room_id) return;
    try {
      setSubmitting(true);
      const res = await apiRequest('POST', `/hotels/${activeHotel.id}/housekeeping/tasks`, {
        room_id: Number(newTaskForm.room_id),
        task_type: newTaskForm.task_type,
        priority: newTaskForm.priority,
        assigned_to: newTaskForm.assigned_to ? Number(newTaskForm.assigned_to) : null,
        notes: newTaskForm.notes,
        mark_room_pending: newTaskForm.mark_room_pending
      });
      showToast('success', res.message || 'Tarea de limpieza creada.');
      setShowNewTaskModal(false);
      setNewTaskForm({
        room_id: '',
        task_type: 'ASEO_SALIDA',
        priority: 'ALTA',
        assigned_to: '',
        notes: '',
        mark_room_pending: true
      });
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'No se pudo crear la tarea.');
    } finally {
      setSubmitting(false);
    }
  };

  // Generar Plan Diario Automático
  const handleGenerateDailyPlan = async () => {
    if (!activeHotel) return;
    try {
      setSubmitting(true);
      const res = await apiRequest('POST', `/hotels/${activeHotel.id}/housekeeping/tasks/generate-daily`, {
        auto_assign: true
      });
      showToast('success', res.message || 'Plan diario generado.');
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'Error al generar el plan diario.');
    } finally {
      setSubmitting(false);
    }
  };

  // Asignar camarera o prioridad en línea
  const handleQuickAssign = async (taskId: number, assignedTo: string, priority?: string) => {
    if (!activeHotel) return;
    try {
      await apiRequest('PUT', `/hotels/${activeHotel.id}/housekeeping/tasks/${taskId}/assign`, {
        assigned_to: assignedTo === '' ? null : Number(assignedTo),
        ...(priority ? { priority } : {})
      });
      showToast('success', 'Asignación actualizada.');
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'Error al asignar personal.');
    }
  };

  // Iniciar Limpieza (1-clic)
  const handleStartCleaning = async (task: any) => {
    if (!activeHotel) return;
    try {
      setSubmitting(true);
      const res = await apiRequest('POST', `/hotels/${activeHotel.id}/housekeeping/tasks/${task.id}/start`, {});
      showToast('success', res.message || `Limpieza iniciada en Habitación ${task.room_number}.`);
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'No se pudo iniciar la limpieza.');
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal para Finalizar Limpieza
  const openCompleteModal = (task: any) => {
    setCompleteModalTask(task);
    setChecklistForm({
      ...DEFAULT_CHECKLIST,
      ...(task.checklist || {})
    });
    setCompleteNotes(task.notes || '');
    setLostAndFound(task.lost_and_found || '');
    setEvidenceList(Array.isArray(task.evidence) ? task.evidence : []);
    setEvidenceInput('');
    setRequireInspectionToggle(true);
  };

  const handleCompleteCleaning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHotel || !completeModalTask) return;
    try {
      setSubmitting(true);
      const res = await apiRequest(
        'POST',
        `/hotels/${activeHotel.id}/housekeeping/tasks/${completeModalTask.id}/complete`,
        {
          checklist: checklistForm,
          evidence: evidenceList,
          notes: completeNotes,
          lost_and_found: lostAndFound,
          require_inspection: requireInspectionToggle
        }
      );
      showToast('success', res.message || 'Limpieza finalizada.');
      setCompleteModalTask(null);
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'Error al finalizar la limpieza.');
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal de Inspección
  const openInspectModal = (task: any) => {
    setInspectModalTask(task);
    setInspectApproved(true);
    setInspectNotes(task.inspection_notes || '');
    setInspectTargetStatus('DISPONIBLE');
  };

  const handleInspectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHotel || !inspectModalTask) return;
    try {
      setSubmitting(true);
      const res = await apiRequest(
        'POST',
        `/hotels/${activeHotel.id}/housekeeping/tasks/${inspectModalTask.id}/inspect`,
        {
          approved: inspectApproved,
          inspection_notes: inspectNotes,
          target_room_status: inspectTargetStatus
        }
      );
      showToast('success', res.message || 'Inspección procesada.');
      setInspectModalTask(null);
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'Error al registrar la inspección.');
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal de Reporte de Daño / Faltante
  const openDamageModalFor = (roomId?: number, taskId?: number) => {
    setDamageForm({
      room_id: roomId ? String(roomId) : '',
      housekeeping_task_id: taskId ? String(taskId) : '',
      category: 'Plomería / Baño',
      priority: 'ALTA',
      title: '',
      description: '',
      block_room: false,
      block_status: 'MANTENIMIENTO',
      estimated_cost: ''
    });
    setShowDamageModal(true);
  };

  const handleReportDamageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHotel || !damageForm.room_id || !damageForm.title.trim()) return;
    try {
      setSubmitting(true);
      const res = await apiRequest('POST', `/hotels/${activeHotel.id}/housekeeping/report-damage`, {
        room_id: Number(damageForm.room_id),
        housekeeping_task_id: damageForm.housekeeping_task_id
          ? Number(damageForm.housekeeping_task_id)
          : null,
        category: damageForm.category,
        priority: damageForm.priority,
        title: damageForm.title,
        description: damageForm.description,
        block_room: damageForm.block_room,
        block_status: damageForm.block_status,
        estimated_cost: Number(damageForm.estimated_cost || 0)
      });
      showToast('success', res.message || 'Daño reportado a Mantenimiento.');
      setShowDamageModal(false);
      fetchOverview();
    } catch (err: any) {
      showToast('error', err.message || 'Error al reportar daño.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAllChecklist = (val: boolean) => {
    setChecklistForm({
      camas_tendidas: val,
      bano_desinfectado: val,
      toallas_repuestas: val,
      amenidades_repuestas: val,
      pisos_limpios: val,
      minibar_revisado: val,
      papelera_vaciada: val,
      ventilacion_olores: val
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Banner de retroalimentación */}
      {feedback && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border text-sm font-medium transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-900 text-white border-rose-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Encabezado Principal + Selector Modo Móvil Camarera vs. Supervisión */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-teal-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Módulo 6 — Gobernanta, Aseo y Confort</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Limpieza y Housekeeping — {activeHotel?.name}
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              Control en tiempo real de habitaciones pendientes, asignación de camareras, tiempos de
              aseo, inspección de calidad y reporte directo de daños a Mantenimiento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Conmutador de Interfaz Móvil Simplificada vs Escritorio */}
            <button
              type="button"
              onClick={() => setMobileMode((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                mobileMode
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                  : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {mobileMode ? (
                <>
                  <Monitor className="w-4 h-4" />
                  <span>Cambiar a Vista Supervisión</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4 text-teal-400" />
                  <span>Modo Móvil Camarera (1-Toque)</span>
                </>
              )}
            </button>

            {canOperate && (
              <>
                <button
                  type="button"
                  onClick={handleGenerateDailyPlan}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow transition-all disabled:opacity-50"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>Generar Plan Diario</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Tarea</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDamageModalFor()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow transition-all"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Reportar Daño</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={fetchOverview}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title="Actualizar tablero"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tarjetas KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
          <div className="bg-slate-800/80 border border-amber-500/30 rounded-xl p-3.5">
            <div className="text-xs text-amber-300 font-medium">Pendientes de Aseo</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {kpis.rooms_pending_cleaning ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis.tasks_pending ?? 0} tareas en cola
            </div>
          </div>

          <div className="bg-slate-800/80 border border-sky-500/30 rounded-xl p-3.5">
            <div className="text-xs text-sky-300 font-medium">En Limpieza Ahora</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {kpis.rooms_in_cleaning ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis.tasks_in_progress ?? 0} tareas en curso
            </div>
          </div>

          <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-3.5">
            <div className="text-xs text-purple-300 font-medium">Por Inspeccionar</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {kpis.rooms_pending_inspection ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis.tasks_pending_inspection ?? 0} listas para revisión
            </div>
          </div>

          <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-3.5">
            <div className="text-xs text-emerald-300 font-medium">Limpias y Disponibles</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {kpis.rooms_clean_ready ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Habilitadas para Check-in</div>
          </div>

          <div className="bg-slate-800/80 border border-teal-500/30 rounded-xl p-3.5">
            <div className="text-xs text-teal-300 font-medium">Aseos Terminados Hoy</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {kpis.tasks_completed_today ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Promedio: {kpis.avg_cleaning_minutes ?? 0} min/hab
            </div>
          </div>

          <div className="bg-slate-800/80 border border-rose-500/30 rounded-xl p-3.5">
            <div className="text-xs text-rose-300 font-medium">Daños / Mantenimiento</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {kpis.open_damage_reports ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis.rooms_blocked_maintenance ?? 0} hab. bloqueadas
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODO MÓVIL CAMARERA (INTERFAZ RÁPIDA DE 1-TOQUE PARA CELULAR)         */}
      {/* ===================================================================== */}
      {mobileMode ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Modo Móvil Rápido para Personal de Limpieza
                </h2>
                <p className="text-xs text-slate-600">
                  Botones grandes de un solo toque para iniciar aseo, marcar checklist y reportar
                  novedades desde el celular.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyMyTasksMobile((v) => !v)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  onlyMyTasksMobile
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {onlyMyTasksMobile ? 'Viendo: Mis Tareas' : 'Viendo: Todas las Habitaciones'}
              </button>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 bg-white text-slate-800"
              >
                <option value="ACTIVOS">Pendientes / En curso</option>
                <option value="PENDIENTE">Solo Pendientes</option>
                <option value="EN_PROCESO">En Limpieza</option>
                <option value="INSPECCION_PENDIENTE">Por Inspeccionar</option>
                <option value="TODOS">Todas</option>
              </select>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <Sparkles className="w-12 h-12 text-teal-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800">
                ¡No hay tareas pendientes con este filtro!
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Todas las habitaciones asignadas están al día o puedes pulsar &ldquo;Generar Plan
                Diario&rdquo; para cargar los aseos del turno.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTasks.map((t) => {
                const stBadge = TASK_STATUS_BADGE[t.status] || {
                  label: t.status,
                  cls: 'bg-slate-100 text-slate-700'
                };
                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center shrink-0">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">
                              Hab.
                            </span>
                            <span className="text-2xl font-black leading-none">
                              {t.room_number}
                            </span>
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${stBadge.cls}`}
                              >
                                {stBadge.label}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.NORMAL
                                }`}
                              >
                                {t.priority}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-slate-900 mt-1">
                              {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                            </div>
                            <div className="text-xs text-slate-500">
                              Piso {t.room_floor || '1'} • {t.room_type_name || 'Estándar'} •
                              Responsable:{' '}
                              <strong className="text-slate-700">
                                {t.assigned_to_name || 'Sin asignar'}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {t.urgent_arrival && (
                        <div className="mt-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-800 font-semibold">
                          <CalendarClock className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>
                            ¡URGENTE! Llegada prevista hoy ({t.urgent_arrival.check_in_time || '15:00'}
                            ) — Huésped: {t.urgent_arrival.first_name}{' '}
                            {t.urgent_arrival.last_name || ''}
                          </span>
                        </div>
                      )}

                      {t.notes && (
                        <p className="mt-2.5 text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                          <strong>Nota:</strong> {t.notes}
                        </p>
                      )}

                      {t.inspection_notes && (
                        <p className="mt-2 text-xs text-purple-900 bg-purple-50 rounded-xl p-2.5 border border-purple-200">
                          <strong>Observación de Inspección:</strong> {t.inspection_notes}
                        </p>
                      )}
                    </div>

                    {/* Botones táctiles de 1 toque */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                      {t.status === 'PENDIENTE' && canOperate && (
                        <button
                          type="button"
                          onClick={() => handleStartCleaning(t)}
                          disabled={submitting}
                          className="col-span-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          <span>INICIAR LIMPIEZA AHORA</span>
                        </button>
                      )}

                      {t.status === 'EN_PROCESO' && canOperate && (
                        <button
                          type="button"
                          onClick={() => openCompleteModal(t)}
                          className="col-span-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
                        >
                          <CheckSquare className="w-5 h-5" />
                          <span>CHECKLIST Y TERMINAR ASEO</span>
                        </button>
                      )}

                      {t.status === 'INSPECCION_PENDIENTE' && canInspect && (
                        <button
                          type="button"
                          onClick={() => openInspectModal(t)}
                          className="col-span-full py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
                        >
                          <ShieldCheck className="w-5 h-5" />
                          <span>INSPECCIONAR Y HABILITAR HABITACIÓN</span>
                        </button>
                      )}

                      {canOperate && (
                        <button
                          type="button"
                          onClick={() => openDamageModalFor(t.room_id, t.id)}
                          className="col-span-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-2"
                        >
                          <Wrench className="w-4 h-4" />
                          <span>Reportar Daño o Faltante en Hab. {t.room_number}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ===================================================================== */
        /* MODO SUPERVISIÓN Y GESTIÓN COMPLETA (ESCRITORIO / TABLET)             */
        /* ===================================================================== */
        <div className="space-y-5">
          {/* Pestañas de Navegación */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'tasks'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>1. Cola de Tareas e Inspección ({tasks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'rooms'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <BedDouble className="w-4 h-4" />
              <span>2. Mapa Visual de Habitaciones ({rooms.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'staff'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>3. Personal y Tiempos de Aseo ({staff.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('damages')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'damages'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>4. Daños Reportados y Objetos Olvidados ({damageReports.length})</span>
            </button>
          </div>

          {/* PESTAÑA 1: COLA DE TAREAS E INSPECCIÓN */}
          {activeTab === 'tasks' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Barra de filtros */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por número de habitación, camarera o nota..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value="ACTIVOS">Activas (Pendientes / En Curso / Inspección)</option>
                    <option value="PENDIENTE">Pendientes de Iniciar</option>
                    <option value="EN_PROCESO">En Limpieza</option>
                    <option value="INSPECCION_PENDIENTE">Inspección Pendiente</option>
                    <option value="APROBADA">Inspeccionadas y Aprobadas</option>
                    <option value="TODOS">Todo el Historial</option>
                  </select>

                  <select
                    value={assignedFilter}
                    onChange={(e) => setAssignedFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value="TODOS">Todo el Personal</option>
                    <option value="SIN_ASIGNAR">Sin Asignar</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.effective_role})
                      </option>
                    ))}
                  </select>

                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value="TODOS">Todos los Tipos</option>
                    {Object.entries(TASK_TYPE_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabla de Tareas */}
              <div className="table-scroll">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Habitación</th>
                      <th className="py-3 px-4">Tipo y Prioridad</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4">Personal Asignado</th>
                      <th className="py-3 px-4">Tiempos / Checklist</th>
                      <th className="py-3 px-4">Observaciones / Alertas</th>
                      <th className="py-3 px-4 text-right">Acciones Operativas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          No se encontraron tareas de limpieza con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredTasks.map((t) => {
                        const badge = TASK_STATUS_BADGE[t.status] || {
                          label: t.status,
                          cls: 'bg-slate-100 text-slate-700'
                        };
                        const checkedCount = Object.values(t.checklist || {}).filter(Boolean)
                          .length;
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-black text-sm">
                                  {t.room_number}
                                </span>
                                <div>
                                  <div className="font-semibold text-slate-800">
                                    Piso {t.room_floor || '1'}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {t.room_type_name || 'Estándar'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-800">
                                {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                              </div>
                              <div className="mt-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                    PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.NORMAL
                                  }`}
                                >
                                  Prioridad {t.priority}
                                </span>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              <div className="text-[11px] text-slate-500 mt-1">
                                Habitación: <strong>{t.room_status}</strong>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              {canOperate &&
                              ['PENDIENTE', 'EN_PROCESO'].includes(t.status) ? (
                                <select
                                  value={t.assigned_to || ''}
                                  onChange={(e) => handleQuickAssign(t.id, e.target.value)}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800"
                                >
                                  <option value="">-- Sin asignar --</option>
                                  {staff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.full_name} ({s.effective_role})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                                  <span>{t.assigned_to_name || 'Sin asignar'}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="space-y-0.5 text-[11px] text-slate-600">
                                {t.started_at ? (
                                  <div>
                                    <strong>Inicio:</strong>{' '}
                                    {new Date(t.started_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-slate-400">Sin iniciar</div>
                                )}
                                {t.completed_at && (
                                  <div>
                                    <strong>Fin:</strong>{' '}
                                    {new Date(t.completed_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}{' '}
                                    ({t.duration_minutes} min)
                                  </div>
                                )}
                                <div className="text-teal-700 font-semibold">
                                  Checklist: {checkedCount}/8 puntos
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 max-w-xs">
                              {t.urgent_arrival && (
                                <div className="mb-1 px-2 py-1 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-bold">
                                  ¡Check-in hoy ({t.urgent_arrival.check_in_time || '15:00'})!
                                </div>
                              )}
                              {t.notes && <div className="text-slate-700">{t.notes}</div>}
                              {t.lost_and_found && (
                                <div className="text-amber-800 font-semibold mt-0.5">
                                  Objeto olvidado: {t.lost_and_found}
                                </div>
                              )}
                              {t.issues_reported && (
                                <div className="text-rose-700 font-semibold mt-0.5">
                                  Daño: {t.issues_reported}
                                </div>
                              )}
                              {t.inspection_notes && (
                                <div className="text-purple-800 mt-0.5">
                                  Inspección: {t.inspection_notes}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {t.status === 'PENDIENTE' && canOperate && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartCleaning(t)}
                                    className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] flex items-center gap-1"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Iniciar</span>
                                  </button>
                                )}

                                {(t.status === 'EN_PROCESO' || t.status === 'PENDIENTE') &&
                                  canOperate && (
                                    <button
                                      type="button"
                                      onClick={() => openCompleteModal(t)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1"
                                    >
                                      <CheckSquare className="w-3.5 h-3.5" />
                                      <span>Terminar</span>
                                    </button>
                                  )}

                                {t.status === 'INSPECCION_PENDIENTE' && canInspect && (
                                  <button
                                    type="button"
                                    onClick={() => openInspectModal(t)}
                                    className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>Inspeccionar</span>
                                  </button>
                                )}

                                {canOperate && (
                                  <button
                                    type="button"
                                    onClick={() => openDamageModalFor(t.room_id, t.id)}
                                    className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-[11px]"
                                    title="Reportar daño o faltante a Mantenimiento"
                                  >
                                    <Wrench className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: MAPA VISUAL DE HABITACIONES PARA HOUSEKEEPING */}
          {activeTab === 'rooms' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {rooms.map((r) => {
                const st = ROOM_STATUS_STYLE[r.status] || {
                  label: r.status,
                  bg: 'border-slate-200 bg-white',
                  badge: 'bg-slate-700 text-white'
                };
                return (
                  <div
                    key={r.id}
                    className={`rounded-2xl border-2 p-4 shadow-xs flex flex-col justify-between gap-3 ${st.bg}`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black text-slate-900">
                            Hab. {r.number}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            Piso {r.floor || '1'}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${st.badge}`}
                        >
                          {st.label}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 mt-1">
                        {r.room_type_name || 'Estándar'} • {r.bed_config || r.default_bed_config}
                      </div>

                      {r.guest_full_name && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-white/80 border border-blue-200 text-xs text-blue-900">
                          <strong>Huésped alojado:</strong> {r.guest_full_name}
                        </div>
                      )}

                      {r.urgent_arrival && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-rose-100 border border-rose-300 text-xs text-rose-900 font-bold">
                          ¡Llegada hoy ({r.urgent_arrival.check_in_time || '15:00'})!
                        </div>
                      )}

                      {r.active_task && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-white/90 border border-slate-200 text-xs text-slate-700">
                          <div>
                            <strong>Tarea activa:</strong>{' '}
                            {TASK_TYPE_LABELS[r.active_task.task_type] || r.active_task.task_type}
                          </div>
                          <div>
                            <strong>Asignada a:</strong>{' '}
                            {r.active_task.assigned_to_name || 'Sin asignar'}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/70">
                      {!r.active_task && canOperate && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewTaskForm({
                              room_id: String(r.id),
                              task_type:
                                r.status === 'OCUPADA' ? 'ASEO_DIARIO' : 'ASEO_SALIDA',
                              priority: r.urgent_arrival ? 'URGENTE' : 'ALTA',
                              assigned_to: '',
                              notes: '',
                              mark_room_pending: r.status !== 'OCUPADA'
                            });
                            setShowNewTaskModal(true);
                          }}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold text-center"
                        >
                          + Programar Aseo
                        </button>
                      )}

                      {r.active_task && r.active_task.status === 'PENDIENTE' && canOperate && (
                        <button
                          type="button"
                          onClick={() => handleStartCleaning(r.active_task)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold text-center"
                        >
                          ▶ Iniciar Aseo
                        </button>
                      )}

                      {r.active_task && r.active_task.status === 'EN_PROCESO' && canOperate && (
                        <button
                          type="button"
                          onClick={() => openCompleteModal(r.active_task)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center"
                        >
                          ✓ Terminar Aseo
                        </button>
                      )}

                      {r.active_task &&
                        r.active_task.status === 'INSPECCION_PENDIENTE' &&
                        canInspect && (
                          <button
                            type="button"
                            onClick={() => openInspectModal(r.active_task)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold text-center"
                          >
                            ★ Inspeccionar
                          </button>
                        )}

                      {canOperate && (
                        <button
                          type="button"
                          onClick={() => openDamageModalFor(r.id, r.active_task?.id)}
                          className="py-1.5 px-2.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold"
                          title="Reportar daño en esta habitación"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PESTAÑA 3: PERSONAL DE LIMPIEZA Y RENDIMIENTO */}
          {activeTab === 'staff' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 font-black text-lg flex items-center justify-center">
                      {String(member.full_name || 'U')
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{member.full_name}</h3>
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                        Rol: {member.effective_role}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                    <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100">
                      <div className="text-lg font-black text-amber-800">
                        {member.active_tasks_count}
                      </div>
                      <div className="text-[11px] text-amber-700 font-medium">Activas</div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                      <div className="text-lg font-black text-emerald-800">
                        {member.completed_today_count}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">Limpiadas Hoy</div>
                    </div>
                    <div className="bg-sky-50 rounded-xl p-2.5 border border-sky-100">
                      <div className="text-lg font-black text-sky-800">
                        {member.avg_minutes} min
                      </div>
                      <div className="text-[11px] text-sky-700 font-medium">Tiempo Prom.</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PESTAÑA 4: NOVEDADES, DAÑOS REPORTADOS A MANTENIMIENTO Y OBJETOS OLVIDADOS */}
          {activeTab === 'damages' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Daños, Desperfectos y Faltantes Reportados a Mantenimiento
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cada reporte queda vinculado al historial técnico de la habitación y al
                      módulo de Mantenimiento.
                    </p>
                  </div>
                  {canOperate && (
                    <button
                      type="button"
                      onClick={() => openDamageModalFor()}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Wrench className="w-4 h-4" />
                      <span>Nuevo Reporte de Daño</span>
                    </button>
                  )}
                </div>

                <div className="table-scroll">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 text-[11px] font-bold uppercase border-b border-slate-200">
                        <th className="py-3 px-4">Ticket</th>
                        <th className="py-3 px-4">Habitación</th>
                        <th className="py-3 px-4">Categoría / Prioridad</th>
                        <th className="py-3 px-4">Descripción del Daño o Faltante</th>
                        <th className="py-3 px-4">Bloqueo Operativo</th>
                        <th className="py-3 px-4">Reportado Por</th>
                        <th className="py-3 px-4">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {damageReports.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            No hay reportes de daños registrados.
                          </td>
                        </tr>
                      ) : (
                        damageReports.map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-bold text-slate-700">#{d.id}</td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold">
                                Hab. {d.room_number}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-800">{d.category}</div>
                              <span
                                className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  PRIORITY_BADGE[d.priority] || PRIORITY_BADGE.ALTA
                                }`}
                              >
                                {d.priority}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{d.title}</div>
                              {d.description && (
                                <div className="text-slate-600 mt-0.5">{d.description}</div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {Number(d.block_room) === 1 ? (
                                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[11px]">
                                  Bloqueada ({d.room_blocked_status || 'MANTENIMIENTO'})
                                </span>
                              ) : (
                                <span className="text-slate-500">Sin bloqueo</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <div>{d.reported_by_name || 'Personal'}</div>
                              <div className="text-[11px] text-slate-400">
                                {new Date(d.created_at).toLocaleString()}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                                {d.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Objetos Olvidados (Lost & Found) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <PackageSearch className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Registro de Objetos Olvidados por Huéspedes (Lost &amp; Found)
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tasks
                    .filter((t) => t.lost_and_found && String(t.lost_and_found).trim() !== '')
                    .map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-amber-950">
                          <span>Habitación {t.room_number}</span>
                          <span>Tarea #{t.id}</span>
                        </div>
                        <p className="text-amber-900 font-semibold">{t.lost_and_found}</p>
                        <div className="text-[11px] text-amber-700">
                          Reportado por: {t.assigned_to_name || 'Personal de limpieza'}
                        </div>
                      </div>
                    ))}
                  {tasks.filter((t) => t.lost_and_found && String(t.lost_and_found).trim() !== '')
                    .length === 0 && (
                    <div className="col-span-full text-xs text-slate-500 py-4 text-center">
                      No se han reportado objetos olvidados recientemente.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: CREAR NUEVA TAREA DE LIMPIEZA                                */}
      {/* ===================================================================== */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Programar Nueva Tarea de Limpieza
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Asigna una habitación, prioridad y responsable de housekeeping.
            </p>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Habitación *</label>
                <select
                  required
                  value={newTaskForm.room_id}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, room_id: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold"
                >
                  <option value="">-- Seleccionar Habitación --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Habitación {r.number} (Piso {r.floor || '1'} — Estado actual: {r.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Limpieza</label>
                  <select
                    value={newTaskForm.task_type}
                    onChange={(e) =>
                      setNewTaskForm({ ...newTaskForm, task_type: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
                  >
                    {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prioridad</label>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) =>
                      setNewTaskForm({ ...newTaskForm, priority: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="URGENTE">URGENTE (Check-in inmediato)</option>
                    <option value="ALTA">ALTA</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="BAJA">BAJA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Personal Responsable (Opcional)
                </label>
                <select
                  value={newTaskForm.assigned_to}
                  onChange={(e) =>
                    setNewTaskForm({ ...newTaskForm, assigned_to: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="">-- Sin asignar todavía --</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.effective_role} — {s.active_tasks_count} activas)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Instrucciones u Observaciones
                </label>
                <textarea
                  rows={2}
                  value={newTaskForm.notes}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, notes: e.target.value })}
                  placeholder="Ej: Huésped solicitó almohadas extra o cambio completo de plumón..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newTaskForm.mark_room_pending}
                  onChange={(e) =>
                    setNewTaskForm({ ...newTaskForm, mark_room_pending: e.target.checked })
                  }
                  className="rounded border-slate-300 text-teal-600"
                />
                <span className="text-slate-700 font-medium">
                  Cambiar estado de la habitación a PENDIENTE_LIMPIEZA (si no está ocupada)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow"
                >
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CHECKLIST DE CALIDAD, EVIDENCIAS Y FINALIZACIÓN DE ASEO      */}
      {/* ===================================================================== */}
      {completeModalTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Finalizar Aseo — Habitación {completeModalTask.room_number}
                </h3>
                <p className="text-xs text-slate-500">
                  Verifica los estándares de calidad, registra objetos olvidados y envía a
                  inspección.
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleAllChecklist(true)}
                className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold"
              >
                ✓ Marcar Todo
              </button>
            </div>

            <form onSubmit={handleCompleteCleaning} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {CHECKLIST_LABELS.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-teal-400"
                  >
                    <input
                      type="checkbox"
                      checked={checklistForm[item.key]}
                      onChange={(e) =>
                        setChecklistForm({
                          ...checklistForm,
                          [item.key]: e.target.checked
                        })
                      }
                      className="mt-0.5 rounded border-slate-300 text-teal-600"
                    />
                    <span className="text-slate-800 font-medium leading-snug">{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Objetos Olvidados (Lost &amp; Found)
                  </label>
                  <input
                    type="text"
                    value={lostAndFound}
                    onChange={(e) => setLostAndFound(e.target.value)}
                    placeholder="Ej: Cargador de celular en mesa de noche..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Observaciones de Limpieza
                  </label>
                  <input
                    type="text"
                    value={completeNotes}
                    onChange={(e) => setCompleteNotes(e.target.value)}
                    placeholder="Ej: Lencería cambiada al 100%, todo en orden"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* Evidencias Fotográficas / URLs */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Evidencias Fotográficas (URL o referencia de foto)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={evidenceInput}
                    onChange={(e) => setEvidenceInput(e.target.value)}
                    placeholder="Pegar enlace de foto o nota de evidencia..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (evidenceInput.trim()) {
                        setEvidenceList([...evidenceList, evidenceInput.trim()]);
                        setEvidenceInput('');
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-white font-bold flex items-center gap-1"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Adjuntar</span>
                  </button>
                </div>
                {evidenceList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {evidenceList.map((ev, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-[11px] flex items-center gap-1.5"
                      >
                        <span>{ev}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEvidenceList(evidenceList.filter((_, i) => i !== idx))
                          }
                          className="text-rose-600 font-bold"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {canInspect && (
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-50 border border-purple-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!requireInspectionToggle}
                    onChange={(e) => setRequireInspectionToggle(!e.target.checked)}
                    className="rounded border-purple-300 text-purple-600"
                  />
                  <span className="text-purple-900 font-bold">
                    Aprobar inspección directamente y habilitar habitación como DISPONIBLE ahora
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCompleteModalTask(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow"
                >
                  Confirmar Aseo Terminado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: INSPECCIÓN Y HABILITACIÓN A ESTADO DISPONIBLE                */}
      {/* ===================================================================== */}
      {inspectModalTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Inspección de Calidad — Habitación {inspectModalTask.room_number}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Realizado por: <strong>{inspectModalTask.assigned_to_name || 'Personal'}</strong> •
              Duración registrada: <strong>{inspectModalTask.duration_minutes || 1} min</strong>
            </p>

            <form onSubmit={handleInspectSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setInspectApproved(true)}
                  className={`p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 ${
                    inspectApproved
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>APROBAR Y HABILITAR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInspectApproved(false)}
                  className={`p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 ${
                    !inspectApproved
                      ? 'border-rose-600 bg-rose-50 text-rose-900'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <XCircle className="w-5 h-5 text-rose-600" />
                  <span>RECHAZAR (RE-LIMPIAR)</span>
                </button>
              </div>

              {inspectApproved && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Estado Destino de la Habitación al Aprobar
                  </label>
                  <select
                    value={inspectTargetStatus}
                    onChange={(e) =>
                      setInspectTargetStatus(e.target.value as 'DISPONIBLE' | 'LIMPIA')
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="DISPONIBLE">
                      DISPONIBLE (Lista inmediatamente para Check-in en Recepción)
                    </option>
                    <option value="LIMPIA">LIMPIA (En reserva operativa)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {inspectApproved
                    ? 'Observaciones de Supervisión (Opcional)'
                    : 'Motivo de Rechazo / Corrección Requerida *'}
                </label>
                <textarea
                  rows={3}
                  required={!inspectApproved}
                  value={inspectNotes}
                  onChange={(e) => setInspectNotes(e.target.value)}
                  placeholder={
                    inspectApproved
                      ? 'Ej: Estándares impecables, habitación lista para venta.'
                      : 'Ej: Falta reponer toalla de manos y repasar espejo del baño.'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setInspectModalTask(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2.5 rounded-xl text-white font-bold shadow ${
                    inspectApproved
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {inspectApproved ? 'Aprobar y Habilitar Habitación' : 'Devolver a Limpieza'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: REPORTAR DAÑO O FALTANTE DIRECTO A MANTENIMIENTO             */}
      {/* ===================================================================== */}
      {showDamageModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-rose-600 mb-1">
              <Wrench className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900">
                Reportar Daño o Faltante a Mantenimiento
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Genera una orden en Mantenimiento y actualiza el historial técnico de la habitación.
            </p>

            <form onSubmit={handleReportDamageSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Habitación *</label>
                  <select
                    required
                    value={damageForm.room_id}
                    onChange={(e) => setDamageForm({ ...damageForm, room_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="">-- Seleccionar --</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Habitación {r.number} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría Técnica</label>
                  <select
                    value={damageForm.category}
                    onChange={(e) => setDamageForm({ ...damageForm, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Plomería / Baño">Plomería / Baño / Fuga</option>
                    <option value="Electricidad / Iluminación">Electricidad / Iluminación</option>
                    <option value="Aire Acondicionado / Clima">Aire Acondicionado / Clima</option>
                    <option value="TV / Electrodomésticos">TV / Wi-Fi / Electrodomésticos</option>
                    <option value="Cerradura / Puerta / Ventana">
                      Cerradura / Puerta / Ventana
                    </option>
                    <option value="Lencería / Colchón / Faltante">
                      Lencería / Toallas / Faltante en Habitación
                    </option>
                    <option value="Mobiliario / Pintura">Mobiliario / Pintura</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prioridad</label>
                  <select
                    value={damageForm.priority}
                    onChange={(e) => setDamageForm({ ...damageForm, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="URGENTE">URGENTE (Impide alojar huésped)</option>
                    <option value="ALTA">ALTA</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="BAJA">BAJA</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Costo Estimado Reparación (Opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={damageForm.estimated_cost}
                    onChange={(e) =>
                      setDamageForm({ ...damageForm, estimated_cost: e.target.value })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Título Corto del Daño o Faltante *
                </label>
                <input
                  type="text"
                  required
                  value={damageForm.title}
                  onChange={(e) => setDamageForm({ ...damageForm, title: e.target.value })}
                  placeholder="Ej: Ducha con goteo constante / Control remoto de TV faltante"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Detalle de la Novedad Encontrada
                </label>
                <textarea
                  rows={2}
                  value={damageForm.description}
                  onChange={(e) => setDamageForm({ ...damageForm, description: e.target.value })}
                  placeholder="Describe qué se encontró durante la limpieza..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={damageForm.block_room}
                    onChange={(e) =>
                      setDamageForm({ ...damageForm, block_room: e.target.checked })
                    }
                    className="rounded border-rose-300 text-rose-600"
                  />
                  <span className="font-bold text-rose-900">
                    Bloquear operativamente la habitación hasta solucionar el daño
                  </span>
                </label>

                {damageForm.block_room && (
                  <select
                    value={damageForm.block_status}
                    onChange={(e) =>
                      setDamageForm({ ...damageForm, block_status: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-rose-300 bg-white font-semibold text-rose-900"
                  >
                    <option value="MANTENIMIENTO">Pasar habitación a EN MANTENIMIENTO</option>
                    <option value="FUERA_DE_SERVICIO">Pasar habitación a FUERA DE SERVICIO</option>
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDamageModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow"
                >
                  Registrar y Enviar a Mantenimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Limpieza;
