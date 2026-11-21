import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  BedDouble,
  CreditCard,
  Monitor,
  Plus,
  Trash2,
  Edit3,
  Save,
  ChevronDown,
  Sun,
  Moon,
  Check,
  Clock,
  FileText,
  ScrollText,
  SlidersHorizontal,
  Percent
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';
import {
  INPUT,
  Field,
  MoneyInput,
  Notice,
  SecondaryBtn,
  PrimaryBtn,
  Modal,
  Panel,
  EmptyText,
  SECTION,
  SECTION_HEAD,
  SOLID,
  flat,
  HEAD_BTN,
  ModuleHeader
} from '../components/ModuleUI';
import type { Tone } from '../components/ModuleUI';

/* =========================================================================
   TIPOS
========================================================================= */

interface TaxItem {
  id: number;
  name: string;
  code: string;
  percentage: number;
  is_inclusive: number;
  applies_to: string;
  active: number;
}

interface PaymentMethodItem {
  id: number;
  name: string;
  code: string;
  type: string;
  active: number;
}

interface DepartmentItem {
  id: number;
  name: string;
  code: string;
  active: number;
}

interface RoomTypeItem {
  id: number;
  name: string;
  code: string;
  base_price: number;
  capacity: number;
  bed_config: string;
  amenities: string;
}

type Tab = 'HOTEL' | 'HABITACIONES' | 'COBROS' | 'PANTALLA';

const EMPTY_HOTEL = {
  name: '',
  legal_name: '',
  tax_id: '',
  tax_regime: '',
  logo_url: '/logo.png',
  address: '',
  city: '',
  country: 'Colombia',
  phone: '',
  email: '',
  website: '',
  currency: 'COP',
  timezone: 'America/Bogota',
  check_in_time: '15:00',
  check_out_time: '13:00',
  accommodation_policy: '',
  cancellation_policy: '',
  reservation_policy: '',
  sire_code: '',
  tra_code: ''
};

const CHECKIN_TIMES = ['12:00', '14:00', '15:00'];
const CHECKOUT_TIMES = ['11:00', '12:00', '13:00'];
const BEDS = ['1 Cama Sencilla', '1 Cama Doble', '2 Camas Sencillas', '1 Doble + 1 Sencilla', 'Camarote'];

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0));

/** Código interno a partir del nombre: "IVA Hotel" → "IVA_HOTEL". */
const toCode = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);

/* =========================================================================
   PÁGINA
========================================================================= */

export default function Configuracion() {
  const { theme, setTheme } = useTheme();
  const { hotels, activeHotelId, setActiveHotelId, refreshHotels, hasPermission } = useHotel();
  const canEdit = hasPermission('config.manage') || hasPermission('config.view');

  const [activeTab, setActiveTab] = useState<Tab>('HOTEL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [hotelForm, setHotelForm] = useState(EMPTY_HOTEL);
  const [savedHotel, setSavedHotel] = useState(EMPTY_HOTEL);
  const [taxes, setTaxes] = useState<TaxItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([]);

  // Secciones opcionales plegadas
  const [openInvoice, setOpenInvoice] = useState(false);
  const [openRules, setOpenRules] = useState(false);
  const [openAdvanced, setOpenAdvanced] = useState(false);

  // Ventanas
  const [roomModal, setRoomModal] = useState<{ item: RoomTypeItem | null } | null>(null);
  const [roomForm, setRoomForm] = useState({ name: '', base_price: '', capacity: 2, bed_config: '1 Cama Doble' });
  const [pmOpen, setPmOpen] = useState(false);
  const [pmName, setPmName] = useState('');
  const [taxOpen, setTaxOpen] = useState(false);
  const [taxForm, setTaxForm] = useState({ name: '', percentage: '19', is_inclusive: true });
  const [deptName, setDeptName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [newHotelOpen, setNewHotelOpen] = useState(false);
  const [newHotel, setNewHotel] = useState({ name: '', city: '', phone: '' });

  const token = localStorage.getItem('token');
  const hotelBase = `${API_URL}/api/hotels/${activeHotelId}`;

  const api = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(activeHotelId ? { 'X-Hotel-Id': String(activeHotelId) } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error');
    return data;
  };

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

  const loadConfig = async () => {
    if (!activeHotelId) return;
    try {
      const data = await api('GET', `${hotelBase}/config`);
      if (data.hotel) {
        const h = { ...EMPTY_HOTEL };
        (Object.keys(EMPTY_HOTEL) as Array<keyof typeof EMPTY_HOTEL>).forEach((k) => {
          if (data.hotel[k] !== null && data.hotel[k] !== undefined) h[k] = String(data.hotel[k]);
        });
        setHotelForm(h);
        setSavedHotel(h);
      }
      setTaxes(data.taxes || []);
      setPaymentMethods(data.paymentMethods || []);
      setDepartments(data.departments || []);
      setRoomTypes(data.roomTypes || []);
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'No se pudo cargar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHotelId]);

  const hotelChanged = JSON.stringify(hotelForm) !== JSON.stringify(savedHotel);
  const setH = (k: keyof typeof EMPTY_HOTEL, v: string) => setHotelForm((f) => ({ ...f, [k]: v }));

  /* -------------------- Mi hotel -------------------- */

  const saveHotel = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!hotelForm.name.trim()) {
      show('error', 'El nombre del hotel no puede quedar vacío.');
      return;
    }
    run(async () => {
      await api('PUT', `${hotelBase}/config`, hotelForm);
      setSavedHotel(hotelForm);
      show('success', '✓ Cambios guardados.');
      await refreshHotels();
    }, 'No se pudieron guardar los cambios.');
  };

  /* -------------------- Habitaciones -------------------- */

  const openRoom = (item: RoomTypeItem | null) => {
    setRoomForm(
      item
        ? {
            name: item.name,
            base_price: String(item.base_price || ''),
            capacity: Number(item.capacity || 2),
            bed_config: item.bed_config || '1 Cama Doble'
          }
        : { name: '', base_price: '', capacity: 2, bed_config: '1 Cama Doble' }
    );
    setRoomModal({ item });
  };

  const saveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const item = roomModal?.item || null;
    const price = Number(String(roomForm.base_price).replace(/\D/g, '')) || 0;
    if (!roomForm.name.trim() || price <= 0) {
      show('error', 'Escribe el nombre y el precio por noche.');
      return;
    }
    const body = {
      name: roomForm.name.trim(),
      code: item?.code || toCode(roomForm.name),
      base_price: price,
      capacity: roomForm.capacity,
      bed_config: roomForm.bed_config,
      amenities: item?.amenities || 'Baño privado, TV, Wi-Fi'
    };
    run(async () => {
      if (item) await api('PUT', `${hotelBase}/room-types/${item.id}`, body);
      else await api('POST', `${hotelBase}/room-types`, body);
      show('success', item ? 'Tipo de habitación actualizado.' : `"${body.name}" agregado.`);
      setRoomModal(null);
      await loadConfig();
    }, 'No se pudo guardar.');
  };

  /* -------------------- Cobros -------------------- */

  const addPm = (e: React.FormEvent) => {
    e.preventDefault();
    const name = pmName.trim();
    if (!name) return;
    run(async () => {
      await api('POST', `${hotelBase}/payment-methods`, { name, code: toCode(name), type: 'DIGITAL_WALLET', requires_reference: false });
      show('success', `"${name}" agregado.`);
      setPmOpen(false);
      setPmName('');
      await loadConfig();
    }, 'No se pudo agregar.');
  };

  const addTax = (e: React.FormEvent) => {
    e.preventDefault();
    const name = taxForm.name.trim();
    if (!name) {
      show('error', 'Escribe el nombre del impuesto.');
      return;
    }
    run(async () => {
      await api('POST', `${hotelBase}/taxes`, {
        name,
        code: toCode(name),
        percentage: Number(taxForm.percentage.replace(',', '.')) || 0,
        is_inclusive: taxForm.is_inclusive,
        applies_to: 'ALL'
      });
      show('success', `"${name}" agregado.`);
      setTaxOpen(false);
      await loadConfig();
    }, 'No se pudo agregar el impuesto.');
  };

  const toggleTax = (t: TaxItem) =>
    run(async () => {
      await api('PUT', `${hotelBase}/taxes/${t.id}`, { active: t.active ? 0 : 1 });
      await loadConfig();
    }, 'No se pudo cambiar.');

  const addDept = (e: React.FormEvent) => {
    e.preventDefault();
    const name = deptName.trim();
    if (!name) return;
    run(async () => {
      await api('POST', `${hotelBase}/departments`, { name, code: toCode(name), description: '' });
      setDeptName('');
      await loadConfig();
    }, 'No se pudo agregar el área.');
  };

  const askDelete = (label: string, url: string) =>
    setConfirmDelete({
      label,
      run: async () => {
        await api('DELETE', url);
        show('success', `"${label}" eliminado.`);
        await loadConfig();
      }
    });

  /* -------------------- Otro hotel -------------------- */

  const createHotel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHotel.name.trim()) {
      show('error', 'Escribe el nombre del hotel.');
      return;
    }
    run(async () => {
      const data = await api('POST', `${API_URL}/api/hotels`, {
        name: newHotel.name.trim(),
        legal_name: newHotel.name.trim(),
        city: newHotel.city.trim(),
        phone: newHotel.phone.trim(),
        currency: 'COP'
      });
      setNewHotelOpen(false);
      setNewHotel({ name: '', city: '', phone: '' });
      await refreshHotels();
      if (data.hotel?.id) setActiveHotelId(data.hotel.id);
      show('success', `✓ Hotel "${data.hotel?.name || ''}" creado.`);
    }, 'No se pudo crear el hotel.');
  };

  /* =======================================================================
     RENDER
  ======================================================================= */

  return (
    <div className="space-y-4 sm:space-y-5 pb-24">
      <ModuleHeader
        icon={<Settings className="w-5 h-5" />}
        iconColor="bg-slate-800"
        title={
          <>
            Configuración
            <span className="font-semibold text-slate-500 dark:text-slate-400"> · {hotelForm.name || 'Hotel'}</span>
          </>
        }
        subtitle="Los datos de tu hotel, precios y cobros"
        tabs={[
          { id: 'HOTEL', label: 'Mi hotel', short: 'Hotel', icon: <Building2 className="w-5 h-5 shrink-0" /> },
          { id: 'HABITACIONES', label: 'Habitaciones', short: 'Habitac.', icon: <BedDouble className="w-5 h-5 shrink-0" /> },
          { id: 'COBROS', label: 'Cobros', short: 'Cobros', icon: <CreditCard className="w-5 h-5 shrink-0" /> },
          { id: 'PANTALLA', label: 'Pantalla', short: 'Pantalla', icon: <Monitor className="w-5 h-5 shrink-0" /> }
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {msg && (
        <Notice tone={msg.type} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {/* Selector de hotel solo si administra más de uno */}
      {hotels.length > 1 && (
        <div className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${flat('sky', true)} rounded-2xl`}>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 shrink-0 inline-flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-700 dark:text-sky-300 shrink-0" />
            Estás configurando:
          </span>
          <select
            value={activeHotelId ?? ''}
            onChange={(e) => setActiveHotelId(Number(e.target.value))}
            className={`${INPUT} flex-1`}
          >
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className={`p-10 text-center text-sm font-semibold text-slate-500 ${SECTION('indigo')}`}>Cargando…</p>
      ) : (
        <>
          {/* =================================================================
              PESTAÑA 1: MI HOTEL
          ================================================================= */}
          {activeTab === 'HOTEL' && (
            <form onSubmit={saveHotel} className="space-y-4">
              <Panel accent="indigo" icon={<Building2 className="w-5 h-5 shrink-0" />} title="Datos del hotel" subtitle="Así aparece en recibos y reportes">
                <Field label="Nombre del hotel">
                  <input required value={hotelForm.name} onChange={(e) => setH('name', e.target.value)} className={INPUT} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Celular / WhatsApp">
                    <input inputMode="tel" value={hotelForm.phone} onChange={(e) => setH('phone', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Correo">
                    <input type="email" value={hotelForm.email} onChange={(e) => setH('email', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Dirección">
                    <input value={hotelForm.address} onChange={(e) => setH('address', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Ciudad">
                    <input value={hotelForm.city} onChange={(e) => setH('city', e.target.value)} className={INPUT} />
                  </Field>
                </div>
              </Panel>

              <Panel accent="amber" icon={<Clock className="w-5 h-5 shrink-0" />} title="Horarios" subtitle="A qué hora pueden entrar y hasta qué hora deben salir los huéspedes">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TimePicker
                    label="🔑 Hora de entrada"
                    value={hotelForm.check_in_time}
                    options={CHECKIN_TIMES}
                    onChange={(v) => setH('check_in_time', v)}
                  />
                  <TimePicker
                    label="🚪 Hora de salida"
                    value={hotelForm.check_out_time}
                    options={CHECKOUT_TIMES}
                    onChange={(v) => setH('check_out_time', v)}
                  />
                </div>
              </Panel>

              <Collapsible
                t="sky"
                icon={<FileText className="w-5 h-5 shrink-0" />}
                title="Datos para facturas (opcional)"
                hint="NIT, razón social y régimen"
                open={openInvoice}
                onToggle={() => setOpenInvoice((v) => !v)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Razón social">
                    <input value={hotelForm.legal_name} onChange={(e) => setH('legal_name', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="NIT">
                    <input value={hotelForm.tax_id} onChange={(e) => setH('tax_id', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Régimen">
                    <select value={hotelForm.tax_regime} onChange={(e) => setH('tax_regime', e.target.value)} className={INPUT}>
                      <option value="">No sé / No aplica</option>
                      {hotelForm.tax_regime &&
                        !['Responsable de IVA', 'No responsable de IVA', 'Régimen Simple'].includes(hotelForm.tax_regime) && (
                          <option value={hotelForm.tax_regime}>{hotelForm.tax_regime}</option>
                        )}
                      <option value="Responsable de IVA">Responsable de IVA</option>
                      <option value="No responsable de IVA">No responsable de IVA</option>
                      <option value="Régimen Simple">Régimen Simple</option>
                    </select>
                  </Field>
                  <Field label="Página web">
                    <input value={hotelForm.website} onChange={(e) => setH('website', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="RNT (Registro Nacional de Turismo)">
                    <input value={hotelForm.tra_code} onChange={(e) => setH('tra_code', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Código SIRE (Migración)">
                    <input value={hotelForm.sire_code} onChange={(e) => setH('sire_code', e.target.value)} className={INPUT} />
                  </Field>
                </div>
              </Collapsible>

              <Collapsible
                t="violet"
                icon={<ScrollText className="w-5 h-5 shrink-0" />}
                title="Reglas del hotel (opcional)"
                hint="Normas, cancelaciones y reservas"
                open={openRules}
                onToggle={() => setOpenRules((v) => !v)}
              >
                <Field label="Normas de la estadía">
                  <textarea
                    rows={3}
                    value={hotelForm.accommodation_policy}
                    onChange={(e) => setH('accommodation_policy', e.target.value)}
                    placeholder="Ej: No se permiten mascotas. Silencio después de las 10 p. m."
                    className={`${INPUT} h-auto py-3`}
                  />
                </Field>
                <Field label="Si cancelan">
                  <textarea
                    rows={2}
                    value={hotelForm.cancellation_policy}
                    onChange={(e) => setH('cancellation_policy', e.target.value)}
                    placeholder="Ej: Cancelando con 24 horas no se cobra."
                    className={`${INPUT} h-auto py-3`}
                  />
                </Field>
                <Field label="Para reservar">
                  <textarea
                    rows={2}
                    value={hotelForm.reservation_policy}
                    onChange={(e) => setH('reservation_policy', e.target.value)}
                    placeholder="Ej: Se aparta con el 50% del valor."
                    className={`${INPUT} h-auto py-3`}
                  />
                </Field>
              </Collapsible>

              <Collapsible
                t="slate"
                icon={<SlidersHorizontal className="w-5 h-5 shrink-0" />}
                title="Avanzado"
                hint="Áreas del hotel y otros hoteles"
                open={openAdvanced}
                onToggle={() => setOpenAdvanced((v) => !v)}
              >
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Áreas del hotel</p>
                  {departments.length === 0 ? (
                    <EmptyText>No hay áreas.</EmptyText>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {departments.map((d) => (
                        <span
                          key={d.id}
                          className="inline-flex items-center gap-1 h-10 pl-3.5 pr-1 rounded-full bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-sm font-bold text-slate-800 dark:text-slate-100"
                        >
                          {d.name}
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Quitar ${d.name}`}
                              onClick={() => askDelete(d.name, `${hotelBase}/departments/${d.id}`)}
                              className="w-8 h-8 rounded-full text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex gap-2">
                      <input
                        value={deptName}
                        onChange={(e) => setDeptName(e.target.value)}
                        placeholder="Nueva área, ej: Piscina"
                        className={`${INPUT} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={addDept}
                        className="h-12 px-4 rounded-xl bg-slate-700 hover:bg-slate-800 border-2 border-slate-700 text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar
                      </button>
                    </div>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setNewHotelOpen(true)}
                    className="w-full h-12 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-dashed border-slate-400 dark:border-slate-500 text-sm font-bold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-2 cursor-pointer hover:border-slate-600"
                  >
                    <Plus className="w-4 h-4" />
                    Tengo otro hotel / sede
                  </button>
                )}
              </Collapsible>

              {/* Botón fijo abajo, solo cuando hay cambios */}
              {canEdit && hotelChanged && (
                <div className="fixed bottom-4 left-4 right-4 md:left-[calc(17rem+2rem)] z-30 flex gap-2 max-w-3xl md:mx-auto">
                  <button
                    type="button"
                    onClick={() => setHotelForm(savedHotel)}
                    className="h-14 px-5 rounded-2xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 text-sm font-bold shadow-lg cursor-pointer"
                  >
                    Deshacer
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 h-14 rounded-2xl bg-emerald-700 hover:bg-emerald-800 border-2 border-emerald-800 text-white text-base font-black inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-60"
                  >
                    <Save className="w-5 h-5" />
                    {busy ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* =================================================================
              PESTAÑA 2: HABITACIONES Y PRECIOS
          ================================================================= */}
          {activeTab === 'HABITACIONES' && (
            <Panel
              accent="emerald"
              icon={<BedDouble className="w-5 h-5 shrink-0" />}
              title="Tipos de habitación y precios"
              subtitle="Ej: “Sencilla”, “Doble”, “Familiar”. El precio es el que se sugiere al hacer el check-in."
              actions={
                canEdit && (
                  <AddBtn color={SOLID.emerald} onClick={() => openRoom(null)}>
                    Agregar tipo
                  </AddBtn>
                )
              }
            >
              {roomTypes.length === 0 ? (
                <EmptyText>Aún no hay tipos de habitación.</EmptyText>
              ) : (
                <ul className="list-scroll grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roomTypes.map((rt) => (
                    <li key={rt.id} className={`rounded-2xl p-4 space-y-3 ${flat('emerald', true)}`}>
                      <div className="flex items-start gap-3">
                        <span className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                          <BedDouble className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-black text-slate-900 dark:text-white truncate">{rt.name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                            {rt.bed_config} · hasta {rt.capacity} persona{Number(rt.capacity) === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-slate-900 dark:text-white">{formatCOP(rt.base_price)}</p>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">por noche</p>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="grid grid-cols-2 gap-2">
                          <ActionBtn onClick={() => openRoom(rt)}>
                            <Edit3 className="w-4 h-4" />
                            Cambiar
                          </ActionBtn>
                          <ActionBtn danger onClick={() => askDelete(rt.name, `${hotelBase}/room-types/${rt.id}`)}>
                            <Trash2 className="w-4 h-4" />
                            Eliminar
                          </ActionBtn>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {/* =================================================================
              PESTAÑA 3: COBROS (formas de pago + impuestos)
          ================================================================= */}
          {activeTab === 'COBROS' && (
            <div className="space-y-4">
              <Panel
                accent="sky"
                title="¿Cómo te pueden pagar?"
                subtitle="Las formas de pago que aparecen al cobrar."
                icon={<CreditCard className="w-5 h-5 shrink-0" />}
                actions={
                  canEdit && (
                    <AddBtn
                      color={SOLID.sky}
                      onClick={() => {
                        setPmName('');
                        setPmOpen(true);
                      }}
                    >
                      Agregar
                    </AddBtn>
                  )
                }
              >
                {paymentMethods.length === 0 ? (
                  <EmptyText>No hay formas de pago.</EmptyText>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map((pm) => (
                      <span
                        key={pm.id}
                        className="inline-flex items-center gap-1 h-11 pl-4 pr-1 rounded-full bg-sky-100 dark:bg-sky-500/15 border-2 border-sky-400 dark:border-sky-500 text-sm font-bold text-slate-900 dark:text-white"
                      >
                        {pm.name}
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={`Quitar ${pm.name}`}
                            onClick={() => askDelete(pm.name, `${hotelBase}/payment-methods/${pm.id}`)}
                            className="w-8 h-8 rounded-full bg-white/95 dark:bg-slate-900 border border-rose-400 dark:border-rose-500 text-rose-700 dark:text-rose-300 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                accent="amber"
                icon={<Percent className="w-5 h-5 shrink-0" />}
                title="Impuestos"
                subtitle="Si no cobras impuestos, déjalos apagados."
                actions={
                  canEdit && (
                    <AddBtn
                      color={SOLID.amber}
                      onClick={() => {
                        setTaxForm({ name: '', percentage: '19', is_inclusive: true });
                        setTaxOpen(true);
                      }}
                    >
                      Agregar
                    </AddBtn>
                  )
                }
              >
                {taxes.length === 0 ? (
                  <EmptyText>No hay impuestos configurados.</EmptyText>
                ) : (
                  <ul className="list-scroll space-y-2.5">
                    {taxes.map((t) => (
                      <li
                        key={t.id}
                        className={`rounded-2xl p-3 sm:p-4 flex flex-wrap items-center gap-3 ${flat(t.active ? 'amber' : 'slate', true)}`}
                      >
                        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
                          <p className="text-base font-bold leading-snug text-slate-900 dark:text-white break-words">
                            {t.name} · {Number(t.percentage)}%
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {t.is_inclusive ? 'Ya va incluido en el precio' : 'Se suma al precio'}
                          </p>
                        </div>
                        <span className="flex items-center gap-2 shrink-0 mr-auto sm:mr-0">
                          <span className={`text-sm font-black ${t.active ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-500'}`}>
                            {t.active ? 'Se cobra' : 'Apagado'}
                          </span>
                          <Switch on={Boolean(t.active)} disabled={!canEdit || busy} onChange={() => toggleTax(t)} />
                        </span>
                        {canEdit && (
                          <ActionBtn danger onClick={() => askDelete(t.name, `${hotelBase}/taxes/${t.id}`)}>
                            <Trash2 className="w-4 h-4" />
                            Eliminar
                          </ActionBtn>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}

          {/* =================================================================
              PESTAÑA 4: PANTALLA
          ================================================================= */}
          {activeTab === 'PANTALLA' && (
            <Panel accent="violet" icon={<Monitor className="w-5 h-5 shrink-0" />} title="¿Cómo quieres ver la pantalla?">
              <div className="grid grid-cols-2 gap-3">
                <ThemeCard
                  on={theme === 'light'}
                  onClick={() => setTheme('light')}
                  icon={<Sun className="w-8 h-8" />}
                  title="Clara"
                  hint="Mejor de día"
                  preview="bg-white border-slate-200"
                />
                <ThemeCard
                  on={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                  icon={<Moon className="w-8 h-8" />}
                  title="Oscura"
                  hint="Cansa menos de noche"
                  preview="bg-slate-900 border-slate-700"
                />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Esto solo cambia en este computador o celular.</p>
            </Panel>
          )}
        </>
      )}

      {/* =====================================================================
          VENTANAS
      ===================================================================== */}
      {roomModal && (
        <Modal
          color="bg-slate-800"
          icon={<BedDouble className="w-6 h-6" />}
          title={roomModal.item ? 'Cambiar tipo de habitación' : 'Nuevo tipo de habitación'}
          onClose={() => setRoomModal(null)}
          onSubmit={saveRoom}
          footer={
            <>
              <SecondaryBtn onClick={() => setRoomModal(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-slate-800 hover:bg-slate-900">Guardar</PrimaryBtn>
            </>
          }
        >
          <Field label="Nombre">
            <input
              required
              autoFocus
              value={roomForm.name}
              onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Doble, Familiar, Suite…"
              className={INPUT}
            />
          </Field>
          <Field label="Precio por noche">
            <MoneyInput value={roomForm.base_price} onChange={(v) => setRoomForm((f) => ({ ...f, base_price: v }))} required big />
          </Field>
          <Field label="¿Cuántas personas caben?">
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRoomForm((f) => ({ ...f, capacity: n }))}
                  className={`h-12 rounded-xl border-2 text-base font-black cursor-pointer ${
                    roomForm.capacity === n
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Camas">
            <div className="flex flex-wrap gap-2">
              {BEDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setRoomForm((f) => ({ ...f, bed_config: b }))}
                  className={`h-10 px-3 rounded-xl border-2 text-sm font-bold cursor-pointer ${
                    roomForm.bed_config === b
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </Field>
        </Modal>
      )}

      {pmOpen && (
        <Modal
          color="bg-slate-800"
          icon={<CreditCard className="w-6 h-6" />}
          title="Nueva forma de pago"
          onClose={() => setPmOpen(false)}
          onSubmit={addPm}
          footer={
            <>
              <SecondaryBtn onClick={() => setPmOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-slate-800 hover:bg-slate-900">Agregar</PrimaryBtn>
            </>
          }
        >
          <Field label="Nombre">
            <input
              required
              autoFocus
              value={pmName}
              onChange={(e) => setPmName(e.target.value)}
              placeholder="Ej: Daviplata, Bancolombia…"
              className={INPUT}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {['Nequi', 'Daviplata', 'Bancolombia', 'Transferencia', 'Tarjeta']
              .filter((s) => !paymentMethods.some((p) => p.name.toLowerCase() === s.toLowerCase()))
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPmName(s)}
                  className="h-10 px-4 rounded-full bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer hover:border-slate-600"
                >
                  {s}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {taxOpen && (
        <Modal
          color="bg-slate-800"
          icon={<CreditCard className="w-6 h-6" />}
          title="Nuevo impuesto"
          onClose={() => setTaxOpen(false)}
          onSubmit={addTax}
          footer={
            <>
              <SecondaryBtn onClick={() => setTaxOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-slate-800 hover:bg-slate-900">Agregar</PrimaryBtn>
            </>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Nombre">
                <input
                  required
                  autoFocus
                  value={taxForm.name}
                  onChange={(e) => setTaxForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: IVA"
                  className={INPUT}
                />
              </Field>
            </div>
            <Field label="Porcentaje">
              <input
                inputMode="decimal"
                value={taxForm.percentage}
                onChange={(e) => setTaxForm((f) => ({ ...f, percentage: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>
          <Field label="¿El precio ya lo incluye?">
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: true, label: 'Sí, ya está incluido' },
                { v: false, label: 'No, se suma aparte' }
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setTaxForm((f) => ({ ...f, is_inclusive: o.v }))}
                  className={`min-h-12 px-2 rounded-xl border-2 text-sm font-bold cursor-pointer ${
                    taxForm.is_inclusive === o.v
                      ? 'bg-slate-800 border-slate-800 text-white'
                      : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
        </Modal>
      )}

      {newHotelOpen && (
        <Modal
          color="bg-slate-800"
          icon={<Building2 className="w-6 h-6" />}
          title="Agregar otro hotel"
          subtitle="Tendrá sus propias habitaciones, caja e inventario"
          onClose={() => setNewHotelOpen(false)}
          onSubmit={createHotel}
          footer={
            <>
              <SecondaryBtn onClick={() => setNewHotelOpen(false)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-slate-800 hover:bg-slate-900">Crear hotel</PrimaryBtn>
            </>
          }
        >
          <Field label="Nombre del hotel">
            <input
              required
              autoFocus
              value={newHotel.name}
              onChange={(e) => setNewHotel((f) => ({ ...f, name: e.target.value }))}
              className={INPUT}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciudad">
              <input value={newHotel.city} onChange={(e) => setNewHotel((f) => ({ ...f, city: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Celular">
              <input
                inputMode="tel"
                value={newHotel.phone}
                onChange={(e) => setNewHotel((f) => ({ ...f, phone: e.target.value }))}
                className={INPUT}
              />
            </Field>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          color="bg-rose-700"
          icon={<Trash2 className="w-6 h-6" />}
          title="¿Eliminar?"
          subtitle={confirmDelete.label}
          onClose={() => setConfirmDelete(null)}
          onSubmit={(e) => {
            e.preventDefault();
            const c = confirmDelete;
            run(async () => {
              await c.run();
              setConfirmDelete(null);
            }, 'No se pudo eliminar.');
          }}
          footer={
            <>
              <SecondaryBtn onClick={() => setConfirmDelete(null)}>Cancelar</SecondaryBtn>
              <PrimaryBtn color="bg-rose-600 hover:bg-rose-700">Sí, eliminar</PrimaryBtn>
            </>
          }
        >
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Vas a eliminar <b>{confirmDelete.label}</b>. Esto no se puede deshacer.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   COMPONENTES PEQUEÑOS
========================================================================= */

function TimePicker({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const suffix = h < 12 ? 'a. m.' : 'p. m.';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`h-12 rounded-xl border-2 text-sm font-bold cursor-pointer ${
              value === t
                ? 'bg-slate-800 border-slate-800 text-white'
                : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
            }`}
          >
            {fmt(t)}
          </button>
        ))}
      </div>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} aria-label={`${label} (otra hora)`} />
    </div>
  );
}

function Collapsible({
  t,
  icon,
  title,
  hint,
  open,
  onToggle,
  children
}: {
  t: Tone;
  icon: React.ReactNode;
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={SECTION(t)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 text-left cursor-pointer ${
          open ? SECTION_HEAD(t) : 'px-4 sm:px-5 py-3.5'
        }`}
      >
        <span className={`head-icon w-10 h-10 rounded-xl ${SOLID[t]} text-white flex items-center justify-center shrink-0`}>{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-black text-slate-900 dark:text-white">{title}</span>
          <span className="block text-sm text-slate-600 dark:text-slate-300">{hint}</span>
        </span>
        <span className="h-9 px-3 rounded-lg bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 text-xs font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1 shrink-0">
          {open ? 'Ocultar' : 'Abrir'}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="p-4 sm:p-5 space-y-4">{children}</div>}
    </section>
  );
}

function Switch({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-16 h-9 rounded-full shrink-0 cursor-pointer disabled:opacity-50 transition-colors ${
        on ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-7' : ''}`}
      />
      <span className="sr-only">{on ? 'Encendido' : 'Apagado'}</span>
    </button>
  );
}

/** Botón de acción con texto (Cambiar / Eliminar). */
function ActionBtn({
  onClick,
  danger = false,
  children
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-3 rounded-xl border-2 text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer bg-white/95 dark:bg-slate-900 ${
        danger
          ? 'border-rose-500 dark:border-rose-500 text-rose-700 dark:text-rose-300 hover:border-rose-700'
          : 'border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600'
      }`}
    >
      {children}
    </button>
  );
}

/** Botón "Agregar" del encabezado de cada sección, en el color de la sección. */
function AddBtn({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={HEAD_BTN}
    >
      <Plus className="w-4 h-4 shrink-0" />
      {children}
    </button>
  );
}

function ThemeCard({
  on,
  onClick,
  icon,
  title,
  hint,
  preview
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  preview: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`relative p-4 rounded-2xl border-2 text-left space-y-3 cursor-pointer ${
        on
          ? 'bg-emerald-100 dark:bg-emerald-500/15 border-emerald-600 ring-2 ring-emerald-600'
          : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 hover:border-slate-600'
      }`}
    >
      {on && (
        <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center">
          <Check className="w-4 h-4" />
        </span>
      )}
      <div className={`h-20 rounded-xl border flex items-center justify-center ${preview} ${on ? '' : ''}`}>
        <span className={title === 'Oscura' ? 'text-slate-200' : 'text-amber-500'}>{icon}</span>
      </div>
      <div>
        <p className="text-base font-black text-slate-900 dark:text-white">
          {title}
          {on && <span className="ml-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">· En uso</span>}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{hint}</p>
      </div>
    </button>
  );
}
