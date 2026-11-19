const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { getTodayString } = require('../utils/date');
const initDatabase = require('../db/init');

// Clave secreta o credenciales para el panel de superadministrador SaaS
const MASTER_SECRET = process.env.MASTER_SECRET || 'admin123';

/**
 * 1. Acceso al Panel Master SaaS
 * Valida credenciales de Super Administrador (username: admin, password: admin123 o MASTER_SECRET)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciales requeridas.' });
    }

    const cleanUser = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    // Verificación de credenciales maestras SaaS (Acepta admin123 o adminpassword123 por comodidad)
    const isMasterUser = cleanUser === 'admin';
    const isMasterPass = cleanPass === MASTER_SECRET || cleanPass === 'admin123' || cleanPass === 'adminpassword123';

    if (!isMasterUser || !isMasterPass) {
      return res.status(401).json({ error: 'Credenciales de Super Administrador inválidas.' });
    }

    res.json({
      success: true,
      master_token: 'SAAS-MASTER-' + Buffer.from(`${cleanUser}:${Date.now()}`).toString('base64'),
      message: 'Acceso autorizado al Panel de Gestión de Clientes SaaS.'
    });
  } catch (error) {
    console.error('Error en login master:', error);
    res.status(500).json({ error: 'Error del servidor en acceso master.' });
  }
});

// Middleware simple de verificación de token master
const requireMasterAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer SAAS-MASTER-')) {
    return res.status(403).json({ error: 'Acceso denegado: Se requiere sesión de Super Administrador SaaS.' });
  }
  next();
};

/**
 * 2. Listar todos los clientes / hoteles registrados con sus propietarios
 */
router.get('/clients', requireMasterAuth, async (req, res) => {
  try {
    const hotels = await db.query(
      `SELECT h.*,
              COUNT(DISTINCT r.id) as total_rooms,
              COUNT(DISTINCT s.id) as total_stays
       FROM hotels h
       LEFT JOIN rooms r ON r.hotel_id = h.id
       LEFT JOIN stays s ON s.hotel_id = h.id
       GROUP BY h.id
       ORDER BY h.id DESC`
    );

    // Obtener los administradores vinculados a cada hotel
    const users = await db.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, uh.hotel_id
       FROM users u
       JOIN user_hotels uh ON u.id = uh.user_id
       WHERE uh.role IN ('PROPIETARIO', 'ADMINISTRADOR')`
    );

    const enriched = hotels.map((h) => {
      const hotelUsers = users.filter((u) => u.hotel_id === h.id);
      return {
        ...h,
        owners: hotelUsers
      };
    });

    res.json({ clients: enriched });
  } catch (error) {
    console.error('Error al listar clientes SaaS:', error);
    res.status(500).json({ error: 'Error al consultar clientes.' });
  }
});

/**
 * 3. Registrar un Nuevo Hotel / Cliente con su Propietario en 1 solo paso
 */
router.post('/clients', requireMasterAuth, async (req, res) => {
  try {
    const {
      hotel_name,
      legal_name,
      tax_id,
      phone,
      email,
      city,
      country,
      currency = 'COP',
      check_in_time = '15:00',
      check_out_time = '13:00',
      // Datos del usuario propietario
      admin_username,
      admin_password,
      admin_name,
      admin_email,
      admin_phone
    } = req.body;

    if (!hotel_name || !admin_username || !admin_password || !admin_name) {
      return res.status(400).json({
        error: 'El nombre del hotel, usuario administrador, contraseña y nombre del propietario son requeridos.'
      });
    }

    const cleanUsername = String(admin_username).trim().toLowerCase();
    const existingUser = await db.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    // Un usuario "huérfano" (sin acceso a ningún hotel existente) quedó de un hotel
    // eliminado: se reutiliza en lugar de bloquear el nombre para siempre.
    let orphanUserId = null;
    if (existingUser) {
      const access = await db.get(
        `SELECT COUNT(*) as c FROM user_hotels uh
         JOIN hotels h ON h.id = uh.hotel_id
         WHERE uh.user_id = ?`,
        [existingUser.id]
      );
      if (cleanUsername === 'admin' || Number(access?.c || 0) > 0) {
        return res.status(400).json({ error: `El usuario '${cleanUsername}' ya existe en el sistema.` });
      }
      orphanUserId = existingUser.id;
    }

    const today = getTodayString();
    const hashedPassword = await bcrypt.hash(admin_password, 10);

    const result = await db.withTransaction(async (tx) => {
      // A. Crear el hotel
      const countRes = await tx.get('SELECT COUNT(*) as c FROM hotels');
      const nextNum = Number(countRes?.c || 0) + 1;
      const code = `hotel-${nextNum}-${Date.now().toString().slice(-4)}`;

      const hotelIns = await tx.run(
        `INSERT INTO hotels (
          code, name, legal_name, tax_id, address, city, country, phone, email, currency, timezone, check_in_time, check_out_time, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'America/Bogota', ?, ?, 1, ?)`,
        [
          code,
          hotel_name.trim(),
          legal_name || hotel_name.trim(),
          tax_id || '',
          '',
          city || 'Colombia',
          country || 'Colombia',
          phone || '',
          email || '',
          currency,
          check_in_time,
          check_out_time,
          today
        ]
      );
      const hotelId = hotelIns.id;

      // B. Crear el usuario Propietario del cliente (o reutilizar el huérfano)
      let userId;
      if (orphanUserId) {
        await tx.run('DELETE FROM user_hotels WHERE user_id = ?', [orphanUserId]);
        await tx.run(
          `UPDATE users SET password = ?, full_name = ?, email = ?, phone = ?, role = 'PROPIETARIO',
                  active = 1, default_hotel_id = ?
           WHERE id = ?`,
          [hashedPassword, admin_name.trim(), admin_email || '', admin_phone || '', hotelId, orphanUserId]
        );
        userId = orphanUserId;
      } else {
        const userIns = await tx.run(
          `INSERT INTO users (
            username, password, full_name, email, phone, role, active, default_hotel_id, created_at
          ) VALUES (?, ?, ?, ?, ?, 'PROPIETARIO', 1, ?, ?)`,
          [cleanUsername, hashedPassword, admin_name.trim(), admin_email || '', admin_phone || '', hotelId, today]
        );
        userId = userIns.id;
      }

      // C. Vincular usuario con el hotel
      await tx.run(
        'INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, ?, ?, 1)',
        [userId, hotelId, 'PROPIETARIO']
      );

      // D. Crear la caja principal inicial
      await tx.run(
        `INSERT INTO cash_registers (hotel_id, user_id, name, opening_time, opening_balance, status)
         VALUES (?, ?, 'Caja Principal Recepción', ?, 0, 'ABIERTA')`,
        [hotelId, userId, today]
      );

      return { hotelId, userId, code };
    });

    // Sembrar configuración base (Impuestos, Métodos de pago, Departamentos, Tipos de Habitación, PUC y Plantillas)
    if (initDatabase.ensureHotelDefaults) {
      await initDatabase.ensureHotelDefaults(result.hotelId);
    }

    res.status(201).json({
      message: 'Cliente y hotel creados exitosamente.',
      hotel_id: result.hotelId,
      hotel_name: hotel_name.trim(),
      admin_username: cleanUsername
    });
  } catch (error) {
    console.error('Error al registrar cliente SaaS:', error);
    res.status(500).json({ error: error.message || 'Error al crear cliente.' });
  }
});

/**
 * 4. Activar o suspender un hotel cliente
 */
router.patch('/clients/:hotelId/status', requireMasterAuth, async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { active } = req.body;

    await db.run('UPDATE hotels SET active = ? WHERE id = ?', [active ? 1 : 0, hotelId]);
    res.json({ message: `Estado del hotel actualizado a ${active ? 'ACTIVO' : 'SUSPENDIDO'}.` });
  } catch (error) {
    console.error('Error al cambiar estado de cliente:', error);
    res.status(500).json({ error: 'Error al actualizar estado del hotel.' });
  }
});

/**
 * 5. Eliminar definitivamente un hotel cliente y TODA su información.
 *
 * Requiere confirmar escribiendo el nombre exacto del hotel (confirm_name).
 * Se ejecuta en una sola transacción: si algo falla, no se borra nada.
 * El orden va de las tablas hijas a las padres para respetar las claves
 * foráneas con ON DELETE RESTRICT (habitaciones, huéspedes, productos,
 * cuentas contables y usuarios en cajas).
 * Los usuarios que solo pertenecen a este hotel también se eliminan; los que
 * tienen acceso a otros hoteles se conservan.
 */
const HOTEL_SCOPED_DELETE_ORDER = [
  // Contabilidad, facturación y cartera
  'electronic_invoices',
  'ar_ap_payments',
  'accounts_receivable_payable',
  'journal_entry_lines',
  'journal_entries',
  'accounting_rules',
  'accounting_periods',
  'bank_reconciliations',
  'accounting_accounts',
  // Restaurante / servicios
  'service_order_items',
  'service_orders',
  'service_recipes',
  'service_catalog',
  'restaurant_tables',
  // Inventario y compras
  'purchase_order_items',
  'purchase_orders',
  'inventory_movements',
  'inventory_products',
  'suppliers',
  // Caja
  'cash_audits',
  'cash_movements',
  'cash_registers',
  // Cuentas de huéspedes
  'account_charges',
  'payments',
  'guest_accounts',
  // Operación de habitaciones
  'maintenance_tickets',
  'housekeeping_tasks',
  'stay_companions',
  'stays',
  'reservation_rooms',
  'reservations',
  'guests',
  'room_history',
  'rooms',
  'room_types',
  // Personal, mensajería y configuración
  'staff_shifts',
  'employee_profiles',
  'notification_center',
  'message_outbox',
  'message_templates',
  'hotel_taxes',
  'hotel_payment_methods',
  'hotel_departments',
  'audit_logs',
  'user_sessions'
];

router.delete('/clients/:hotelId', requireMasterAuth, async (req, res) => {
  try {
    const hotelId = Number(req.params.hotelId);
    if (!Number.isInteger(hotelId) || hotelId <= 0) {
      return res.status(400).json({ error: 'Identificador de hotel inválido.' });
    }

    const hotel = await db.get('SELECT id, name FROM hotels WHERE id = ?', [hotelId]);
    if (!hotel) {
      return res.status(404).json({ error: 'El hotel no existe o ya fue eliminado.' });
    }

    const confirmName = String(req.body?.confirm_name || '').trim().toLowerCase();
    if (!confirmName || confirmName !== String(hotel.name).trim().toLowerCase()) {
      return res.status(400).json({
        error: `Para eliminar debes escribir exactamente el nombre del hotel: "${hotel.name}".`
      });
    }

    const summary = await db.withTransaction(async (tx) => {
      const deleted = {};

      // Usuarios que SOLO tienen acceso a este hotel (se eliminarán al final)
      const exclusiveUsers = await tx.query(
        `SELECT DISTINCT u.id FROM users u
         WHERE (u.id IN (SELECT user_id FROM user_hotels WHERE hotel_id = ?) OR u.default_hotel_id = ?)
           AND u.id NOT IN (SELECT user_id FROM user_hotels WHERE hotel_id <> ?)`,
        [hotelId, hotelId, hotelId]
      );
      const exclusiveUserIds = exclusiveUsers.map((u) => u.id);

      // Filas hijas que podrían quedar con hotel_id vacío pero referencian
      // padres de este hotel con ON DELETE RESTRICT.
      await tx.run(
        `DELETE FROM journal_entry_lines WHERE account_id IN (SELECT id FROM accounting_accounts WHERE hotel_id = ?)`,
        [hotelId]
      );
      await tx.run(
        `DELETE FROM purchase_order_items WHERE product_id IN (SELECT id FROM inventory_products WHERE hotel_id = ?)`,
        [hotelId]
      );
      await tx.run(
        `DELETE FROM stays WHERE room_id IN (SELECT id FROM rooms WHERE hotel_id = ?)
            OR guest_id IN (SELECT id FROM guests WHERE hotel_id = ?)`,
        [hotelId, hotelId]
      );
      await tx.run(
        `DELETE FROM reservation_rooms WHERE room_id IN (SELECT id FROM rooms WHERE hotel_id = ?)
            OR reservation_id IN (SELECT id FROM reservations WHERE hotel_id = ?)`,
        [hotelId, hotelId]
      );
      await tx.run(
        `DELETE FROM reservations WHERE guest_id IN (SELECT id FROM guests WHERE hotel_id = ?)`,
        [hotelId]
      );

      for (const table of HOTEL_SCOPED_DELETE_ORDER) {
        const r = await tx.run(`DELETE FROM ${table} WHERE hotel_id = ?`, [hotelId]);
        if (r.changes) deleted[table] = r.changes;
      }

      // Accesos de usuarios al hotel
      const uh = await tx.run('DELETE FROM user_hotels WHERE hotel_id = ?', [hotelId]);
      if (uh.changes) deleted.user_hotels = uh.changes;

      // Usuarios exclusivos de este hotel
      let usersDeleted = 0;
      for (const uid of exclusiveUserIds) {
        // Cajas de otros hoteles a nombre de este usuario bloquearían el borrado (RESTRICT)
        const blocking = await tx.get('SELECT COUNT(*) as c FROM cash_registers WHERE user_id = ?', [uid]);
        if (Number(blocking?.c || 0) > 0) continue;
        const r = await tx.run('DELETE FROM users WHERE id = ?', [uid]);
        usersDeleted += r.changes || 0;
      }

      // Usuarios que conservan acceso a otros hoteles: quitar este como hotel por defecto
      await tx.run('UPDATE users SET default_hotel_id = NULL WHERE default_hotel_id = ?', [hotelId]);

      await tx.run('DELETE FROM hotels WHERE id = ?', [hotelId]);

      return { deleted, usersDeleted };
    });

    const totalRows = Object.values(summary.deleted).reduce((a, b) => a + Number(b || 0), 0);
    res.json({
      message: `Hotel "${hotel.name}" eliminado definitivamente (${totalRows} registros y ${summary.usersDeleted} usuario(s)).`,
      hotel_id: hotelId,
      deleted: summary.deleted,
      users_deleted: summary.usersDeleted
    });
  } catch (error) {
    console.error('Error al eliminar hotel cliente:', error);
    res.status(500).json({
      error: 'No se pudo eliminar el hotel. No se borró ningún dato. Detalle: ' + (error.message || 'error desconocido')
    });
  }
});

module.exports = router;

