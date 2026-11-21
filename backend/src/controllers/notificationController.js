const db = require('../config/db');
const MessageDeliveryService = require('../services/notificationService');
const { getTodayString } = require('../utils/date');

/**
 * Controlador de Notificaciones y Automatizaciones (Bloque 14 - Módulo 14)
 */

// Helper para crear una notificación interna de forma atómica y segura
const createInternalNotification = async ({
  hotelId,
  userId = null,
  category = 'OPERACION',
  title,
  message,
  severity = 'INFO',
  actionUrl = null
}) => {
  const nowIso = new Date().toISOString();
  try {
    const res = await db.run(
      `INSERT INTO notification_center (
        hotel_id, user_id, category, title, message, severity, action_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [hotelId, userId, category, title, message, severity, actionUrl, nowIso]
    );
    return res.id;
  } catch (err) {
    console.error('Error al insertar notificación interna:', err.message);
    return null;
  }
};

/**
 * 1. Obtener lista de notificaciones internas con filtros y resumen de contadores
 */
const getNotifications = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const userId = req.user ? req.user.id : null;
    const { category, severity, unreadOnly, limit = 50 } = req.query;

    let sql = `
      SELECT n.*, u.full_name as target_user_name
      FROM notification_center n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.hotel_id = ?
        AND (n.user_id IS NULL OR n.user_id = ?)
    `;
    const params = [hotelId, userId];

    if (category) {
      sql += ' AND n.category = ?';
      params.push(category);
    }
    if (severity) {
      sql += ' AND n.severity = ?';
      params.push(severity);
    }
    if (unreadOnly === 'true' || unreadOnly === '1') {
      sql += ' AND n.read_at IS NULL';
    }

    sql += ' ORDER BY n.id DESC LIMIT ?';
    params.push(Math.min(Number(limit) || 50, 100));

    const notifications = await db.query(sql, params);

    // Contadores de resumen
    const unreadCountRow = await db.get(
      `SELECT COUNT(*) as c FROM notification_center
       WHERE hotel_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL`,
      [hotelId, userId]
    );

    const urgentCountRow = await db.get(
      `SELECT COUNT(*) as c FROM notification_center
       WHERE hotel_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL AND severity = 'URGENTE'`,
      [hotelId, userId]
    );

    res.json({
      notifications,
      unread_count: Number(unreadCountRow?.c || 0),
      urgent_count: Number(urgentCountRow?.c || 0)
    });
  } catch (error) {
    console.error('Error al consultar notificaciones:', error);
    res.status(500).json({ error: 'Error al consultar notificaciones internas.' });
  }
};

/**
 * 2. Marcar una notificación específica como leída
 */
const markAsRead = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { id } = req.params;
    const nowIso = new Date().toISOString();

    const notif = await db.get('SELECT * FROM notification_center WHERE id = ? AND hotel_id = ?', [id, hotelId]);
    if (!notif) {
      return res.status(404).json({ error: 'Notificación no encontrada o no pertenece a este hotel.' });
    }

    await db.run('UPDATE notification_center SET read_at = ? WHERE id = ?', [nowIso, id]);

    res.json({ message: 'Notificación marcada como leída.', read_at: nowIso });
  } catch (error) {
    console.error('Error al marcar notificación leída:', error);
    res.status(500).json({ error: 'Error al actualizar estado de la notificación.' });
  }
};

/**
 * 3. Marcar todas las notificaciones del hotel como leídas
 */
const markAllAsRead = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const userId = req.user ? req.user.id : null;
    const nowIso = new Date().toISOString();

    await db.run(
      `UPDATE notification_center
       SET read_at = ?
       WHERE hotel_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL`,
      [nowIso, hotelId, userId]
    );

    res.json({ message: 'Todas las notificaciones fueron marcadas como leídas.', read_at: nowIso });
  } catch (error) {
    console.error('Error al marcar todas leídas:', error);
    res.status(500).json({ error: 'Error al actualizar notificaciones.' });
  }
};

/**
 * 4. Escáner y generador automático de avisos operativos del hotel
 * Examina: check-ins del día, habitaciones pendientes de aseo, tickets de mantenimiento urgentes,
 * stock mínimo de insumos y cajas que lleven más de 24h abiertas sin cerrar.
 */
const scanOperationalAlerts = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    let generatedCount = 0;

    // A. Llegadas programadas hoy no recibidas
    const pendingArrivals = await db.query(
      `SELECT r.id, COALESCE(r.code, 'RES-' || r.id) as reservation_code,
              (g.first_name || ' ' || COALESCE(g.last_name, '')) as guest_name,
              rm.number as room_number
       FROM reservations r
       JOIN guests g ON r.guest_id = g.id
       LEFT JOIN reservation_rooms rr ON rr.reservation_id = r.id
       LEFT JOIN rooms rm ON rr.room_id = rm.id
       WHERE r.hotel_id = ? AND r.check_in_expected = ? AND r.status IN ('CONFIRMADA', 'PENDIENTE')`,
      [hotelId, today]
    );

    for (const arr of pendingArrivals) {
      const exists = await db.get(
        `SELECT id FROM notification_center WHERE hotel_id = ? AND category = 'RESERVAS' AND action_url = ?`,
        [hotelId, `/reservas?code=${arr.reservation_code}`]
      );
      if (!exists) {
        await createInternalNotification({
          hotelId,
          category: 'RESERVAS',
          title: `Llegada hoy: ${arr.guest_name}`,
          message: `Reserva ${arr.reservation_code} confirmada para hoy en hab. ${arr.room_number || 'por asignar'}.`,
          severity: 'INFO',
          actionUrl: `/reservas?code=${arr.reservation_code}`
        });
        generatedCount++;
      }
    }

    // B. Habitaciones pendientes de limpieza
    const dirtyRooms = await db.query(
      `SELECT id, number, status FROM rooms WHERE hotel_id = ? AND status IN ('SUCIA', 'PENDIENTE_LIMPIEZA')`,
      [hotelId]
    );
    if (dirtyRooms.length > 0) {
      const roomList = dirtyRooms.map((r) => r.number).slice(0, 5).join(', ');
      const title = `Aseo requerido: ${dirtyRooms.length} habitaciones sucias`;
      const exists = await db.get(
        `SELECT id FROM notification_center WHERE hotel_id = ? AND category = 'LIMPIEZA' AND title = ? AND read_at IS NULL`,
        [hotelId, title]
      );
      if (!exists) {
        await createInternalNotification({
          hotelId,
          category: 'LIMPIEZA',
          title,
          message: `Habitaciones que requieren aseo inmediato: ${roomList}${dirtyRooms.length > 5 ? '...' : ''}.`,
          severity: dirtyRooms.length >= 3 ? 'WARNING' : 'INFO',
          actionUrl: '/limpieza'
        });
        generatedCount++;
      }
    }

    // C. Mantenimientos urgentes o bloqueos activos
    const urgentTickets = await db.query(
      `SELECT mt.id, COALESCE(mt.ticket_number, 'TCK-' || mt.id) as ticket_code, mt.title, rm.number as room_number
       FROM maintenance_tickets mt
       LEFT JOIN rooms rm ON mt.room_id = rm.id
       WHERE mt.hotel_id = ? AND mt.status IN ('ABIERTO', 'EN_PROCESO') AND mt.priority = 'URGENTE'`,
      [hotelId]
    );
    for (const t of urgentTickets) {
      const exists = await db.get(
        `SELECT id FROM notification_center WHERE hotel_id = ? AND category = 'MANTENIMIENTO' AND action_url = ?`,
        [hotelId, `/mantenimiento?ticket=${t.ticket_code}`]
      );
      if (!exists) {
        await createInternalNotification({
          hotelId,
          category: 'MANTENIMIENTO',
          title: `Mantenimiento Urgente: Hab. ${t.room_number || 'General'}`,
          message: `${t.ticket_code}: ${t.title}`,
          severity: 'URGENTE',
          actionUrl: `/mantenimiento?ticket=${t.ticket_code}`
        });
        generatedCount++;
      }
    }

    // D. Insumos bajo punto de reorden / stock mínimo
    const lowStock = await db.query(
      `SELECT sku, name, stock, min_stock, unit FROM inventory_products
       WHERE hotel_id = ? AND active = 1 AND stock <= min_stock LIMIT 5`,
      [hotelId]
    );
    if (lowStock.length > 0) {
      const names = lowStock.map((p) => `${p.name} (${p.stock} ${p.unit})`).join(', ');
      const exists = await db.get(
        `SELECT id FROM notification_center WHERE hotel_id = ? AND category = 'INVENTARIO' AND read_at IS NULL`,
        [hotelId]
      );
      if (!exists) {
        await createInternalNotification({
          hotelId,
          category: 'INVENTARIO',
          title: `Alerta de Stock Mínimo (${lowStock.length} productos)`,
          message: `Insumos críticos por agotar: ${names}.`,
          severity: 'WARNING',
          actionUrl: '/inventario'
        });
        generatedCount++;
      }
    }

    // E. Cajas abiertas
    const openRegisters = await db.query(
      `SELECT cr.id, cr.name, cr.opening_time, u.full_name as cashier
       FROM cash_registers cr
       LEFT JOIN users u ON cr.user_id = u.id
       WHERE cr.hotel_id = ? AND cr.status = 'ABIERTA'`,
      [hotelId]
    );
    for (const reg of openRegisters) {
      // Si fue abierta antes de hoy, alertar
      if (reg.opening_time && !reg.opening_time.startsWith(today)) {
        const title = `Caja ${reg.name || 'Principal'} abierta desde día anterior`;
        const exists = await db.get(
          `SELECT id FROM notification_center WHERE hotel_id = ? AND category = 'FINANZAS' AND title = ? AND read_at IS NULL`,
          [hotelId, title]
        );
        if (!exists) {
          await createInternalNotification({
            hotelId,
            category: 'FINANZAS',
            title,
            message: `La caja operada por ${reg.cashier || 'Cajero'} fue abierta el ${reg.opening_time} y requiere cierre/arqueo.`,
            severity: 'WARNING',
            actionUrl: '/caja'
          });
          generatedCount++;
        }
      }
    }

    res.json({
      message: 'Escaneo de alertas operativas finalizado.',
      new_alerts_created: generatedCount
    });
  } catch (error) {
    console.error('Error al escanear alertas operativas:', error);
    res.status(500).json({ error: 'Error al escanear alertas del hotel.' });
  }
};

/**
 * 5. Crear notificación manual interna (Ej. broadcast del administrador o novedades)
 */
const createNotification = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { category, title, message, severity, action_url, user_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Título y mensaje son obligatorios.' });
    }

    const id = await createInternalNotification({
      hotelId,
      userId: user_id ? Number(user_id) : null,
      category: category || 'GENERAL',
      title: title.trim(),
      message: message.trim(),
      severity: severity || 'INFO',
      actionUrl: action_url || null
    });

    const created = await db.get('SELECT * FROM notification_center WHERE id = ?', [id]);
    res.status(201).json({ message: 'Notificación creada exitosamente.', notification: created });
  } catch (error) {
    console.error('Error al crear notificación manual:', error);
    res.status(500).json({ error: 'Error al registrar notificación.' });
  }
};

/**
 * 6. Gestión de Plantillas de Mensajes (Listar, Guardar/Actualizar)
 */
const getTemplates = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const templates = await db.query(
      `SELECT * FROM message_templates WHERE hotel_id = ? ORDER BY code ASC, channel ASC`,
      [hotelId]
    );

    res.json({ templates });
  } catch (error) {
    console.error('Error al consultar plantillas:', error);
    res.status(500).json({ error: 'Error al listar plantillas de mensajería.' });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { templateId } = req.params;
    const { title, body_template, active } = req.body;

    const existing = await db.get('SELECT * FROM message_templates WHERE id = ? AND hotel_id = ?', [templateId, hotelId]);
    if (!existing) {
      return res.status(404).json({ error: 'Plantilla no encontrada en este establecimiento.' });
    }

    const nowIso = new Date().toISOString();
    await db.run(
      `UPDATE message_templates
       SET title = COALESCE(?, title),
           body_template = COALESCE(?, body_template),
           active = COALESCE(?, active),
           updated_at = ?
       WHERE id = ? AND hotel_id = ?`,
      [title, body_template, active !== undefined ? (active ? 1 : 0) : null, nowIso, templateId, hotelId]
    );

    const updated = await db.get('SELECT * FROM message_templates WHERE id = ?', [templateId]);
    res.json({ message: 'Plantilla de mensaje actualizada.', template: updated });
  } catch (error) {
    console.error('Error al actualizar plantilla:', error);
    res.status(500).json({ error: 'Error al modificar plantilla.' });
  }
};

/**
 * 7. Renderizar y Preparar Mensaje para Huésped (Generación de wa.me y Outbox)
 */
const prepareGuestMessage = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { templateCode, channel = 'WHATSAPP', reservationId, stayId, customPhone, customRecipient } = req.body;

    if (!templateCode) {
      return res.status(400).json({ error: 'Debe especificar el código de la plantilla.' });
    }

    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    const template = await db.get(
      'SELECT * FROM message_templates WHERE hotel_id = ? AND code = ? AND channel = ? AND active = 1',
      [hotelId, templateCode, channel]
    );

    if (!template) {
      return res.status(404).json({ error: `No existe plantilla activa '${templateCode}' para el canal ${channel}.` });
    }

    // Extraer datos de contexto (huésped, reserva o estancia)
    let guestData = {
      guest_name: 'Huésped Estimado',
      reservation_code: 'S/N',
      check_in_date: getTodayString(),
      check_in_time: hotel.check_in_time || '15:00',
      check_out_date: getTodayString(),
      check_out_time: hotel.check_out_time || '13:00',
      room_number: 'Por asignar',
      total: '0',
      balance: '0',
      hotel_name: hotel.name,
      hotel_address: hotel.address || 'Recepción',
      hotel_phone: hotel.phone || ''
    };
    let recipientPhone = customPhone || '';
    let recipientName = customRecipient || '';

    if (reservationId) {
      const r = await db.get(
        `SELECT r.*, COALESCE(r.code, 'RES-' || r.id) as reservation_code,
                (g.first_name || ' ' || COALESCE(g.last_name, '')) as guest_name,
                g.phone as guest_phone, rm.number as room_number
         FROM reservations r
         JOIN guests g ON r.guest_id = g.id
         LEFT JOIN reservation_rooms rr ON rr.reservation_id = r.id
         LEFT JOIN rooms rm ON rr.room_id = rm.id
         WHERE r.id = ? AND r.hotel_id = ?`,
        [reservationId, hotelId]
      );
      if (r) {
        guestData.guest_name = r.guest_name.trim();
        guestData.reservation_code = r.reservation_code;
        guestData.check_in_date = r.check_in_expected;
        guestData.check_out_date = r.check_out_expected;
        guestData.room_number = r.room_number || 'Asignada al Check-in';
        guestData.total = Number(r.total_price || 0).toLocaleString('es-CO');
        guestData.balance = (Number(r.total_price || 0) - Number(r.advance_paid || 0)).toLocaleString('es-CO');
        recipientPhone = recipientPhone || r.guest_phone;
        recipientName = recipientName || r.guest_name.trim();
      }
    } else if (stayId) {
      const s = await db.get(
        `SELECT s.*, (g.first_name || ' ' || COALESCE(g.last_name, '')) as guest_name,
                g.phone as guest_phone, rm.number as room_number,
                ga.total_charges, ga.total_payments, ga.balance
         FROM stays s
         JOIN guests g ON s.guest_id = g.id
         LEFT JOIN rooms rm ON s.room_id = rm.id
         LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
         WHERE s.id = ? AND s.hotel_id = ?`,
        [stayId, hotelId]
      );
      if (s) {
        guestData.guest_name = s.guest_name.trim();
        guestData.reservation_code = `EST-${s.id}`;
        guestData.check_in_date = s.check_in_time ? s.check_in_time.slice(0, 10) : getTodayString();
        guestData.check_out_date = s.expected_check_out;
        guestData.room_number = s.room_number || '';
        guestData.total = Number(s.total_charges || 0).toLocaleString('es-CO');
        guestData.balance = Number(s.balance || 0).toLocaleString('es-CO');
        recipientPhone = recipientPhone || s.guest_phone;
        recipientName = recipientName || s.guest_name.trim();
      }
    }

    const renderedBody = MessageDeliveryService.renderTemplate(template.body_template, guestData);
    const directWaLink = recipientPhone ? MessageDeliveryService.buildDirectWhatsAppUrl(recipientPhone, renderedBody) : null;

    res.json({
      template_code: template.code,
      channel: template.channel,
      title: template.title,
      recipient_name: recipientName,
      recipient_phone: recipientPhone,
      message_body: renderedBody,
      direct_whatsapp_url: directWaLink,
      has_official_cloud_api: Boolean(hotel.whatsapp_phone_number_id && hotel.whatsapp_access_token)
    });
  } catch (error) {
    console.error('Error al preparar mensaje de huésped:', error);
    res.status(500).json({ error: 'Error al procesar plantilla de mensaje.' });
  }
};

/**
 * 8. Enviar Mensaje a Huésped (Por WhatsApp Cloud API Oficial o Registro en Outbox con enlace directo)
 */
const sendMessageToGuest = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { channel = 'WHATSAPP', recipient, recipientName, templateCode, messageBody, sendViaCloudApi = false } = req.body;

    if (!recipient || !messageBody) {
      return res.status(400).json({ error: 'Destinatario y cuerpo del mensaje son requeridos.' });
    }

    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    const nowIso = new Date().toISOString();

    let deliveryStatus = 'PENDIENTE';
    let externalId = null;
    let errorMessage = null;

    if (channel === 'WHATSAPP' && sendViaCloudApi) {
      if (!hotel.whatsapp_phone_number_id || !hotel.whatsapp_access_token) {
        return res.status(400).json({
          error: 'El hotel no tiene credenciales de WhatsApp Cloud API configuradas. Puede usar el enlace directo con 1 clic (wa.me).'
        });
      }

      try {
        const sendRes = await MessageDeliveryService.sendWhatsAppCloudApi({
          phoneNumberId: hotel.whatsapp_phone_number_id,
          accessToken: hotel.whatsapp_access_token,
          toPhone: recipient,
          messageBody
        });
        deliveryStatus = 'ENVIADO';
        externalId = sendRes.messageId;
      } catch (err) {
        deliveryStatus = 'FALLIDO';
        errorMessage = err.message;
      }
    } else if (channel === 'EMAIL' && sendViaCloudApi) {
      try {
        const mailRes = await MessageDeliveryService.sendSmtpEmail({
          host: hotel.smtp_host,
          port: hotel.smtp_port,
          user: hotel.smtp_user,
          pass: hotel.smtp_pass,
          from: hotel.smtp_from_email,
          secure: hotel.smtp_secure,
          to: recipient,
          subject: `Mensaje de ${hotel.name}`,
          bodyText: messageBody
        });
        deliveryStatus = 'ENVIADO';
        externalId = mailRes.messageId;
      } catch (err) {
        deliveryStatus = 'FALLIDO';
        errorMessage = err.message;
      }
    } else {
      // Registro en cola / enlace directo listo
      deliveryStatus = 'ENVIADO';
    }

    // Registrar en tabla message_outbox
    const outboxRes = await db.run(
      `INSERT INTO message_outbox (
        hotel_id, channel, recipient, recipient_name, template_code, message_body, status, external_id, error_message, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [hotelId, channel, recipient, recipientName || null, templateCode || 'MANUAL', messageBody, deliveryStatus, externalId, errorMessage, deliveryStatus === 'ENVIADO' ? nowIso : null, nowIso]
    );

    const directWaUrl = channel === 'WHATSAPP' ? MessageDeliveryService.buildDirectWhatsAppUrl(recipient, messageBody) : null;

    res.json({
      message: deliveryStatus === 'ENVIADO' ? 'Mensaje registrado/enviado exitosamente.' : 'No se pudo enviar vía API oficial.',
      outbox_id: outboxRes.id,
      status: deliveryStatus,
      external_id: externalId,
      error_message: errorMessage,
      direct_whatsapp_url: directWaUrl
    });
  } catch (error) {
    console.error('Error al enviar mensaje a huésped:', error);
    res.status(500).json({ error: 'Error al despachar mensaje.' });
  }
};

/**
 * 9. Historial de mensajes despachados (Outbox)
 */
const getMessageOutbox = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { channel, limit = 50 } = req.query;

    let sql = `SELECT * FROM message_outbox WHERE hotel_id = ?`;
    const params = [hotelId];

    if (channel) {
      sql += ' AND channel = ?';
      params.push(channel);
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(Math.min(Number(limit) || 50, 100));

    const messages = await db.query(sql, params);
    res.json({ messages });
  } catch (error) {
    console.error('Error al consultar buzón de salida:', error);
    res.status(500).json({ error: 'Error al consultar historial de mensajes.' });
  }
};

/**
 * 10. Actualizar configuración de integraciones WhatsApp Cloud API y SMTP del Hotel
 */
const updateMessagingConfig = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      whatsapp_phone_number_id,
      whatsapp_access_token,
      whatsapp_business_account_id,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      smtp_from_email,
      smtp_secure
    } = req.body;

    // Un campo vacío CONSERVA el valor guardado. El formulario de la interfaz
    // nunca recibe las claves guardadas (por seguridad), así que antes cada
    // "Guardar" borraba el token de WhatsApp y la clave SMTP sin avisar.
    const keep = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
    await db.run(
      `UPDATE hotels
       SET whatsapp_phone_number_id = COALESCE(?, whatsapp_phone_number_id),
           whatsapp_access_token = COALESCE(?, whatsapp_access_token),
           whatsapp_business_account_id = COALESCE(?, whatsapp_business_account_id),
           smtp_host = COALESCE(?, smtp_host),
           smtp_port = COALESCE(?, smtp_port, 587),
           smtp_user = COALESCE(?, smtp_user),
           smtp_pass = COALESCE(?, smtp_pass),
           smtp_from_email = COALESCE(?, smtp_from_email),
           smtp_secure = ?
       WHERE id = ?`,
      [
        keep(whatsapp_phone_number_id),
        keep(whatsapp_access_token),
        keep(whatsapp_business_account_id),
        keep(smtp_host),
        Number(smtp_port) || null,
        keep(smtp_user),
        keep(smtp_pass),
        keep(smtp_from_email),
        smtp_secure ? 1 : 0,
        hotelId
      ]
    );

    const updatedHotel = await db.get(
      `SELECT id, name, whatsapp_phone_number_id, whatsapp_business_account_id, smtp_host, smtp_port, smtp_user, smtp_from_email, smtp_secure
       FROM hotels WHERE id = ?`,
      [hotelId]
    );

    res.json({
      message: 'Configuración de WhatsApp y correo actualizada correctamente.',
      config: updatedHotel
    });
  } catch (error) {
    console.error('Error al actualizar configuración de mensajería:', error);
    res.status(500).json({ error: 'Error al actualizar credenciales del hotel.' });
  }
};

module.exports = {
  createInternalNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  scanOperationalAlerts,
  createNotification,
  getTemplates,
  updateTemplate,
  prepareGuestMessage,
  sendMessageToGuest,
  getMessageOutbox,
  updateMessagingConfig
};
