import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  Lock,
  ArrowLeft,
  KeyRound,
  ExternalLink,
  Power,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API_URL from '../config/api';

interface ClientHotel {
  id: number;
  code: string;
  name: string;
  legal_name?: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  city?: string;
  currency: string;
  active: number;
  created_at: string;
  total_rooms: number;
  total_stays: number;
  owners: Array<{
    id: number;
    username: string;
    full_name: string;
    email?: string;
    phone?: string;
  }>;
}

export default function MasterSaaS() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [masterToken, setMasterToken] = useState<string | null>(null);

  // Formulario de login master
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Lista de clientes
  const [clients, setClients] = useState<ClientHotel[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal para registrar nuevo cliente
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    hotel_name: '',
    legal_name: '',
    tax_id: '',
    phone: '',
    email: '',
    city: 'La Dorada, Caldas',
    currency: 'COP',
    admin_name: '',
    admin_username: '',
    admin_password: '',
    admin_email: '',
    admin_phone: ''
  });

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/saas-master/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciales maestras inválidas');
      }
      setMasterToken(data.master_token);
      setIsAuthenticated(true);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const loadClients = async () => {
    if (!masterToken) return;
    setLoadingClients(true);
    try {
      const res = await fetch(`${API_URL}/api/saas-master/clients`, {
        headers: { Authorization: `Bearer ${masterToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingClients(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && masterToken) {
      loadClients();
    }
  }, [isAuthenticated, masterToken]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`${API_URL}/api/saas-master/clients`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${masterToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear cliente');
      }
      setFeedback({ type: 'ok', text: `¡Cliente '${form.hotel_name}' creado con éxito! Usuario: ${form.admin_username}` });
      setShowModal(false);
      setForm({
        hotel_name: '',
        legal_name: '',
        tax_id: '',
        phone: '',
        email: '',
        city: 'La Dorada, Caldas',
        currency: 'COP',
        admin_name: '',
        admin_username: '',
        admin_password: '',
        admin_email: '',
        admin_phone: ''
      });
      loadClients();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Eliminación definitiva de un hotel (requiere escribir su nombre)
  const [deleteTarget, setDeleteTarget] = useState<ClientHotel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const openDeleteModal = (c: ClientHotel) => {
    setDeleteTarget(c);
    setDeleteConfirm('');
    setDeleteError('');
  };

  const deleteNameMatches =
    !!deleteTarget &&
    deleteConfirm.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase();

  const handleDeleteClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || !deleteNameMatches) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_URL}/api/saas-master/clients/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${masterToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirm_name: deleteConfirm.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo eliminar el hotel');
      }
      setFeedback({ type: 'ok', text: data.message || `Hotel '${deleteTarget.name}' eliminado.` });
      setDeleteTarget(null);
      loadClients();
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (hotelId: number, currentActive: number) => {
    try {
      const res = await fetch(`${API_URL}/api/saas-master/clients/${hotelId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${masterToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: currentActive ? 0 : 1 })
      });
      if (res.ok) {
        loadClients();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // VISTA 1: LOGIN DE SUPER ADMINISTRADOR OCULTO
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black text-white">Panel Master SaaS</h1>
            <p className="text-xs text-slate-400">
              Control de Propietario para registrar y administrar clientes hoteleros
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold text-center">
              {loginError}
            </div>
          )}

          <form onSubmit={handleMasterLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Usuario Maestro</label>
              <input
                type="text"
                required
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                placeholder="admin"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Contraseña Maestra</label>
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all"
            >
              {loginLoading ? 'Verificando...' : 'Acceder al Panel Master'}
            </button>
          </form>

          <div className="text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-300"
            >
              Volver al inicio de sesión normal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VISTA 2: PANEL DE ADMINISTRACIÓN DE CLIENTES
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Administrador Maestro SaaS</h1>
                <p className="text-xs text-slate-400">
                  Alta de nuevos hoteles y control de accesos de clientes
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Nuevo Cliente / Hotel</span>
            </button>

            <button
              onClick={() => navigate('/login')}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
            >
              Cerrar Panel
            </button>
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between ${
              feedback.type === 'ok'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            <span>{feedback.text}</span>
            <button onClick={() => setFeedback(null)} className="underline ml-4">
              Cerrar
            </button>
          </div>
        )}

        {/* Listado de Hoteles Clientes */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <span>Clientes Registrados ({clients.length})</span>
            </h2>
          </div>

          {loadingClients ? (
            <div className="py-12 text-center text-xs text-slate-400">Cargando clientes...</div>
          ) : clients.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No hay hoteles clientes registrados todavía.
            </div>
          ) : (
            <div className="table-scroll table-scroll-dark">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950/60 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="p-3.5">Hotel / Negocio</th>
                    <th className="p-3.5">NIT / Ciudad</th>
                    <th className="p-3.5">Propietario / Acceso</th>
                    <th className="p-3.5">Habitaciones</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {clients.map((c) => {
                    const owner = c.owners && c.owners[0];
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-bold text-white">
                          <div className="flex items-center space-x-2">
                            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                              <Building2 className="w-4 h-4" />
                            </span>
                            <div>
                              <span>{c.name}</span>
                              <span className="block text-[10px] text-slate-500 font-normal">
                                ID: {c.id} · Cód: {c.code}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-400">
                          <div>NIT: {c.tax_id || 'S/N'}</div>
                          <div className="text-[10px] text-slate-500">{c.city || 'Colombia'}</div>
                        </td>
                        <td className="p-3.5">
                          {owner ? (
                            <div>
                              <span className="font-semibold text-slate-200">{owner.full_name}</span>
                              <span className="block text-[10px] text-emerald-400 font-mono">
                                Usuario: {owner.username}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500">Sin asignar</span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-300 font-semibold">
                          {c.total_rooms || 0} habitaciones
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md ${
                              c.active
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {c.active ? 'ACTIVO' : 'SUSPENDIDO'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleStatus(c.id, c.active)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                c.active
                                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {c.active ? 'Suspender' : 'Activar'}
                            </button>
                            <button
                              onClick={() => openDeleteModal(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
                              title={`Eliminar ${c.name} definitivamente`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
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

        {/* Modal Eliminar Cliente (confirmación escribiendo el nombre) */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
            <form
              onSubmit={handleDeleteClient}
              className="bg-slate-900 border border-rose-500/40 rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl"
            >
              <div className="bg-rose-700 text-white px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black leading-tight">Eliminar hotel</h3>
                    <p className="text-sm text-white/85 truncate">{deleteTarget.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-sm">
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-2">
                  <p className="font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    Esta acción no se puede deshacer.
                  </p>
                  <p>Se borrará para siempre toda la información de este hotel:</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-rose-200/90">
                    <li>{deleteTarget.total_rooms || 0} habitación(es) y {deleteTarget.total_stays || 0} estadía(s)</li>
                    <li>Reservas, huéspedes, caja, inventario, restaurante y contabilidad</li>
                    <li>
                      Los usuarios que solo trabajan en este hotel
                      {deleteTarget.owners?.length
                        ? ` (ej.: ${deleteTarget.owners.map((o) => o.username).join(', ')})`
                        : ''}
                    </li>
                  </ul>
                  <p className="text-rose-200/80">
                    Si solo quieres bloquear el acceso temporalmente, usa “Suspender”.
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="font-semibold text-slate-300 block">
                    Para confirmar, escribe el nombre del hotel:{' '}
                    <strong className="text-white select-all">{deleteTarget.name}</strong>
                  </span>
                  <input
                    type="text"
                    autoFocus
                    autoComplete="off"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={deleteTarget.name}
                    className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:outline-none focus:border-rose-500"
                  />
                </label>

                {deleteError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold">
                    {deleteError}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-800 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!deleteNameMatches || deleting}
                  className="h-12 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:text-rose-300/50 disabled:cursor-not-allowed text-white text-sm font-black inline-flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Eliminando…' : 'Eliminar para siempre'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Registrar Cliente */}
        {showModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  <span>Alta de Nuevo Cliente y Hotel</span>
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateClient} className="space-y-5">
                {/* Datos del Hotel */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3">
                    1. Datos del Establecimiento Hotelero
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Nombre Comercial *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.hotel_name}
                        onChange={(e) => setForm({ ...form, hotel_name: e.target.value })}
                        placeholder="Ej. Hotel El Oasis"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Razón Social / Titular
                      </label>
                      <input
                        type="text"
                        value={form.legal_name}
                        onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                        placeholder="Ej. Inversiones El Oasis S.A.S."
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">NIT / Documento</label>
                      <input
                        type="text"
                        value={form.tax_id}
                        onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                        placeholder="900.123.456-7"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Ciudad</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        placeholder="La Dorada, Caldas"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Datos del Propietario */}
                <div className="pt-3 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
                    2. Cuenta de Acceso del Cliente (Propietario)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Nombre Completo del Cliente *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.admin_name}
                        onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                        placeholder="Ej. Carlos Mendoza"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Teléfono / WhatsApp
                      </label>
                      <input
                        type="text"
                        value={form.admin_phone}
                        onChange={(e) => setForm({ ...form, admin_phone: e.target.value })}
                        placeholder="3222067870"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Usuario de Ingreso *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.admin_username}
                        onChange={(e) => setForm({ ...form, admin_username: e.target.value })}
                        placeholder="ej. carlos_oasis"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Contraseña de Ingreso *
                      </label>
                      <input
                        type="password"
                        required
                        value={form.admin_password}
                        onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30"
                  >
                    {saving ? 'Guardando Cliente...' : 'Crear Hotel y Acceso'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

