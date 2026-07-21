const { dbType, run } = require('../config/db');

const initDatabase = async () => {
  try {
    console.log('Inicializando tablas de base de datos...');

    const isPg = dbType === 'pg';
    const pkType = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const numType = isPg ? 'DECIMAL(12,2)' : 'REAL';

    // Tabla de Usuarios para login
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id ${pkType},
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);

    // --- HOTEL 1 ---
    await run(`
      CREATE TABLE IF NOT EXISTS hotel1_rooms (
        id ${pkType},
        number TEXT UNIQUE NOT NULL,
        price ${numType} NOT NULL,
        status TEXT DEFAULT 'Libre', -- 'Libre', 'Ocupada', 'Pendiente de pago'
        observations TEXT
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS hotel1_guests (
        id ${pkType},
        room_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        document TEXT,
        phone TEXT,
        check_in_date TEXT NOT NULL,
        payment_type TEXT NOT NULL, -- Pago diario, Pago cada 3 días, Pago semanal
        next_payment_date TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES hotel1_rooms (id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS hotel1_transactions (
        id ${pkType},
        type TEXT NOT NULL, -- 'Ingreso' o 'Gasto'
        category TEXT NOT NULL, -- Mercado, Servicios, Aseo, Mantenimiento, Hospedaje, etc.
        amount ${numType} NOT NULL,
        date TEXT NOT NULL,
        description TEXT
      )
    `);

    // --- HOTEL 2 ---
    await run(`
      CREATE TABLE IF NOT EXISTS hotel2_rooms (
        id ${pkType},
        number TEXT UNIQUE NOT NULL,
        price ${numType} NOT NULL,
        status TEXT DEFAULT 'Libre',
        observations TEXT
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS hotel2_guests (
        id ${pkType},
        room_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        document TEXT,
        phone TEXT,
        check_in_date TEXT NOT NULL,
        payment_type TEXT NOT NULL,
        next_payment_date TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES hotel2_rooms (id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS hotel2_transactions (
        id ${pkType},
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount ${numType} NOT NULL,
        date TEXT NOT NULL,
        description TEXT
      )
    `);

    // --- RESTAURANTE ---
    await run(`
      CREATE TABLE IF NOT EXISTS restaurant_sales (
        id ${pkType},
        product TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        value ${numType} NOT NULL,
        payment_method TEXT NOT NULL, -- Efectivo, Transferencia
        date TEXT NOT NULL,
        observations TEXT
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS restaurant_expenses (
        id ${pkType},
        provider TEXT NOT NULL,
        concept TEXT NOT NULL,
        value ${numType} NOT NULL,
        date TEXT NOT NULL,
        observations TEXT
      )
    `);

    // --- LICHIGUERÍA ---
    await run(`
      CREATE TABLE IF NOT EXISTS lichigueria_providers (
        id ${pkType},
        name TEXT NOT NULL,
        phone TEXT,
        product TEXT
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS lichigueria_sales (
        id ${pkType},
        product TEXT NOT NULL,
        quantity ${isPg ? 'DECIMAL(10,3)' : 'REAL'} NOT NULL,
        unit TEXT NOT NULL, -- lb, kg, unidad, etc.
        value ${numType} NOT NULL,
        payment_method TEXT NOT NULL,
        date TEXT NOT NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS lichigueria_expenses (
        id ${pkType},
        concept TEXT NOT NULL,
        value ${numType} NOT NULL,
        date TEXT NOT NULL,
        observations TEXT
      )
    `);

    console.log('Tablas inicializadas correctamente.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    process.exit(1);
  }
};

module.exports = initDatabase;
