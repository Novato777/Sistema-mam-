const bcrypt = require('bcryptjs');
const { get, query, run } = require('../config/db');
const { getTodayString } = require('../utils/date');

/**
 * Migración y configuración del Negocio Hotelero Único
 * Garantiza un sistema completamente limpio, listo para un solo hotel
 */
const migrateLegacyData = async (ensureHotelDefaults) => {
  const today = getTodayString();

  // 1. Asegurar usuario administrador propietario
  let adminUser = await get('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const hashed = await bcrypt.hash('adminpassword123', 10);
    const res = await run(
      `INSERT INTO users (username, password, full_name, email, role, active, default_hotel_id, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
      ['admin', hashed, 'Administrador General', 'admin@sistema-hotelero.com', 'PROPIETARIO', today]
    );
    adminUser = { id: res.id || 1, username: 'admin', role: 'PROPIETARIO' };
  } else if (adminUser.role === 'ADMIN' || !adminUser.role) {
    await run(`UPDATE users SET role = 'PROPIETARIO', full_name = COALESCE(full_name, 'Administrador General') WHERE id = ?`, [adminUser.id]);
  }

  // 2. Asegurar únicamente el Hotel Principal (1 solo hotel / negocio)
  let hotel1 = await get('SELECT * FROM hotels WHERE id = 1');
  if (!hotel1) {
    await run(
      `INSERT INTO hotels (code, name, legal_name, tax_id, address, city, phone, email, currency, timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COP', 'America/Bogota')`,
      ['hotel-1', 'Hotel Principal', 'Hotel Principal S.A.S.', '900.123.456-1', 'Calle Principal # 10-20, Centro', 'La Dorada, Caldas', '3222067870', 'recepcion@hotelprincipal.com']
    );
    hotel1 = await get('SELECT * FROM hotels WHERE id = 1');
  }
  // IMPORTANTE: no borrar ni renombrar hoteles aquí. Esta función corre en cada
  // arranque del servidor; antes eliminaba todos los hoteles con id > 1, lo que
  // borraba los clientes creados desde el Panel Master y dejaba sus usuarios huérfanos.

  // Asegurar la configuración base para el Hotel Principal (Impuestos, Métodos de Pago, Departamentos, Tipos de Habitación, PUC, etc.)
  await ensureHotelDefaults(1);

  // Vincular usuario admin como PROPIETARIO del hotel
  const access = await get('SELECT id FROM user_hotels WHERE user_id = ? AND hotel_id = 1', [adminUser.id]);
  if (!access) {
    await run(
      'INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, 1, ?, 1)',
      [adminUser.id, 'PROPIETARIO']
    );
  }

  // Asegurar que la Caja Principal esté abierta y lista para operar
  const openReg = await get("SELECT id FROM cash_registers WHERE hotel_id = 1 AND status = 'ABIERTA' LIMIT 1");
  if (!openReg) {
    await run(
      `INSERT INTO cash_registers (hotel_id, user_id, name, opening_time, opening_balance, status)
       VALUES (1, ?, 'Caja Principal Recepción', ?, 0, 'ABIERTA')`,
      [adminUser.id, today]
    );
  }

  console.log('✓ Configuración del Hotel Principal establecida para negocio único.');
};

module.exports = migrateLegacyData;
