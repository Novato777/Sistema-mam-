import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  Activity,
  FileSearch,
  Plus,
  Pencil,
  Power,
  X,
  Check,
  Lock,
  Building2,
  LogOut
} from 'lucide-react';
import API_URL from '../config/api';
import { useHotel } from '../context/HotelContext';

interface PermissionItem {
  code: string;
  module: string;
  label: string;
}

interface RoleDef {
  name: string;
  description: string;
  permissions: string[];
}

interface UserHotelAssignment {
  user_id: number;
  hotel_id: number;
  role: string;
  active: number;
  hotel_name: string;
}

interface UserRecord {
  id: number;
  username: string;
  full_name: string;
  document?: string;
  position?: string;
  email?: string;
  phone?: string;
  role: string;
  custom_permissions_obj?: { grant: string[]; revoke: string[] };
  effective_permissions: string[];
  active: number;
  default_hotel_id: number;
  last_login_at?: string;
  created_at?: string;
  hotels: UserHotelAssignment[];
}

interface SessionRecord {
  id: number;
  user_id: number;
  username: string;
  full_name: string;
  role: string;
  hotel_id: number;
  hotel_name?: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  revoked: number;
  revoked_at?: string;
}

interface AuditLogRecord {
  id: number;
  hotel_id: number;
  hotel_name?: string;
  user_id: number;
  username?: string;
  full_name?: string;
  user_role?: string;
  action: string;
  module: string;
  entity_id?: number;
  details: string;
  ip_address?: string;
  date: string;
}

export default function Usuarios() {
  const { hotels, activeHotelId, user: currentUser, hasPermission } = useHotel();

  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles' | 'sesiones' | 'auditoria'>(
    'usuarios'
  );
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [rolesCatalog, setRolesCatalog] = useState<Record<string, RoleDef>>({});
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionItem[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filtros de auditoría
  const [auditFilterHotel, setAuditFilterHotel] = useState<string>('');
  const [auditFilterModule, setAuditFilterModule] = useState<string>('');

  // Modal de Crear / Editar Usuario
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    full_name: '',
    document: '',
    position: '',
    email: '',
    phone: '',
    role: 'RECEPCIONISTA',
    default_hotel_id: activeHotelId || 1,
    hotel_ids: [activeHotelId || 1] as number[],
    grant: [] as string[],
    revoke: [] as string[]
  });

  // Rol seleccionado en la pestaña Matriz de Roles
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('RECEPCIONISTA');

  const token = localStorage.getItem('token');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [catRes, usersRes, sessRes, auditRes] = await Promise.all([
        fetch(`${API_URL}/api/users/catalog`, { headers }),
        fetch(`${API_URL}/api/users`, { headers }),
        fetch(`${API_URL}/api/users/sessions`, { headers }),
        fetch(
          `${API_URL}/api/users/audit-logs?hotelId=${auditFilterHotel}&module=${auditFilterModule}`,
          { headers }
        )
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        setRolesCatalog(catData.roles || {});
        setPermissionsCatalog(catData.permissions || []);
      }
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
      if (sessRes.ok) {
        setSessions(await sessRes.json());
      }
      if (auditRes.ok) {
        setAuditLogs(await auditRes.json());
      }
    } catch (error) {
      console.error('Error al cargar módulo de usuarios:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [auditFilterHotel, auditFilterModule]);

  const openCreateModal = () => {
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      full_name: '',
      document: '',
      position: 'Recepcionista',
      email: '',
      phone: '',
      role: 'RECEPCIONISTA',
      default_hotel_id: activeHotelId || 1,
      hotel_ids: hotels.map((h) => h.id),
      grant: [],
      revoke: []
    });
    setShowUserModal(true);
  };

  const openEditModal = (u: UserRecord) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      password: '',
      full_name: u.full_name || '',
      document: u.document || '',
      position: u.position || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'RECEPCIONISTA',
      default_hotel_id: u.default_hotel_id || 1,
      hotel_ids: u.hotels.length > 0 ? u.hotels.map((h) => h.hotel_id) : [1],
      grant: u.custom_permissions_obj?.grant || [],
      revoke: u.custom_permissions_obj?.revoke || []
    });
    setShowUserModal(true);
  };

  // Determinar si un permiso está activo en el formulario del modal (Rol base + grant - revoke)
  const isPermCheckedInForm = (code: string): boolean => {
    if (userForm.role === 'PROPIETARIO') return true;
    const rolePerms = rolesCatalog[userForm.role]?.permissions || [];
    if (userForm.revoke.includes(code)) return false;
    if (userForm.grant.includes(code)) return true;
    return rolePerms.includes(code);
  };

  const togglePermInForm = (code: string) => {
    if (userForm.role === 'PROPIETARIO') return;
    const rolePerms = rolesCatalog[userForm.role]?.permissions || [];
    const currentlyChecked = isPermCheckedInForm(code);

    if (currentlyChecked) {
      // Desmarcar permiso
      const nextGrant = userForm.grant.filter((p) => p !== code);
      const nextRevoke = rolePerms.includes(code)
        ? Array.from(new Set([...userForm.revoke, code]))
        : userForm.revoke;
      setUserForm({ ...userForm, grant: nextGrant, revoke: nextRevoke });
    } else {
      // Marcar permiso
      const nextRevoke = userForm.revoke.filter((p) => p !== code);
      const nextGrant = !rolePerms.includes(code)
        ? Array.from(new Set([...userForm.grant, code]))
        : userForm.grant;
      setUserForm({ ...userForm, grant: nextGrant, revoke: nextRevoke });
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    try {
      const url = editingUser
        ? `${API_URL}/api/users/${editingUser.id}`
        : `${API_URL}/api/users`;
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: userForm.username,
          password: userForm.password || undefined,
          full_name: userForm.full_name,
          document: userForm.document,
          position: userForm.position,
          email: userForm.email,
          phone: userForm.phone,
          role: userForm.role,
          default_hotel_id: userForm.default_hotel_id,
          hotel_ids: userForm.hotel_ids,
          custom_permissions: {
            grant: userForm.grant,
            revoke: userForm.revoke
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar usuario');

      setShowUserModal(false);
      setFeedback({ type: 'ok', text: data.message });
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleUserStatus = async (u: UserRecord) => {
    const nextActive = u.active ? 0 : 1;
    const actionLabel = nextActive === 1 ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Deseas ${actionLabel} al usuario @${u.username}?`)) return;

    try {
      const res = await fetch(`${API_URL}/api/users/${u.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ active: nextActive })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar estado');

      setFeedback({ type: 'ok', text: data.message });
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRevokeSession = async (sessionId: number) => {
    if (!window.confirm('¿Cerrar y revocar esta sesión inmediatamente?')) return;
    try {
      const res = await fetch(`${API_URL}/api/users/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al revocar sesión');

      setFeedback({ type: 'ok', text: data.message });
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case 'PROPIETARIO':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300 border-purple-200';
      case 'ADMINISTRADOR':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300 border-indigo-200';
      case 'RECEPCIONISTA':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200';
      case 'CAJERO':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 border-teal-200';
      case 'LIMPIEZA':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200';
      case 'CONTABILIDAD':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200';
      case 'RESTAURANTE':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300 border-rose-200';
      case 'MANTENIMIENTO':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="w-full h-2.5 bg-violet-600 rounded-full mb-4 shadow-sm"></div>

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-violet-600 text-white rounded-2xl border border-violet-700 shadow-sm">
              <Users className="w-6 h-6" />
            </span>
            Personal, Usuarios, Roles y Auditoría
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Control de acceso granular RBAC (9 roles hoteleros), asignación multi-sede, monitoreo
            de sesiones y bitácora de seguridad.
          </p>
        </div>

        {hasPermission('users.manage') && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-sm shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Empleado / Usuario</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Pestañas del Módulo 10 */}
      <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xs">
        {[
          { id: 'usuarios', label: `1. Empleados y Usuarios (${users.length})`, icon: Users },
          { id: 'roles', label: '2. Matriz de Roles y Permisos (9 Roles)', icon: Shield },
          {
            id: 'sesiones',
            label: `3. Sesiones Activas (${sessions.filter((s) => !s.revoked).length})`,
            icon: Activity
          },
          { id: 'auditoria', label: '4. Bitácora de Auditoría', icon: FileSearch }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                active
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">
          Cargando información de usuarios y seguridad...
        </div>
      ) : (
        <>
          {/* PESTAÑA 1: DIRECTORIO DE EMPLEADOS Y USUARIOS */}
          {activeTab === 'usuarios' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
              <div className="table-scroll">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs uppercase font-bold">
                      <th className="py-3 px-3">Empleado / Usuario</th>
                      <th className="py-3 px-3">Cargo / Identificación</th>
                      <th className="py-3 px-3">Rol Oficial</th>
                      <th className="py-3 px-3">Sedes Asignadas</th>
                      <th className="py-3 px-3">Permisos</th>
                      <th className="py-3 px-3">Estado</th>
                      <th className="py-3 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {u.full_name}
                          </div>
                          <div className="text-xs text-slate-400">
                            @{u.username} {u.email ? `· ${u.email}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-xs">
                          <div className="font-semibold text-slate-700 dark:text-slate-200">
                            {u.position || rolesCatalog[u.role]?.name || u.role}
                          </div>
                          <div className="text-slate-400">
                            {u.document ? `Doc: ${u.document}` : 'Sin documento'}{' '}
                            {u.phone ? `· Tel: ${u.phone}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold border ${roleBadgeColor(
                              u.role
                            )}`}
                          >
                            {rolesCatalog[u.role]?.name || u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {u.role === 'PROPIETARIO' ? (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold">
                                Todas las sedes ({hotels.length})
                              </span>
                            ) : u.hotels.length > 0 ? (
                              u.hotels.map((uh) => (
                                <span
                                  key={uh.hotel_id}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                                >
                                  {uh.hotel_name}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400">Sede #{u.default_hotel_id}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {u.effective_permissions?.length || 0}
                          </span>{' '}
                          <span className="text-slate-400">habilitados</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              u.active
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                            }`}
                          >
                            {u.active ? '🟢 Activo' : '🔴 Inactivo'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          {hasPermission('users.manage') && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => openEditModal(u)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg"
                                title="Editar usuario y permisos"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {u.id !== currentUser?.id && (
                                <button
                                  onClick={() => handleToggleUserStatus(u)}
                                  className={`p-2 rounded-lg ${
                                    u.active
                                      ? 'text-red-500 hover:bg-red-50'
                                      : 'text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title={u.active ? 'Desactivar usuario' : 'Activar usuario'}
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: MATRIZ DE ROLES Y PERMISOS */}
          {activeTab === 'roles' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 p-5 space-y-2.5">
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 px-2">
                  Roles Hoteleros Oficiales
                </h3>
                {Object.entries(rolesCatalog).map(([key, def]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedRoleKey(key)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      selectedRoleKey === key
                        ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-500/15'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {def.name}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {def.permissions.length} permisos
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {def.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 p-6 space-y-5">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Permisos predeterminados para:{' '}
                    <span className="text-violet-600 dark:text-violet-400">
                      {rolesCatalog[selectedRoleKey]?.name || selectedRoleKey}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    {rolesCatalog[selectedRoleKey]?.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {permissionsCatalog.map((perm) => {
                    const included =
                      rolesCatalog[selectedRoleKey]?.permissions.includes(perm.code) || false;
                    return (
                      <div
                        key={perm.code}
                        className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${
                          included
                            ? 'border-emerald-200 dark:border-emerald-500/70 bg-emerald-50/30 dark:bg-emerald-500/15'
                            : 'border-slate-100 dark:border-slate-800 opacity-50'
                        }`}
                      >
                        <div
                          className={`p-1 rounded-md mt-0.5 ${
                            included
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                          }`}
                        >
                          {included ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100">
                            {perm.label}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            [{perm.module}] {perm.code}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 3: CONTROL DE SESIONES ACTIVAS */}
          {activeTab === 'sesiones' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
              <div className="table-scroll">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs uppercase font-bold">
                      <th className="py-3 px-3">ID Sesión</th>
                      <th className="py-3 px-3">Usuario</th>
                      <th className="py-3 px-3">Sede Principal</th>
                      <th className="py-3 px-3">IP / Dispositivo</th>
                      <th className="py-3 px-3">Inicio / Última Actividad</th>
                      <th className="py-3 px-3">Estado</th>
                      <th className="py-3 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-xs"
                      >
                        <td className="py-3.5 px-3 font-mono text-slate-400">#{s.id}</td>
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {s.full_name} (@{s.username})
                          </div>
                          <div className="text-slate-400">{s.role}</div>
                        </td>
                        <td className="py-3.5 px-3 font-medium">
                          {s.hotel_name || `Sede #${s.hotel_id}`}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-mono text-slate-700 dark:text-slate-300">
                            {s.ip_address}
                          </div>
                          <div className="text-slate-400 max-w-xs truncate">{s.user_agent}</div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-500">
                          <div>Inicio: {s.created_at.replace('T', ' ').slice(0, 19)}</div>
                          <div>Activo: {s.last_active_at.replace('T', ' ').slice(0, 19)}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          {s.revoked ? (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                              Cerrada / Revocada
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 font-bold">
                              🟢 Sesión Activa
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          {!s.revoked && hasPermission('users.manage') && (
                            <button
                              onClick={() => handleRevokeSession(s.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-all"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>Revocar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {sessions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No hay sesiones registradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PESTAÑA 4: BITÁCORA DE AUDITORÍA */}
          {activeTab === 'auditoria' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <select
                  value={auditFilterHotel}
                  onChange={(e) => setAuditFilterHotel(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">Todos los Hoteles / Sedes</option>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>

                <select
                  value={auditFilterModule}
                  onChange={(e) => setAuditFilterModule(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">Todos los Módulos</option>
                  <option value="AUTH">AUTH (Accesos y Sesiones)</option>
                  <option value="USUARIOS">USUARIOS (Personal y Permisos)</option>
                  <option value="CONFIGURACION">CONFIGURACION (Parámetros del Hotel)</option>
                  <option value="CAJA">CAJA (Movimientos y Anulaciones)</option>
                  <option value="SISTEMA">SISTEMA (Migraciones)</option>
                </select>
              </div>

              <div className="table-scroll">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-bold">
                      <th className="py-3 px-3">Fecha</th>
                      <th className="py-3 px-3">Establecimiento</th>
                      <th className="py-3 px-3">Usuario</th>
                      <th className="py-3 px-3">Módulo</th>
                      <th className="py-3 px-3">Acción</th>
                      <th className="py-3 px-3">Detalles de Auditoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{log.date}</td>
                        <td className="py-3 px-3 font-medium">
                          {log.hotel_name || `Sede #${log.hotel_id || 1}`}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {log.full_name || log.username || 'Sistema'}
                          </span>
                          {log.user_role && (
                            <span className="ml-1.5 text-[10px] text-slate-400">
                              ({log.user_role})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                            {log.module}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-violet-600 dark:text-violet-400">
                          {log.action}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL CREAR / EDITAR USUARIO Y PERMISOS GRANULARES */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {editingUser
                    ? `Editar Empleado: ${editingUser.full_name} (@${editingUser.username})`
                    : 'Registrar Nuevo Empleado / Usuario'}
                </h3>
                <p className="text-xs text-slate-500">
                  Asigna su cargo, rol hotelero, establecimientos autorizados y permisos
                  granulares.
                </p>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                    placeholder="Ej: Laura Gómez"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Usuario de Acceso *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    placeholder="Ej: recepcion1"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    {editingUser ? 'Nueva Contraseña (Opcional)' : 'Contraseña *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder={editingUser ? 'Dejar vacío para conservar' : '••••••••'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Documento / Cédula
                  </label>
                  <input
                    type="text"
                    value={userForm.document}
                    onChange={(e) => setUserForm({ ...userForm, document: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Teléfono / Celular
                  </label>
                  <input
                    type="text"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              {/* Selección de Rol Oficial y Sedes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-violet-600" />
                    <span>Rol Oficial en el Sistema *</span>
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      setUserForm({
                        ...userForm,
                        role: nextRole,
                        position: rolesCatalog[nextRole]?.name || nextRole,
                        grant: [],
                        revoke: []
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
                  >
                    {Object.entries(rolesCatalog).map(([key, def]) => (
                      <option key={key} value={key}>
                        {def.name} ({key})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    {rolesCatalog[userForm.role]?.description}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Establecimientos Autorizados (Multi-Tenant)</span>
                  </label>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {hotels.map((h) => {
                      const checked = userForm.hotel_ids.includes(h.id);
                      return (
                        <label
                          key={h.id}
                          className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? userForm.hotel_ids.filter((id) => id !== h.id)
                                : [...userForm.hotel_ids, h.id];
                              if (next.length > 0) {
                                setUserForm({
                                  ...userForm,
                                  hotel_ids: next,
                                  default_hotel_id: next[0]
                                });
                              }
                            }}
                          />
                          <span>
                            {h.name} (ID #{h.id})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Personalización Granular de Permisos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Permisos Granulares del Usuario (Clic para habilitar o restringir)
                  </h4>
                  {(userForm.grant.length > 0 || userForm.revoke.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setUserForm({ ...userForm, grant: [], revoke: [] })}
                      className="text-xs text-violet-600 font-semibold hover:underline"
                    >
                      Restablecer permisos por defecto del rol
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                  {permissionsCatalog.map((perm) => {
                    const checked = isPermCheckedInForm(perm.code);
                    return (
                      <label
                        key={perm.code}
                        className={`p-2 rounded-lg border text-xs flex items-start gap-2 cursor-pointer transition-all ${
                          checked
                            ? 'border-violet-300 bg-violet-50/50 dark:bg-violet-500/15 dark:border-violet-500'
                            : 'border-slate-200 dark:border-slate-700 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={userForm.role === 'PROPIETARIO'}
                          onChange={() => togglePermInForm(perm.code)}
                          className="mt-0.5"
                        />
                        <div className="leading-tight">
                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                            {perm.label}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{perm.code}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-sm"
                >
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

