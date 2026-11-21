const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { isProduction } = require('../config/secrets');
const { get, query, run } = require('../config/db');
const { getTodayString } = require('../utils/date');

/**
 * Migración y configuración del Negocio Hotelero Único
 * Garantiza un sistema completamente limpio, listo para un solo hotel
 */
const migrateLegacyData = async (ensureHotelDefaults) => {
  const today = getTodayString();

  // 1. Asegurar al menos un Hotel Principal (si la base de datos está vacía)
  let hotel1 = await get('SELECT * FROM hotels ORDER BY id ASC LIMIT 1');
  if (!hotel1) {
    const hotelName = (process.env.DEFAULT_HOTEL_NAME || 'Hotel Principal').trim();
    const res = await run(
      `INSERT INTO hotels (code, name, legal_name, tax_id, address, city, phone, email, currency, timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COP', 'America/Bogota')`,
      [
        'hotel-1',
        hotelName,
        `${hotelName} S.A.S.`,
        '900.123.456-1',
        'Calle Principal # 10-20, Centro',
        'La Dorada, Caldas',
        '3222067870',
        'recepcion@hotelprincipal.com'
      ]
    );
    hotel1 = await get('SELECT * FROM hotels WHERE id = ?', [res.id || 1]);
  }

  // 2. Asegurar usuario propietario inicial SOLO si no existe ningún usuario en la tabla users
  let adminUser = await get('SELECT * FROM users ORDER BY id ASC LIMIT 1');
  if (!adminUser) {
    const initialUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
    // En producción nunca se usa la clave de fábrica (está publicada en el README):
    // si no hay ADMIN_PASSWORD se genera una aleatoria y se muestra UNA vez en el log.
    let initialPassword = process.env.ADMIN_PASSWORD || '';
    if (!initialPassword) {
      if (isProduction()) {
        initialPassword = crypto.randomBytes(12).toString('base64url');
        console.warn('================================================================');
        console.warn(`[seguridad] Usuario propietario inicial creado: ${(process.env.ADMIN_USERNAME || 'admin').trim()}`);
        console.warn(`[seguridad] Contraseña temporal: ${initialPassword}`);
        console.warn('[seguridad] Cámbiala al entrar o define ADMIN_PASSWORD antes del primer arranque.');
        console.warn('================================================================');
      } else {
        initialPassword = 'adminpassword123';
      }
    }
    const initialFullName = (process.env.ADMIN_FULL_NAME || 'Administrador General').trim();
    const hashed = await bcrypt.hash(initialPassword, 10);
    const res = await run(
      `INSERT INTO users (username, password, full_name, email, role, active, default_hotel_id, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [initialUsername, hashed, initialFullName, 'admin@sistema-hotelero.com', 'PROPIETARIO', hotel1.id, today]
    );
    adminUser = { id: res.id || 1, username: initialUsername, role: 'PROPIETARIO' };
  } else if (adminUser.role === 'ADMIN' || !adminUser.role) {
    await run(
      `UPDATE users SET role = 'PROPIETARIO', full_name = COALESCE(full_name, 'Administrador General') WHERE id = ?`,
      [adminUser.id]
    );
  }
  // IMPORTANTE: no borrar ni renombrar hoteles aquí. Esta función corre en cada
  // arranque del servidor; antes eliminaba todos los hoteles con id > 1, lo que
  // borraba los clientes creados desde el Panel Master y dejaba sus usuarios huérfanos.

  // Asegurar la configuración base para el hotel inicial (Impuestos, Métodos de Pago, Departamentos, Tipos de Habitación, PUC, etc.)
  await ensureHotelDefaults(hotel1.id);

  // Vincular usuario inicial como PROPIETARIO del hotel si aún no existe esa asignación
  const access = await get(
    'SELECT id FROM user_hotels WHERE user_id = ? AND hotel_id = ?',
    [adminUser.id, hotel1.id]
  );
  if (!access) {
    await run(
      'INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, ?, ?, 1)',
      [adminUser.id, hotel1.id, 'PROPIETARIO']
    );
  }

  // Asegurar que la Caja Principal esté abierta y lista para operar
  const openReg = await get(
    "SELECT id FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' LIMIT 1",
    [hotel1.id]
  );
  if (!openReg) {
    await run(
      `INSERT INTO cash_registers (hotel_id, user_id, name, opening_time, opening_balance, status)
       VALUES (?, ?, 'Caja Principal Recepción', ?, 0, 'ABIERTA')`,
      [hotel1.id, adminUser.id, today]
    );
  }

  console.log(`✓ Configuración de '${hotel1.name}' establecida correctamente.`);
};

module.exports = migrateLegacyData;
