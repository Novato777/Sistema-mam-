/**
 * Secretos de la aplicación.
 *
 * JWT_SECRET: si está en el entorno se usa ese. Si no, se genera uno aleatorio
 * la primera vez y se guarda en la tabla app_settings, de modo que:
 *  - nunca se usa una clave escrita en el código (cualquiera podría firmar tokens);
 *  - todas las instancias del backend comparten la misma clave;
 *  - los reinicios no cierran las sesiones.
 */
const crypto = require('crypto');
const db = require('./db');

let jwtSecret = process.env.JWT_SECRET || null;

const isProduction = () => process.env.NODE_ENV === 'production' || Boolean(process.env.DATABASE_URL);

const loadSecrets = async () => {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('⚠ SEGURIDAD: JWT_SECRET tiene menos de 32 caracteres; usa una clave más larga.');
  }
  if (jwtSecret) return;

  await db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  let row = await db.get("SELECT value FROM app_settings WHERE key = 'jwt_secret'");
  if (!row) {
    const generated = crypto.randomBytes(48).toString('base64url');
    const conflictClause = db.dbType === 'pg' ? ' ON CONFLICT (key) DO NOTHING RETURNING key' : '';
    const insertVerb = db.dbType === 'pg' ? 'INSERT' : 'INSERT OR IGNORE';
    await db.run(`${insertVerb} INTO app_settings (key, value) VALUES ('jwt_secret', ?)${conflictClause}`, [generated]);
    row = await db.get("SELECT value FROM app_settings WHERE key = 'jwt_secret'");
    console.log('[seguridad] Se generó una clave JWT aleatoria y se guardó en la base (define JWT_SECRET para fijarla).');
  }
  jwtSecret = row.value;
};

const getJwtSecret = () => {
  if (!jwtSecret) {
    throw new Error('Clave JWT no inicializada: loadSecrets() debe ejecutarse al arrancar.');
  }
  return jwtSecret;
};

module.exports = { loadSecrets, getJwtSecret, isProduction };
