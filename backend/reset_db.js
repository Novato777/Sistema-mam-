const { dbType, run, query } = require('./src/config/db');
const initDatabase = require('./src/db/init');
const migrateBloque14 = require('./migrateBloque14');

/**
 * Script de Limpieza y Re-inicialización de Base de Datos
 * Funciona de manera idéntica tanto para SQLite local como para PostgreSQL (Neon).
 */
const resetDatabase = async () => {
  console.log('====================================================');
  console.log(`  LIMPIANDO BASE DE DATOS (${dbType.toUpperCase()})`);
  console.log('====================================================\n');

  if (dbType === 'pg') {
    console.log('Eliminando esquema público en PostgreSQL (Neon)...');
    await run('DROP SCHEMA public CASCADE');
    await run('CREATE SCHEMA public');
    await run('GRANT ALL ON SCHEMA public TO public');
    console.log('✓ Esquema PostgreSQL limpio.');
  } else {
    console.log('Eliminando tablas en SQLite...');
    await run('PRAGMA foreign_keys = OFF');
    const tables = await query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    for (const t of tables) {
      await run(`DROP TABLE IF EXISTS ${t.name}`);
    }
    await run('PRAGMA foreign_keys = ON');
    console.log(`✓ ${tables.length} tablas eliminadas en SQLite.`);
  }

  console.log('\nInicializando esquema limpio y sembrando configuración oficial...');
  await initDatabase();
  await migrateBloque14();

  console.log('\n====================================================');
  console.log('  ¡BASE DE DATOS COMPLETAMENTE LIMPIA Y LISTA!');
  console.log('  Usuario inicial: admin');
  console.log('  Contraseña:      adminpassword123');
  console.log('  Hoteles listos:  Hotel 1 y Hotel 2');
  console.log('====================================================\n');
  process.exit(0);
};

resetDatabase().catch((err) => {
  console.error('Error al reiniciar base de datos:', err);
  process.exit(1);
});

