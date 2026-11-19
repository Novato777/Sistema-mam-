const initDatabase = require('./src/db/init');
const db = require('./src/config/db');

const seed = async () => {
  try {
    await initDatabase();
    const hotels = await db.query('SELECT id, code, name FROM hotels ORDER BY id ASC');
    console.log('Hoteles activos en el sistema PMS:', hotels);
    console.log('Semilla y migración Multi-Tenant completadas con éxito.');
  } catch (error) {
    console.error('Error al sembrar la base de datos:', error);
  } finally {
    process.exit(0);
  }
};

seed();
