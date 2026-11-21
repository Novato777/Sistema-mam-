const path = require('path');
const bcrypt = require('bcryptjs');

// Cargar variables de entorno desde backend/.env o la raíz del repo si existen
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/**
 * Muestra la guía de uso cuando faltan argumentos obligatorios o se solicita ayuda.
 */
const printUsage = () => {
  console.error('\nUso:');
  console.error('  node scripts/resetNeonDb.js <nuevo_usuario> <nueva_password> ["Nombre del Hotel"]');
  console.error('\nEjemplo con Neon PostgreSQL (PowerShell):');
  console.error('  $env:DATABASE_URL="postgresql://USUARIO:CLAVE@HOST.neon.tech/neondb?sslmode=require"');
  console.error('  npm run reset-db -- mi_admin MiClaveSegura123 "Mi Hotel Principal"');
  console.error('\nTambién puedes definir ADMIN_USERNAME, ADMIN_PASSWORD y DEFAULT_HOTEL_NAME en variables de entorno.\n');
};

/**
 * Resetea por completo la base de datos (Neon PostgreSQL o SQLite),
 * reconstruye el esquema más reciente y crea el nuevo usuario propietario.
 */
const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const rawUsername = args[0] ?? process.env.ADMIN_USERNAME;
  const rawPassword = args[1] ?? process.env.ADMIN_PASSWORD;
  const rawHotelName = args[2] ?? process.env.DEFAULT_HOTEL_NAME ?? 'Hotel Principal';

  const newUsername = String(rawUsername || '').trim();
  const newPassword = String(rawPassword || '');
  const hotelName = String(rawHotelName || 'Hotel Principal').trim() || 'Hotel Principal';

  if (!newUsername || !newPassword) {
    console.error('❌ Error: Debes indicar el nuevo usuario y la nueva contraseña.');
    printUsage();
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('❌ Error: La contraseña debe tener al menos 6 caracteres.');
    process.exit(1);
  }

  // Configurar variables antes de importar/inicializar módulos de BD
  process.env.ADMIN_USERNAME = newUsername;
  process.env.ADMIN_PASSWORD = newPassword;
  process.env.DEFAULT_HOTEL_NAME = hotelName;

  const { dbType, run, query, get } = require('../src/config/db');
  const initDatabase = require('../src/db/init');

  console.log('==========================================================');
  console.log(`  RESET TOTAL DE BASE DE DATOS (${dbType === 'pg' ? 'NEON / POSTGRESQL' : 'SQLITE LOCAL'})`);
  console.log('==========================================================');

  if (dbType !== 'pg') {
    console.warn('⚠️  ATENCIÓN: No se detectó DATABASE_URL. Se ejecutará sobre SQLite local.');
  }

  if (dbType === 'pg') {
    console.log('\n1. Limpiando esquema antiguo en Neon PostgreSQL...');
    await run('DROP SCHEMA IF EXISTS public CASCADE');
    await run('CREATE SCHEMA public');
    try {
      await run('GRANT ALL ON SCHEMA public TO public');
    } catch (_) {
      // En PostgreSQL 15+ algunos roles gestionados no requieren GRANT explícito
    }
    console.log('✓ Esquema public reiniciado por completo.');
  } else {
    console.log('\n1. Limpiando tablas antiguas en SQLite...');
    await run('PRAGMA foreign_keys = OFF');
    const tables = await query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    for (const table of tables) {
      await run(`DROP TABLE IF EXISTS "${table.name}"`);
    }
    await run('PRAGMA foreign_keys = ON');
    console.log(`✓ ${tables.length} tabla(s) eliminadas en SQLite.`);
  }

  console.log('\n2. Creando tablas actualizadas y configuración inicial...');
  await initDatabase();

  console.log('\n3. Configurando hotel y credenciales del nuevo administrador...');
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const firstHotel = await get('SELECT id FROM hotels ORDER BY id ASC LIMIT 1');
  if (firstHotel) {
    await run('UPDATE hotels SET name = ?, legal_name = ? WHERE id = ?', [
      hotelName,
      `${hotelName} S.A.S.`,
      firstHotel.id
    ]);
  }

  const firstUser = await get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  if (firstUser) {
    await run(
      `UPDATE users
       SET username = ?, password = ?, full_name = ?, role = 'PROPIETARIO', active = 1, default_hotel_id = ?
       WHERE id = ?`,
      [newUsername, hashedPassword, 'Administrador General', firstHotel?.id || 1, firstUser.id]
    );
  }

  const tableSummary =
    dbType === 'pg'
      ? await query("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
      : await query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");

  console.log('\n==========================================================');
  console.log('  ✅ BASE DE DATOS RESETEADA Y ACTUALIZADA');
  console.log('==========================================================');
  console.log(`  Motor:          ${dbType === 'pg' ? 'PostgreSQL (Neon)' : 'SQLite local'}`);
  console.log(`  Tablas creadas: ${tableSummary.length}`);
  console.log(`  Hotel inicial:  ${hotelName}`);
  console.log(`  Usuario:        ${newUsername}`);
  console.log('  Rol:            PROPIETARIO');
  console.log('  Contraseña:     [configurada correctamente con bcrypt]');
  console.log('==========================================================\n');

  process.exit(0);
};

main().catch((err) => {
  console.error('\n❌ Error al resetear la base de datos:', err.message || err);
  process.exit(1);
});
