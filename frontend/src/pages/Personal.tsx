import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  CalendarClock,
  Plus,
  Edit3,
  Trash2,
  Phone,
  Activity,
  UserPlus,
  ChevronDown,
  Power,
  KeyRound
} from 'lucide-react';
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
  EmptyText,
  EmptyState,
  Panel,
  StatCard,
  SECTION,
  SECTION_HEAD,
  SOLID,
  flat,
  HEAD_BTN,
  ModuleHeader
} from '../components/ModuleUI';
import type { Tone } from '../components/ModuleUI';

/* =========================================================================
   API Y UTILIDADES
========================================================================= */

async function apiRequest(method: string, path: string, body?: unknown, hotelId?: number | null) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(hotelId ? { 'X-Hotel-Id': String(hotelId) } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error HTTP ${res.status}`);
  return data;
}

/** Fecha en Colombia desplazada N días. */
const shiftDate = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
};

const prettyDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** Sugiere un usuario de acceso a partir del nombre: "María Pérez" → "maria.perez". */
const suggestUsername = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.')
    .replace(/[^a-z0-9.]/g, '');

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/* =========================================================================
   TIPOS Y CATÁLOGOS
========================================================================= */

interface StaffMember {
  id: number;
  username: string;
  full_name: string;
  document: string;
  position: string;
  email: string;
  phone: string;
  role: string;
  active: number;
  employee_code: string | null;
  department: string | null;
  contract_type: string | null;
  hire_date: string | null;
  base_salary: number;
  eps: string | null;
  arl: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  shift_preference: string | null;
  profile_notes: string | null;
  metrics: {
    cleanings_completed: number;
    maintenance_resolved: number;
    pos_orders_count: number;
    cash_shifts_count: number;
    shifts_completed: number;
  };
}

interface StaffShift {
  id: number;
  user_id: number;
  employee_name: string;
  role: string;
  shift_date: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  department: string;
  status: string;
  notes: string;
}

interface EmployeeActivity {
  employee: { id: number; full_name: string };
  housekeeping_tasks: { id: number; room_number: string; task_type: string; status: string; scheduled_date: string }[];
  maintenance_tickets: { id: number; room_number: string; title: string; status: string }[];
  audit_logs: { id: number; module: string; details: string; date: string }[];
}

/** Lo que hace cada persona. "dept" es el área de su ficha laboral. */
const JOBS = [
  { role: 'RECEPCIONISTA', emoji: '🛎️', label: 'Recepción', dept: 'RECEPCION' },
  { role: 'CAJERO', emoji: '💵', label: 'Caja', dept: 'RECEPCION' },
  { role: 'LIMPIEZA', emoji: '🧹', label: 'Limpieza', dept: 'LIMPIEZA' },
  { role: 'RESTAURANTE', emoji: '🍽️', label: 'Cocina / Servicios', dept: 'RESTAURANTE' },
  { role: 'MANTENIMIENTO', emoji: '🔧', label: 'Mantenimiento', dept: 'MANTENIMIENTO' },
  { role: 'ADMINISTRADOR', emoji: '🗂️', label: 'Administrador', dept: 'ADMINISTRACION' }
];
const jobOf = (role: string) =>
  role === 'PROPIETARIO' || role === 'ADMIN'
    ? { role, emoji: '👑', label: 'Dueño', dept: 'ADMINISTRACION' }
    : JOBS.find((j) => j.role === role) || { role, emoji: '👤', label: role, dept: 'RECEPCION' };

/** Turnos con horario ya definido: el usuario solo elige uno. */
const SHIFTS = [
  { id: 'MAÑANA', emoji: '☀️', label: 'Mañana', start: '06:00', end: '14:00' },
  { id: 'TARDE', emoji: '🌤️', label: 'Tarde', start: '14:00', end: '22:00' },
  { id: 'NOCHE', emoji: '🌙', label: 'Noche', start: '22:00', end: '06:00' },
  { id: 'COMPLETO', emoji: '📅', label: 'Todo el día', start: '08:00', end: '18:00' }
];
const shiftOf = (id: string) => SHIFTS.find((s) => s.id === id) || SHIFTS[0];

const SHIFT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PROGRAMADO: { label: 'Por llegar', tone: 'slate' },
  EN_TURNO: { label: 'Trabajando', tone: 'emerald' },
  COMPLETADO: { label: 'Terminó', tone: 'indigo' },
  AUSENTE: { label: 'No vino', tone: 'rose' }
};

type Tab = 'EQUIPO' | 'HORARIOS';
type Day = 'HOY' | 'MANANA' | 'FECHA';

/* =========================================================================
   PÁGINA
========================================================================= */

export default function Personal() {
  const { activeHotelId, activeHotel, hasPermission, user } = useHotel();
  const canManage = hasPermission('users.manage');
  const today = getTodayString();
  const base = `/hotels/${activeHotelId}/staff`;

  const [activeTab, setActiveTab] = useState<Tab>('EQUIPO');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  // Horarios
  const [day, setDay] = useState<Day>('HOY');
  const [customDate, setCustomDate] = useState(today);
  const selectedDate = day === 'HOY' ? today : day === 'MANANA' ? shiftDate(1) : customDate;

  // Agregar persona
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', role: 'RECEPCIONISTA', phone: '', username: '', password: '' });
  const [usernameTouched, setUsernameTouched] = useState(false);

  // Ficha de la persona
  const [profileTarget, setProfileTarget] = useState<StaffMember | null>(null);
  const [profileMore, setProfileMore] = useState(false);
  const [profileForm, setProfileForm] = useState({
    phone: '',
    emergency_contact: '',
    emergency_phone: '',
    base_salary: '',
    hire_date: today,
    contract_type: 'Término Indefinido',
    eps: '',
    arl: '',
    notes: ''
  });

  // Asignar turno
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ user_id: '', shift_name: 'MAÑANA', date: today });

  // Qué ha hecho / desactivar / borrar turno
  const [activity, setActivity] = useState<EmployeeActivity | null>(null);
  const [toggleTarget, setToggleTarget] = useState<StaffMember | null>(null);

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
      // Turnos de la última semana y del próximo mes
      const data = await apiRequest(
        'GET',
        `/hotels/${activeHotelId}/staff/overview?from_date=${shiftDate(-7)}&to_date=${shiftDate(31)}`
      );
      setStaff(data.staff || []);
      setShifts(data.shifts || []);
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo cargar el personal.');
    } finally {
      setLoading(false);
    }
  }, [activeHotelId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const activeStaff = useMemo(() => staff.filter((m) => Number(m.active) === 1), [staff]);
  const inactiveStaff = useMemo(() => staff.filter((m) => Number(m.active) !== 1), [staff]);
  const todayShiftOf = (userId: number) => shifts.find((s) => s.user_id === userId && s.shift_date === today);
  const dayShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.shift_date === selectedDate)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [shifts, selectedDate]
  );

  /* -------------------- Agregar persona -------------------- */

  const openAdd = () => {
    setAddForm({ full_name: '', role: 'RECEPCIONISTA', phone: '', username: '', password: '' });
    setUsernameTouched(false);
    setAddOpen(true);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const full_name = addForm.full_name.trim();
    const username = addForm.username.trim().toLowerCase();
    if (!full_name || !username) {
      show('error', 'Escribe el nombre y el usuario para entrar.');
      return;
    }
    if (addForm.password.length < 4) {
      show('error', 'La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    const job = jobOf(addForm.role);
    run(async () => {
      await apiRequest(
        'POST',
        '/users',
        {
          username,
          password: addForm.password,
          full_name,
          phone: addForm.phone.trim(),
          role: addForm.role,
          position: job.label,
          default_hotel_id: activeHotelId,
          hotel_ids: [activeHotelId]
        },
        activeHotelId
      );
      show('success', `✓ ${full_name} ya puede entrar con el usuario "${username}".`);
      setAddOpen(false);
      await fetchOverview();
    }, 'No se pudo agregar a la persona.');
  };

  /* -------------------- Ficha -------------------- */

  const openProfile = (m: StaffMember) => {
    setProfileMore(false);
    setProfileForm({
      phone: m.phone || '',
      emergency_contact: m.emergency_contact || '',
      emergency_phone: m.emergency_phone || '',
      base_salary: String(m.base_salary || ''),
      hire_date: m.hire_date || today,
      contract_type: m.contract_type || 'Término Indefinido',
      eps: m.eps || '',
      arl: m.arl || '',
      notes: m.profile_notes || ''
    });
    setProfileTarget(m);
  };

  const handleProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileTarget) return;
    const m = profileTarget;
    run(async () => {
      await apiRequest('PUT', `${base}/${m.id}/profile`, {
        ...profileForm,
        base_salary: Number(String(profileForm.base_salary).replace(/\D/g, '')) || 0,
        employee_code: m.employee_code || `EMP-${m.id}`,
        department: m.department || jobOf(m.role).dept,
        shift_preference: m.shift_preference || 'MAÑANA',
        position: m.position || jobOf(m.role).label
      });
      show('success', 'Datos guardados.');
      setProfileTarget(null);
      await fetchOverview();
    }, 'No se pudieron guardar los datos.');
  };

  const handleToggle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toggleTarget) return;
    const m = toggleTarget;
    const next = Number(m.active) === 1 ? 0 : 1;
    run(async () => {
      await apiRequest('PATCH', `/users/${m.id}/status`, { active: next }, activeHotelId);
      show('success', next ? `${m.full_name} puede volver a entrar.` : `${m.full_name} ya no puede entrar al sistema.`);
      setToggleTarget(null);
      await fetchOverview();
    }, 'No se pudo cambiar el acceso.');
  };

  const openActivity = (userId: number) =>
    run(async () => {
      setActivity(await apiRequest('GET', `${base}/${userId}/activity`));
    }, 'No se pudo cargar lo que ha hecho.');

  /* -------------------- Turnos -------------------- */

  const openShift = (userId?: number) => {
    setShiftForm({
      user_id: userId ? String(userId) : '',
      shift_name: 'MAÑANA',
      date: selectedDate
    });
    setShiftOpen(true);
  };

  const handleShift = (e: React.FormEvent) => {
    e.preventDefault();
    const m = staff.find((x) => String(x.id) === shiftForm.user_id);
    if (!m) {
      show('error', 'Elige quién va a trabajar.');
      return;
    }
    const s = shiftOf(shiftForm.shift_name);
    run(async () => {
      await apiRequest('POST', `${base}/shifts`, {
        user_id: m.id,
        shift_date: shiftForm.date,
        shift_name: s.id,
        start_time: s.start,
        end_time: s.end,
        department: m.department || jobOf(m.role).dept,
        notes: ''
      });
      show('success', `✓ ${m.full_name}: turno de ${s.label.toLowerCase()} el ${prettyDate(shiftForm.date)}.`);
      setShiftOpen(false);
      await fetchOverview();
    }, 'No se pudo asignar el turno.');
  };

  const setShiftStatus = (id: number, status: string) =>
    run(async () => {
      await apiRequest('PATCH', `${base}/shifts/${id}/status`, { status });
      await fetchOverview();
    }, 'No se pudo actualizar el turno.');

  const deleteShift = (id: number) =>
    run(async () => {
      await apiRequest('DELETE', `${base}/shifts/${id}`);
      show('success', 'Turno quitado.');
      await fetchOverview();
    }, 'No se pudo quitar el turno.');

  /* =======================================================================
     RENDER
  ======================================================================= */

  const workingToday = shifts.filter((s) => s.shift_date === today && s.status !== 'AUSENTE').length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <ModuleHeader
        icon={<Users className="w-5 h-5" />}
        iconColor="bg-violet-700"
        title={
          <>
            Personal
            <span className="font-semibold text-slate-500 dark:text-slate-400"> · {activeHotel?.name || 'Hotel'}</span>
          </>
        }
        subtitle={loading ? 'Cargando…' : `${activeStaff.length} persona(s) · ${workingToday} trabajan hoy`}
        tabs={[
          { id: 'EQUIPO', label: 'Mi equipo', short: 'Equipo', icon: <Users className="w-5 h-5 shrink-0" /> },
          { id: 'HORARIOS', label: 'Horarios', short: 'Horarios', icon: <CalendarClock className="w-5 h-5 shrink-0" /> }
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
          PESTAÑA 1: MI EQUIPO
      ===================================================================== */}
      {activeTab === 'EQUIPO' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard
              variant="flat"
              compact
              color="bg-violet-700"
              label="En el equipo"
              value={activeStaff.length}
              icon={<Users className="w-4 h-4" />}
            />
            <StatCard
              variant="flat"
              compact
              color="bg-emerald-700"
              label="Turnos hoy"
              value={workingToday}
              icon={<CalendarClock className="w-4 h-4" />}
            />
            <StatCard
              variant="flat"
              compact
              color="bg-slate-700"
              label="Ya no trabajan"
              value={inactiveStaff.length}
              icon={<Power className="w-4 h-4" />}
            />
          </div>

          <Panel
            accent="violet"
            title="Mi equipo"
            subtitle="Cada persona tiene su tarjeta con sus datos, su turno de hoy y lo que ha hecho."
            icon={<Users className="w-5 h-5 shrink-0" />}
            actions={
              canManage && (
                <button
                  type="button"
                  onClick={openAdd}
                  className={`${HEAD_BTN} h-12 px-5`}
                >
                  <UserPlus className="w-5 h-5 shrink-0" />
                  Agregar persona
                </button>
              )
            }
          >
            {loading ? (
              <EmptyText>Cargando…</EmptyText>
            ) : activeStaff.length === 0 ? (
              <EmptyState
                icon={<Users className="w-12 h-12" />}
                title="Aún no hay personas en tu equipo"
                text="Agrega a quienes trabajan contigo para asignarles turnos y que entren al sistema."
              />
            ) : (
              <div className="list-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activeStaff.map((m) => (
                  <PersonCard
                    key={m.id}
                    m={m}
                    todayShift={todayShiftOf(m.id)}
                    canManage={canManage}
                    isMe={user?.id === m.id}
                    onEdit={() => openProfile(m)}
                    onActivity={() => openActivity(m.id)}
                    onShift={() => openShift(m.id)}
                    onToggle={() => setToggleTarget(m)}
                  />
                ))}
              </div>
            )}
          </Panel>

          {inactiveStaff.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                aria-expanded={showInactive}
                className="w-full h-12 px-4 rounded-2xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-sm font-bold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-2 cursor-pointer hover:border-slate-600"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showInactive ? 'rotate-180' : ''}`} />
                {showInactive ? 'Ocultar' : 'Ver'} personas que ya no trabajan ({inactiveStaff.length})
              </button>
              {showInactive && (
                <Panel
                  accent="slate"
                  title="Personas que ya no trabajan"
                  subtitle="No pueden entrar al sistema. Puedes devolverles el acceso."
                  icon={<Power className="w-5 h-5 shrink-0" />}
                >
                  <div className="list-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {inactiveStaff.map((m) => (
                      <PersonCard
                        key={m.id}
                        m={m}
                        canManage={canManage}
                        isMe={false}
                        onEdit={() => openProfile(m)}
                        onActivity={() => openActivity(m.id)}
                        onToggle={() => setToggleTarget(m)}
                      />
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: HORARIOS
      ===================================================================== */}
      {activeTab === 'HORARIOS' && (
        <div className="space-y-4">
          <Panel accent="violet" title="¿Qué día quieres ver?" icon={<CalendarClock className="w-5 h-5 shrink-0" />}>
            <Segmented<Day>
              value={day}
              onChange={setDay}
              options={[
                { id: 'HOY', label: 'Hoy', color: 'bg-violet-700' },
                { id: 'MANANA', label: 'Mañana', color: 'bg-violet-700' },
                { id: 'FECHA', label: 'Otro día', color: 'bg-violet-700' }
              ]}
            />
            {day === 'FECHA' && (
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value || today)} className={INPUT} />
            )}
          </Panel>

          <Panel
            accent="sky"
            title={<span className="capitalize">{prettyDate(selectedDate)}</span>}
            subtitle={`${dayShifts.length} turno${dayShifts.length === 1 ? '' : 's'} asignado${dayShifts.length === 1 ? '' : 's'}`}
            icon={<Users className="w-5 h-5 shrink-0" />}
            actions={
              canManage && (
                <button
                  type="button"
                  onClick={() => openShift()}
                  disabled={activeStaff.length === 0}
                  className={`${HEAD_BTN} h-12 px-5 disabled:opacity-50`}
                >
                  <Plus className="w-5 h-5 shrink-0" />
                  Asignar turno
                </button>
              )
            }
          >
            {dayShifts.length === 0 ? (
              <EmptyState icon={<CalendarClock className="w-12 h-12" />} title="Nadie tiene turno este día" />
            ) : (
              <ul className="list-scroll space-y-2.5">
                {dayShifts.map((s) => {
                  const sh = shiftOf(s.shift_name);
                  const st = SHIFT_STATUS[s.status] || SHIFT_STATUS.PROGRAMADO;
                  return (
                    <li key={s.id} className={`rounded-2xl p-3 sm:p-4 space-y-3 ${flat(st.tone, true)}`}>
                      <div className="flex items-center gap-3">
                        <span
                          className="w-11 h-11 rounded-xl bg-white/95 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-2xl flex items-center justify-center shrink-0"
                          aria-hidden
                        >
                          {sh.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-black text-slate-900 dark:text-white truncate">{s.employee_name}</p>
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            {sh.label} · {s.start_time} a {s.end_time}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold text-white shrink-0 ${SOLID[st.tone]}`}>
                          {st.label}
                        </span>
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
                          {s.status !== 'EN_TURNO' && s.status !== 'COMPLETADO' && (
                            <StatusBtn onClick={() => setShiftStatus(s.id, 'EN_TURNO')} cls={BTN.emerald}>
                              ✓ Llegó
                            </StatusBtn>
                          )}
                          {s.status === 'EN_TURNO' && (
                            <StatusBtn onClick={() => setShiftStatus(s.id, 'COMPLETADO')} cls={BTN.indigo}>
                              Terminó
                            </StatusBtn>
                          )}
                          {s.status === 'PROGRAMADO' && (
                            <StatusBtn onClick={() => setShiftStatus(s.id, 'AUSENTE')} cls={BTN.roseOutline}>
                              No vino
                            </StatusBtn>
                          )}
                          {s.status !== 'PROGRAMADO' && (
                            <StatusBtn onClick={() => setShiftStatus(s.id, 'PROGRAMADO')} cls={BTN.outline}>
                              Deshacer
                            </StatusBtn>
                          )}
                          <StatusBtn onClick={() => deleteShift(s.id)} cls={`${BTN.outline} ml-auto`}>
                            <Trash2 className="w-4 h-4 shrink-0" />
                            Quitar turno
                          </StatusBtn>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* =====================================================================
          VENTANA: AGREGAR PERSONA
      ===================================================================== */}
      {addOpen && (
        <Modal
          color="bg-violet-700"
          icon={<UserPlus className="w-6 h-6" />}
          title="Agregar persona"
          subtitle="Con estos datos entrará al sistema"
          onClose={() => setAddOpen(false)}
          onSubmit={handleAdd}
          footer={
            <>
              <SecondaryBtn onClick={() => setAddOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-violet-700 hover:bg-violet-800">Agregar</PrimaryBtn>
            </>
          }
        >
          <Field label="Nombre completo">
            <input
              required
              autoFocus
              value={addForm.full_name}
              onChange={(e) => {
                const v = e.target.value;
                setAddForm((f) => ({ ...f, full_name: v, username: usernameTouched ? f.username : suggestUsername(v) }));
              }}
              placeholder="Ej: María Pérez"
              className={INPUT}
            />
          </Field>

          <Field label="¿Qué hace en el hotel?">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {JOBS.map((j) => {
                const on = addForm.role === j.role;
                return (
                  <button
                    key={j.role}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAddForm((f) => ({ ...f, role: j.role }))}
                    className={`min-h-14 px-2 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      on
                        ? 'bg-violet-700 border-violet-700 text-white'
                        : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                    }`}
                  >
                    <span aria-hidden>{j.emoji}</span>
                    {j.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Según esto, solo verá las partes del sistema que necesita.</p>
          </Field>

          <Field label="Celular (opcional)">
            <input
              inputMode="tel"
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              className={INPUT}
            />
          </Field>

          <div className="p-4 rounded-2xl bg-violet-100 dark:bg-violet-500/15 border-2 border-violet-400 dark:border-violet-500 space-y-3">
            <p className="text-sm font-black text-violet-900 dark:text-violet-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Para entrar al sistema
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Usuario">
                <input
                  required
                  value={addForm.username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setAddForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }));
                  }}
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
              <Field label="Contraseña">
                <input
                  required
                  type="text"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="Mínimo 4 caracteres"
                  className={INPUT}
                />
              </Field>
            </div>
            <p className="text-xs text-violet-800 dark:text-violet-200">Anótalos y entrégaselos a la persona.</p>
          </div>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: DATOS DE LA PERSONA
      ===================================================================== */}
      {profileTarget && (
        <Modal
          color="bg-violet-700"
          icon={<Edit3 className="w-6 h-6" />}
          title={profileTarget.full_name}
          subtitle={`${jobOf(profileTarget.role).emoji} ${jobOf(profileTarget.role).label} · usuario: ${profileTarget.username}`}
          onClose={() => setProfileTarget(null)}
          onSubmit={handleProfile}
          footer={
            <>
              <SecondaryBtn onClick={() => setProfileTarget(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-violet-700 hover:bg-violet-800">Guardar</PrimaryBtn>
            </>
          }
        >
          <Field label="Celular">
            <input
              inputMode="tel"
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              className={INPUT}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="En emergencia llamar a">
              <input
                value={profileForm.emergency_contact}
                onChange={(e) => setProfileForm((f) => ({ ...f, emergency_contact: e.target.value }))}
                placeholder="Nombre"
                className={INPUT}
              />
            </Field>
            <Field label="Su teléfono">
              <input
                inputMode="tel"
                value={profileForm.emergency_phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, emergency_phone: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setProfileMore((v) => !v)}
            className="h-10 px-4 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-sm font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${profileMore ? 'rotate-180' : ''}`} />
            Datos de contrato (opcional)
          </button>
          {profileMore && (
            <div className="space-y-3">
              <Field label="Sueldo mensual">
                <MoneyInput value={profileForm.base_salary} onChange={(v) => setProfileForm((f) => ({ ...f, base_salary: v }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entró a trabajar el">
                  <input
                    type="date"
                    value={profileForm.hire_date}
                    onChange={(e) => setProfileForm((f) => ({ ...f, hire_date: e.target.value }))}
                    className={INPUT}
                  />
                </Field>
                <Field label="Contrato">
                  <select
                    value={profileForm.contract_type}
                    onChange={(e) => setProfileForm((f) => ({ ...f, contract_type: e.target.value }))}
                    className={INPUT}
                  >
                    <option>Término Indefinido</option>
                    <option>Término Fijo</option>
                    <option>Prestación de Servicios</option>
                    <option>Por días</option>
                  </select>
                </Field>
                <Field label="EPS">
                  <input value={profileForm.eps} onChange={(e) => setProfileForm((f) => ({ ...f, eps: e.target.value }))} className={INPUT} />
                </Field>
                <Field label="ARL">
                  <input value={profileForm.arl} onChange={(e) => setProfileForm((f) => ({ ...f, arl: e.target.value }))} className={INPUT} />
                </Field>
              </div>
              <Field label="Notas">
                <input value={profileForm.notes} onChange={(e) => setProfileForm((f) => ({ ...f, notes: e.target.value }))} className={INPUT} />
              </Field>
            </div>
          )}
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: ASIGNAR TURNO
      ===================================================================== */}
      {shiftOpen && (
        <Modal
          color="bg-violet-700"
          icon={<CalendarClock className="w-6 h-6" />}
          title="Asignar turno"
          onClose={() => setShiftOpen(false)}
          onSubmit={handleShift}
          footer={
            <>
              <SecondaryBtn onClick={() => setShiftOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-violet-700 hover:bg-violet-800">Asignar</PrimaryBtn>
            </>
          }
        >
          <Field label="¿Quién?">
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
              {activeStaff.map((m) => {
                const on = shiftForm.user_id === String(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setShiftForm((f) => ({ ...f, user_id: String(m.id) }))}
                    className={`min-h-14 px-3 py-2 rounded-xl border-2 text-left cursor-pointer ${
                      on
                        ? 'bg-violet-700 border-violet-700 text-white'
                        : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                    }`}
                  >
                    <span className="block text-sm font-bold leading-snug line-clamp-2 break-words">{m.full_name}</span>
                    <span className={`block text-xs truncate ${on ? 'text-white/85' : 'text-slate-500'}`}>
                      {jobOf(m.role).emoji} {jobOf(m.role).label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="¿Qué turno?">
            <div className="grid grid-cols-2 gap-2">
              {SHIFTS.map((s) => {
                const on = shiftForm.shift_name === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setShiftForm((f) => ({ ...f, shift_name: s.id }))}
                    className={`min-h-16 px-2 rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer ${
                      on
                        ? 'bg-violet-700 border-violet-700 text-white'
                        : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-sm font-black">
                      {s.emoji} {s.label}
                    </span>
                    <span className={`text-xs font-semibold ${on ? 'text-white/85' : 'text-slate-500'}`}>
                      {s.start} a {s.end}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="¿Qué día?">
            <div className="grid grid-cols-3 gap-2">
              {[
                { d: today, label: 'Hoy' },
                { d: shiftDate(1), label: 'Mañana' },
                { d: shiftDate(2), label: 'Pasado mañana' }
              ].map((o) => {
                const on = shiftForm.date === o.d;
                return (
                  <button
                    key={o.d}
                    type="button"
                    onClick={() => setShiftForm((f) => ({ ...f, date: o.d }))}
                    className={`min-h-11 px-1 rounded-xl border-2 text-sm font-bold cursor-pointer ${
                      on
                        ? 'bg-violet-700 border-violet-700 text-white'
                        : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              value={shiftForm.date}
              min={today}
              onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value || today }))}
              className={`${INPUT} mt-2`}
            />
          </Field>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: QUITAR / DEVOLVER ACCESO
      ===================================================================== */}
      {toggleTarget && (
        <Modal
          color={Number(toggleTarget.active) === 1 ? 'bg-rose-700' : 'bg-emerald-700'}
          icon={<Power className="w-6 h-6" />}
          title={Number(toggleTarget.active) === 1 ? 'Ya no trabaja aquí' : 'Volvió a trabajar'}
          subtitle={toggleTarget.full_name}
          onClose={() => setToggleTarget(null)}
          onSubmit={handleToggle}
          footer={
            <>
              <SecondaryBtn onClick={() => setToggleTarget(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color={Number(toggleTarget.active) === 1 ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
                {Number(toggleTarget.active) === 1 ? 'Quitar acceso' : 'Devolver acceso'}
              </PrimaryBtn>
            </>
          }
        >
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {Number(toggleTarget.active) === 1
              ? 'No podrá entrar más al sistema. Su historial se conserva y puedes devolverle el acceso cuando quieras.'
              : 'Podrá volver a entrar con su mismo usuario y contraseña.'}
          </p>
        </Modal>
      )}

      {/* =====================================================================
          VENTANA: QUÉ HA HECHO
      ===================================================================== */}
      {activity && (
        <Modal
          color="bg-slate-800"
          icon={<Activity className="w-6 h-6" />}
          title="Lo que ha hecho"
          subtitle={activity.employee.full_name}
          size="lg"
          onClose={() => setActivity(null)}
          footer={<SecondaryBtn onClick={() => setActivity(null)}>Cerrar</SecondaryBtn>}
        >
          {activity.housekeeping_tasks.length + activity.maintenance_tickets.length + activity.audit_logs.length === 0 ? (
            <EmptyText>Todavía no tiene actividad registrada.</EmptyText>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {activity.housekeeping_tasks.slice(0, 6).map((h) => (
                <ActivityRow key={`h${h.id}`} emoji="🧹" text={`Limpió la habitación ${h.room_number}`} date={h.scheduled_date} />
              ))}
              {activity.maintenance_tickets.slice(0, 6).map((t) => (
                <ActivityRow key={`m${t.id}`} emoji="🔧" text={`Hab. ${t.room_number}: ${t.title}`} date="" />
              ))}
              {activity.audit_logs.slice(0, 12).map((a) => (
                <ActivityRow key={`a${a.id}`} emoji="•" text={a.details} date={a.date} />
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   COMPONENTES PEQUEÑOS
========================================================================= */

/** Estilos de botón: cada acción tiene su color fijo. */
const BTN = {
  emerald: 'bg-emerald-700 hover:bg-emerald-800 border-emerald-700 text-white',
  indigo: 'bg-indigo-700 hover:bg-indigo-800 border-indigo-700 text-white',
  violet: 'bg-violet-700 hover:bg-violet-800 border-violet-700 text-white',
  indigoOutline:
    'bg-white/95 dark:bg-slate-900 border-indigo-500 dark:border-indigo-500 text-indigo-800 dark:text-indigo-200 hover:border-indigo-700',
  roseOutline:
    'bg-white/95 dark:bg-slate-900 border-rose-500 dark:border-rose-500 text-rose-700 dark:text-rose-300 hover:border-rose-700',
  outline:
    'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
};

function PersonCard({
  m,
  todayShift,
  canManage,
  isMe,
  onEdit,
  onActivity,
  onShift,
  onToggle
}: {
  m: StaffMember;
  todayShift?: StaffShift;
  canManage: boolean;
  isMe: boolean;
  onEdit: () => void;
  onActivity: () => void;
  onShift?: () => void;
  onToggle: () => void;
}) {
  const job = jobOf(m.role);
  const inactive = Number(m.active) !== 1;
  const isOwner = m.role === 'PROPIETARIO' || m.role === 'ADMIN';
  const sh = todayShift ? shiftOf(todayShift.shift_name) : null;
  const t: Tone = inactive ? 'slate' : 'violet';
  const canToggle = canManage && !isMe && !isOwner;
  return (
    <article className={`flex flex-col ${SECTION(t)}`}>
      {/* Encabezado: quién es */}
      <div className={`${SECTION_HEAD(t)} flex items-center gap-3`}>
        <div className={`head-icon w-12 h-12 rounded-xl ${SOLID[t]} text-white text-lg font-black flex items-center justify-center shrink-0`}>
          {initials(m.full_name) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black leading-snug text-slate-900 dark:text-white line-clamp-2 break-words">
            {m.full_name}
            {isMe && <span className="text-xs font-semibold text-slate-600 dark:text-slate-300"> (tú)</span>}
          </p>
          <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-white/95 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200">
            {job.emoji} {job.label}
          </span>
        </div>
        {inactive && (
          <span className="px-2.5 py-1 rounded-full bg-slate-700 text-white text-xs font-bold shrink-0">Sin acceso</span>
        )}
      </div>

      {/* Datos de hoy */}
      <div className="p-4 space-y-2 flex-1">
        {m.phone ? (
          <a
            href={`tel:${m.phone}`}
            className="h-11 px-3 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-sky-500 dark:border-sky-500 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"
          >
            <Phone className="w-4 h-4 text-sky-700 dark:text-sky-300 shrink-0" />
            <span className="truncate">{m.phone}</span>
            <span className="ml-auto text-xs font-black text-sky-800 dark:text-sky-200 shrink-0">Llamar</span>
          </a>
        ) : (
          <p className="h-11 px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Phone className="w-4 h-4 shrink-0" />
            Sin celular
          </p>
        )}
        {!inactive && (
          <p
            className={`h-11 px-3 rounded-xl flex items-center gap-2 text-sm font-bold ${
              sh
                ? 'bg-emerald-100 dark:bg-emerald-500/15 border-2 border-emerald-500 dark:border-emerald-500 text-emerald-900 dark:text-emerald-100'
                : 'border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500'
            }`}
          >
            <CalendarClock className="w-4 h-4 shrink-0" />
            {sh ? `${sh.emoji} Hoy: ${todayShift!.start_time} a ${todayShift!.end_time}` : 'Hoy no tiene turno'}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex gap-2">
          {canManage && (
            <CardBtn onClick={onEdit} cls={BTN.indigoOutline}>
              <Edit3 className="w-5 h-5" />
              Datos
            </CardBtn>
          )}
          {canManage && onShift && !inactive && (
            <CardBtn onClick={onShift} cls={BTN.violet}>
              <CalendarClock className="w-5 h-5" />
              Turno
            </CardBtn>
          )}
          <CardBtn onClick={onActivity} cls={BTN.outline}>
            <Activity className="w-5 h-5" />
            Actividad
          </CardBtn>
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={`w-full h-10 rounded-xl border-2 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              inactive ? BTN.emerald : BTN.roseOutline
            }`}
          >
            <Power className="w-4 h-4 shrink-0" />
            {inactive ? 'Devolver acceso' : 'Ya no trabaja aquí'}
          </button>
        )}
      </div>
    </article>
  );
}

function CardBtn({ onClick, cls, children }: { onClick: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 h-14 rounded-xl border-2 text-xs sm:text-sm font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer ${cls}`}
    >
      {children}
    </button>
  );
}

function StatusBtn({ onClick, cls, children }: { onClick: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-4 rounded-xl border-2 text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer ${cls}`}
    >
      {children}
    </button>
  );
}

function ActivityRow({ emoji, text, date }: { emoji: string; text: string; date: string }) {
  return (
    <li className="py-2.5 flex items-start gap-3">
      <span className="w-6 text-center shrink-0" aria-hidden>
        {emoji}
      </span>
      <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-100">{text}</span>
      {date && <span className="text-xs text-slate-500 shrink-0">{date}</span>}
    </li>
  );
}
