import React, { useState, useEffect } from 'react';
import {
  Bell,
  MessageSquare,
  Send,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
  RefreshCw,
  Search,
  CheckCheck,
  Smartphone,
  Mail,
  Sliders,
  Filter
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';

interface NotificationItem {
  id: number;
  category: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'URGENTE';
  action_url?: string;
  read_at?: string;
  created_at: string;
}

interface MessageTemplate {
  id: number;
  code: string;
  channel: 'WHATSAPP' | 'EMAIL';
  title: string;
  body_template: string;
  variables_json?: string;
  active: number;
}

interface OutboxItem {
  id: number;
  channel: string;
  recipient: string;
  recipient_name?: string;
  template_code: string;
  message_body: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

export default function Notificaciones() {
  const { activeHotelId, activeHotel, hasPermission } = useHotel();

  const [activeTab, setActiveTab] = useState<'centro' | 'enviar' | 'plantillas' | 'outbox' | 'integracion'>('centro');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Estado Centro de Notificaciones
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Estado Plantillas
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  // Estado Redacción / Envío
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>('CONFIRMACION_RESERVA');
  const [selectedChannel, setSelectedChannel] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [directWaUrl, setDirectWaUrl] = useState<string | null>(null);
  const [hasOfficialApi, setHasOfficialApi] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Estado Outbox
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);

  // Estado Integración WhatsApp / SMTP
  const [configForm, setConfigForm] = useState({
    whatsapp_phone_number_id: '',
    whatsapp_access_token: '',
    whatsapp_business_account_id: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    smtp_from_email: '',
    smtp_secure: false
  });

  const token = localStorage.getItem('token');
  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const loadNotifications = async () => {
    if (!activeHotelId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filterSeverity) q.append('severity', filterSeverity);
      if (filterCategory) q.append('category', filterCategory);
      if (onlyUnread) q.append('unreadOnly', 'true');

      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications?${q.toString()}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
        setUrgentCount(data.urgent_count || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    if (!activeHotelId) return;
    try {
      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/templates`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadOutbox = async () => {
    if (!activeHotelId) return;
    try {
      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/outbox`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setOutbox(data.messages || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadNotifications();
    loadTemplates();
    loadOutbox();
  }, [activeHotelId, filterSeverity, filterCategory, onlyUnread]);

  // Escanear alertas automáticas
  const handleScanAlerts = async () => {
    setScanning(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/scan-alerts`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'ok',
          text: `Escaneo completado. Se generaron ${data.new_alerts_created || 0} nuevas alertas operativas.`
        });
        loadNotifications();
      } else {
        setFeedback({ type: 'err', text: data.error || 'Error al escanear' });
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e.message });
    } finally {
      setScanning(false);
    }
  };

  // Marcar individual leída
  const handleMarkRead = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeaders
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      console.error(e);
    }
  };

  // Marcar todas leídas
  const handleMarkAllRead = async () => {
    try {
      await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/mark-all-read`, {
        method: 'POST',
        headers: authHeaders
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
      setUnreadCount(0);
      setUrgentCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  // Preparar mensaje dinámico
  const handlePrepareMessage = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/prepare-guest-message`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          templateCode: selectedTemplateCode,
          channel: selectedChannel,
          customPhone: recipientPhone,
          customRecipient: recipientName
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessageBody(data.message_body);
        setDirectWaUrl(data.direct_whatsapp_url);
        setHasOfficialApi(Boolean(data.has_official_cloud_api));
        setFeedback({ type: 'ok', text: 'Plantilla procesada y mensaje preparado.' });
      } else {
        setFeedback({ type: 'err', text: data.error || 'Error al preparar plantilla' });
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Despachar mensaje
  const handleSendMessage = async (viaCloudApi: boolean = false) => {
    if (!recipientPhone || !messageBody) {
      setFeedback({ type: 'err', text: 'Indique el número de teléfono/correo y el contenido del mensaje.' });
      return;
    }
    setDispatching(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/send-guest-message`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          channel: selectedChannel,
          recipient: recipientPhone,
          recipientName,
          templateCode: selectedTemplateCode,
          messageBody,
          sendViaCloudApi: viaCloudApi
        })
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'ok',
          text: `Mensaje despachado a la bandeja de salida (ID: ${data.outbox_id}).`
        });
        if (data.direct_whatsapp_url && !viaCloudApi) {
          window.open(data.direct_whatsapp_url, '_blank');
        }
        loadOutbox();
      } else {
        setFeedback({ type: 'err', text: data.error || 'Error al despachar mensaje.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e.message });
    } finally {
      setDispatching(false);
    }
  };

  // Guardar edición de plantilla
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/hotels/${activeHotelId}/notifications/templates/${editingTemplate.id}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            title: editingTemplate.title,
            body_template: editingTemplate.body_template,
            active: editingTemplate.active
          })
        }
      );
      if (res.ok) {
        setFeedback({ type: 'ok', text: 'Plantilla de mensaje guardada correctamente.' });
        setEditingTemplate(null);
        loadTemplates();
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  // Guardar configuración de WhatsApp y SMTP
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_URL}/api/hotels/${activeHotelId}/notifications/config/messaging`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(configForm)
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: 'ok', text: 'Credenciales de mensajería actualizadas con éxito.' });
      } else {
        setFeedback({ type: 'err', text: data.error || 'Error al guardar credenciales.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Centro de Notificaciones y Automatizaciones
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeHotel?.name || 'Sede Hotel'} · Alertas operativas, motor de plantillas y mensajería oficial
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleScanAlerts}
            disabled={scanning}
            className="flex items-center space-x-2 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Escaneando...' : 'Escanear Alertas'}</span>
          </button>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar todas leídas ({unreadCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500'
              : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="underline ml-4">
            Cerrar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('centro')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 shrink-0 ${
            activeTab === 'centro'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Avisos Internos</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-rose-500 text-white">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('enviar')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 shrink-0 ${
            activeTab === 'enviar'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Enviar Mensaje Huésped</span>
        </button>

        <button
          onClick={() => setActiveTab('plantillas')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 shrink-0 ${
            activeTab === 'plantillas'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Plantillas ({templates.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('outbox')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 shrink-0 ${
            activeTab === 'outbox'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Buzón de Salida ({outbox.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('integracion')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 shrink-0 ${
            activeTab === 'integracion'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Integración WhatsApp / SMTP</span>
        </button>
      </div>

      {/* TAB 1: CENTRO DE NOTIFICACIONES */}
      {activeTab === 'centro' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
            <span className="font-semibold text-slate-500">Filtrar:</span>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            >
              <option value="">Todas las severidades</option>
              <option value="URGENTE">Urgentes</option>
              <option value="WARNING">Advertencias</option>
              <option value="INFO">Informativas</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            >
              <option value="">Todas las categorías</option>
              <option value="OPERACION">Operación</option>
              <option value="RESERVAS">Reservas</option>
              <option value="LIMPIEZA">Limpieza</option>
              <option value="MANTENIMIENTO">Mantenimiento</option>
              <option value="INVENTARIO">Inventario</option>
              <option value="FINANZAS">Finanzas / Caja</option>
            </select>

            <label className="flex items-center space-x-1.5 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => setOnlyUnread(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">Solo no leídas</span>
            </label>
          </div>

          {/* Listado */}
          {notifications.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
              <p className="font-semibold">¡Todo al día en el hotel!</p>
              <p className="text-xs mt-1">No hay notificaciones activas con los filtros actuales.</p>
            </div>
          ) : (
            <div className="list-scroll space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                    n.read_at
                      ? 'bg-white/60 dark:bg-slate-900/60 border-slate-150 dark:border-slate-800/80 opacity-75'
                      : n.severity === 'URGENTE'
                      ? 'bg-rose-50/80 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/70 shadow-xs'
                      : n.severity === 'WARNING'
                      ? 'bg-amber-50/80 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/70'
                      : 'bg-white dark:bg-slate-900 border-indigo-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div
                      className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        n.severity === 'URGENTE'
                          ? 'bg-rose-500 text-white'
                          : n.severity === 'WARNING'
                          ? 'bg-amber-500 text-white'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {n.severity === 'URGENTE' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : n.severity === 'WARNING' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {n.category}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {n.title}
                        </span>
                        {!n.read_at && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                      <span className="text-[10px] text-slate-400 mt-2 block">
                        {new Date(n.created_at).toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {n.action_url && (
                      <a
                        href={n.action_url}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center space-x-1"
                      >
                        <span>Ver</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {!n.read_at && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                        title="Marcar como leída"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ENVIAR MENSAJE A HUÉSPED */}
      {activeTab === 'enviar' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Canal de Envío
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedChannel('WHATSAPP')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 ${
                    selectedChannel === 'WHATSAPP'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedChannel('EMAIL')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 ${
                    selectedChannel === 'EMAIL'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span>Correo / Email</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Plantilla Base
              </label>
              <select
                value={selectedTemplateCode}
                onChange={(e) => setSelectedTemplateCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              >
                <option value="CONFIRMACION_RESERVA">Confirmación de Reserva</option>
                <option value="RECORDATORIO_CHECKIN">Recordatorio de Check-in Hoy</option>
                <option value="AVISO_CHECKOUT">Aviso de Check-out</option>
                <option value="BIENVENIDA_HUESPED">Bienvenida al Huésped</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Huésped
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Ej. Andrés Pérez"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {selectedChannel === 'WHATSAPP' ? 'Número WhatsApp (con código de país)' : 'Correo Electrónico'}
              </label>
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder={selectedChannel === 'WHATSAPP' ? 'Ej. 573222067870' : 'huesped@gmail.com'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrepareMessage}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
          >
            Preparar Contenido con Plantilla
          </button>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Contenido del Mensaje
            </label>
            <textarea
              rows={5}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="El mensaje preparado aparecerá aquí..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
            />
          </div>

          {/* Opciones de despacho */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {selectedChannel === 'WHATSAPP' && (
              <button
                type="button"
                onClick={() => handleSendMessage(false)}
                disabled={dispatching}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
              >
                <Smartphone className="w-4 h-4" />
                <span>Abrir WhatsApp con 1 Clic (wa.me)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSendMessage(true)}
              disabled={dispatching}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>
                {selectedChannel === 'WHATSAPP'
                  ? 'Enviar por Cloud API Oficial Meta'
                  : 'Enviar por Correo SMTP'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: PLANTILLAS */}
      {activeTab === 'plantillas' && (
        <div className="space-y-4">
          <div className="list-scroll grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-black rounded-md ${
                        tpl.channel === 'WHATSAPP'
                          ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {tpl.channel}
                    </span>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">{tpl.title}</h3>
                  </div>
                  <button
                    onClick={() => setEditingTemplate(tpl)}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Editar
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {tpl.body_template}
                </div>

                <div className="text-[10px] text-slate-400">
                  Código: <code className="font-bold">{tpl.code}</code> · Variables: {tpl.variables_json}
                </div>
              </div>
            ))}
          </div>

          {/* Modal Edición de Plantilla */}
          {editingTemplate && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Editar Plantilla: {editingTemplate.code} ({editingTemplate.channel})
                </h3>

                <div>
                  <label className="block text-xs font-bold mb-1">Título de Referencia</label>
                  <input
                    type="text"
                    value={editingTemplate.title}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, title: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Cuerpo del Mensaje</label>
                  <textarea
                    rows={6}
                    value={editingTemplate.body_template}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, body_template: e.target.value })
                    }
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={loading}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: HISTORIAL DE SALIDA (OUTBOX) */}
      {activeTab === 'outbox' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Registro de Mensajes Enviados y Encolados
            </h3>
            <button
              onClick={loadOutbox}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center space-x-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </button>
          </div>

          {outbox.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No se han registrado mensajes en el buzón de salida aún.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">Destinatario</th>
                    <th className="p-3">Plantilla</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Mensaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {outbox.map((msg) => (
                    <tr key={msg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 whitespace-nowrap text-slate-400">
                        {new Date(msg.created_at).toLocaleString('es-CO')}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black rounded-md ${
                            msg.channel === 'WHATSAPP'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
                          }`}
                        >
                          {msg.channel}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">
                        {msg.recipient_name ? `${msg.recipient_name} (${msg.recipient})` : msg.recipient}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">{msg.template_code}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black rounded-md ${
                            msg.status === 'ENVIADO'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : msg.status === 'FALLIDO'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                          }`}
                        >
                          {msg.status}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                        {msg.message_body}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: INTEGRACIÓN OFICIAL */}
      {activeTab === 'integracion' && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-6 max-w-4xl"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>WhatsApp Business Cloud API (Meta Oficial)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure las credenciales de su aplicación Meta for Developers para envíos automatizados desde el servidor. Si no las tiene activas, siempre podrá utilizar el envío directo 1-clic con wa.me.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">Phone Number ID</label>
              <input
                type="text"
                value={configForm.whatsapp_phone_number_id}
                onChange={(e) =>
                  setConfigForm({ ...configForm, whatsapp_phone_number_id: e.target.value })
                }
                placeholder="Ej. 109876543210987"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">WhatsApp Business Account ID</label>
              <input
                type="text"
                value={configForm.whatsapp_business_account_id}
                onChange={(e) =>
                  setConfigForm({ ...configForm, whatsapp_business_account_id: e.target.value })
                }
                placeholder="Ej. 98765432109876"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1">Permanent Access Token</label>
              <input
                type="password"
                value={configForm.whatsapp_access_token}
                onChange={(e) =>
                  setConfigForm({ ...configForm, whatsapp_access_token: e.target.value })
                }
                placeholder="EAA..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>Servidor de Correo Saliente SMTP</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configuración de envío de correos (Gmail, Outlook o hosting privado).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">Host SMTP</label>
              <input
                type="text"
                value={configForm.smtp_host}
                onChange={(e) => setConfigForm({ ...configForm, smtp_host: e.target.value })}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Puerto SMTP</label>
              <input
                type="number"
                value={configForm.smtp_port}
                onChange={(e) =>
                  setConfigForm({ ...configForm, smtp_port: Number(e.target.value) })
                }
                placeholder="587"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Usuario / Email</label>
              <input
                type="text"
                value={configForm.smtp_user}
                onChange={(e) => setConfigForm({ ...configForm, smtp_user: e.target.value })}
                placeholder="reservas@mihotel.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Contraseña SMTP</label>
              <input
                type="password"
                value={configForm.smtp_pass}
                onChange={(e) => setConfigForm({ ...configForm, smtp_pass: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold mb-1">Remitente (From)</label>
              <input
                type="text"
                value={configForm.smtp_from_email}
                onChange={(e) => setConfigForm({ ...configForm, smtp_from_email: e.target.value })}
                placeholder="Hotel La Dorada <reservas@mihotel.com>"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
          >
            Guardar Credenciales
          </button>
        </form>
      )}
    </div>
  );
}

