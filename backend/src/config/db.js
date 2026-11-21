/**
 * Capa de acceso a datos (SQLite en local / PostgreSQL en la nube).
 *
 * API pública (sin cambios para los controladores):
 *   query(sql, params)   -> filas
 *   get(sql, params)     -> primera fila o null
 *   run(sql, params)     -> { id, changes }
 *   withTransaction(cb)  -> ejecuta cb(tx) dentro de BEGIN/COMMIT/ROLLBACK
 *
 * Garantías:
 * - Transacciones AISLADAS: en SQLite cada transacción usa su propia conexión
 *   (antes compartía la conexión global y podía "absorber" o deshacer
 *   escrituras de otras peticiones concurrentes).
 * - Dentro de withTransaction, cualquier db.query/get/run (aunque se llame
 *   desde una función auxiliar) se enruta automáticamente a la transacción
 *   activa, evitando bloqueos mutuos y escrituras fuera de la transacción.
 * - Transacciones anidadas se aplanan (reutilizan la transacción externa).
 * - PostgreSQL: pool configurable, tipos numéricos convertidos a Number y
 *   conversión de placeholders "?" -> "$n" que respeta textos entre comillas.
 */
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const txContext = new AsyncLocalStorage();

let dbType = 'sqlite';
let pgPool = null;
let sqlite3 = null;
let sqliteDb = null;
let sqliteReady = Promise.resolve();
let sqlitePath = null;

const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 15000);

/* =========================================================================
   POSTGRESQL
========================================================================= */

/** Decide la configuración SSL según la URL / variables de entorno. */
const resolvePgSsl = (connectionString) => {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  let url = null;
  try {
    url = new URL(connectionString);
  } catch (_) {
    url = null;
  }
  const urlMode = url ? (url.searchParams.get('sslmode') || '').toLowerCase() : '';
  const host = url ? url.hostname : '';
  if (mode === 'disable' || urlMode === 'disable') return false;
  if (!mode && !urlMode && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) return false;
  // Neon y la mayoría de proveedores gestionados exigen TLS.
  return { rejectUnauthorized: process.env.PGSSL_STRICT === '1' };
};

if (process.env.DATABASE_URL) {
  dbType = 'pg';
  const { Pool, types } = require('pg');

  // NUMERIC/DECIMAL (1700) y BIGINT (20, ej. COUNT(*)) llegan como texto por
  // defecto; convertirlos evita sumas que concatenan ("10" + "5" = "105").
  types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
  types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: resolvePgSsl(process.env.DATABASE_URL),
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
    // Límite del lado del cliente: una consulta colgada no bloquea el pool para siempre.
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 30000)
  });

  // Un cliente inactivo que se cae (reinicio de Neon, red) no debe tumbar el proceso.
  pgPool.on('error', (err) => {
    console.error('[db] Error en conexión inactiva del pool PostgreSQL:', err.message);
  });
  console.log('[db] Usando PostgreSQL (pool máx. %d conexiones).', Number(process.env.DB_POOL_MAX || 10));
} else {
  sqlite3 = require('sqlite3');
  sqlitePath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.resolve(__dirname, '../../sistema_familiar.db');
}

/**
 * Convierte placeholders "?" en "$1, $2…" ignorando los que están dentro de
 * literales de texto ('…'), identificadores ("…") o comentarios.
 */
const toPgSql = (sql, isInsert = false) => {
  let out = '';
  let index = 1;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            j += 2; // comilla escapada ('')
            continue;
          }
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === '?') {
      out += `$${index++}`;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  if (isInsert && !/RETURNING\s+/i.test(out)) {
    out = `${out.replace(/;\s*$/, '')} RETURNING id`;
  }
  return out;
};

const isInsertSql = (sql) => sql.trim().toUpperCase().startsWith('INSERT');

const pgExec = async (client, sql, params, mode) => {
  const res = await client.query(toPgSql(sql, mode === 'run' && isInsertSql(sql)), params);
  if (mode === 'all') return res.rows;
  if (mode === 'get') return res.rows[0] || null;
  const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? res.rows[0].id : null;
  return { id: lastID, changes: res.rowCount };
};

/* =========================================================================
   SQLITE
========================================================================= */

const sqliteCall = (conn, method, sql, params) =>
  new Promise((resolve, reject) => {
    if (method === 'run') {
      conn.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    } else if (method === 'get') {
      conn.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
    } else {
      conn.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    }
  });

/** Abre una conexión SQLite con las protecciones activas. */
const openSqlite = async ({ wal = false } = {}) => {
  const conn = await new Promise((resolve, reject) => {
    const c = new sqlite3.Database(sqlitePath, (err) => (err ? reject(err) : resolve(c)));
  });
  conn.configure('busyTimeout', SQLITE_BUSY_TIMEOUT_MS);
  await sqliteCall(conn, 'run', 'PRAGMA foreign_keys = ON', []);
  if (wal) {
    // WAL: lectores en paralelo mientras otra conexión escribe.
    await sqliteCall(conn, 'get', 'PRAGMA journal_mode = WAL', []);
    await sqliteCall(conn, 'run', 'PRAGMA synchronous = NORMAL', []);
  }
  return conn;
};

const closeSqlite = (conn) => new Promise((resolve) => conn.close(() => resolve()));

if (dbType === 'sqlite') {
  sqliteReady = openSqlite({ wal: true })
    .then((conn) => {
      sqliteDb = conn;
      console.log('[db] Usando SQLite (%s) con WAL y claves foráneas activas.', path.basename(sqlitePath));
    })
    .catch((err) => {
      console.error('[db] Error al conectar con SQLite:', err.message);
      throw err;
    });
}

/* =========================================================================
   API PÚBLICA
========================================================================= */

/** Transacción activa en este flujo asíncrono (o null). */
const activeTx = () => {
  const tx = txContext.getStore();
  return tx && !tx.closed ? tx : null;
};

const exec = async (mode, sql, params = []) => {
  const tx = activeTx();
  if (tx) return tx[mode === 'all' ? 'query' : mode](sql, params);
  if (dbType === 'pg') return pgExec(pgPool, sql, params, mode);
  await sqliteReady;
  return sqliteCall(sqliteDb, mode, sql, params);
};

const query = (sql, params = []) => exec('all', sql, params);
const get = (sql, params = []) => exec('get', sql, params);
const run = (sql, params = []) => exec('run', sql, params);

// Serializa las transacciones de SQLite dentro del proceso (un solo escritor).
let sqliteTxLock = Promise.resolve();

const withTransaction = async (callback) => {
  // Transacción anidada: reutilizar la externa.
  const outer = activeTx();
  if (outer) return callback(outer);

  if (dbType === 'pg') {
    const client = await pgPool.connect();
    const tx = {
      closed: false,
      query: (sql, params = []) => pgExec(client, sql, params, 'all'),
      get: (sql, params = []) => pgExec(client, sql, params, 'get'),
      run: (sql, params = []) => pgExec(client, sql, params, 'run')
    };
    try {
      await client.query('BEGIN');
      const result = await txContext.run(tx, () => callback(tx));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // La conexión pudo haberse perdido; el error original es el relevante.
      }
      throw error;
    } finally {
      tx.closed = true;
      client.release();
    }
  }

  await sqliteReady;
  let releaseLock;
  const prevLock = sqliteTxLock;
  sqliteTxLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  await prevLock;

  let conn = null;
  const tx = { closed: false };
  try {
    conn = await openSqlite();
    tx.query = (sql, params = []) => sqliteCall(conn, 'all', sql, params);
    tx.get = (sql, params = []) => sqliteCall(conn, 'get', sql, params);
    tx.run = (sql, params = []) => sqliteCall(conn, 'run', sql, params);

    await sqliteCall(conn, 'run', 'BEGIN IMMEDIATE TRANSACTION', []);
    try {
      const result = await txContext.run(tx, () => callback(tx));
      await sqliteCall(conn, 'run', 'COMMIT', []);
      return result;
    } catch (error) {
      try {
        await sqliteCall(conn, 'run', 'ROLLBACK', []);
      } catch (_) {
        // La transacción ya pudo haber sido abortada por SQLite.
      }
      throw error;
    }
  } finally {
    tx.closed = true;
    if (conn) await closeSqlite(conn);
    releaseLock();
  }
};

/**
 * Ejecuta un bloque con una conexión exclusiva SIN transacción automática
 * (solo para migraciones que necesitan PRAGMA fuera de transacción en SQLite).
 */
const withExclusiveConnection = async (callback) => {
  if (dbType === 'pg') {
    const client = await pgPool.connect();
    const conn = {
      query: (sql, params = []) => pgExec(client, sql, params, 'all'),
      get: (sql, params = []) => pgExec(client, sql, params, 'get'),
      run: (sql, params = []) => pgExec(client, sql, params, 'run')
    };
    try {
      return await callback(conn);
    } finally {
      client.release();
    }
  }
  await sqliteReady;
  let releaseLock;
  const prevLock = sqliteTxLock;
  sqliteTxLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  await prevLock;
  const raw = await openSqlite();
  const conn = {
    query: (sql, params = []) => sqliteCall(raw, 'all', sql, params),
    get: (sql, params = []) => sqliteCall(raw, 'get', sql, params),
    run: (sql, params = []) => sqliteCall(raw, 'run', sql, params)
  };
  try {
    return await callback(conn);
  } finally {
    await closeSqlite(raw);
    releaseLock();
  }
};

/**
 * Ejecuta fn mientras se mantiene un candado global de PostgreSQL
 * (pg_advisory_lock). Evita que varias instancias del backend que arrancan
 * a la vez creen tablas o migren el esquema simultáneamente.
 * En SQLite simplemente ejecuta fn.
 */
const withBootLock = async (fn, key = 727274001) => {
  if (dbType !== 'pg') return fn();
  const client = await pgPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [key]);
    return await fn();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    } finally {
      client.release();
    }
  }
};

/** Cierra las conexiones (pruebas / apagado ordenado). */
const close = async () => {
  if (dbType === 'pg') {
    await pgPool.end();
  } else {
    await sqliteReady.catch(() => {});
    if (sqliteDb) await closeSqlite(sqliteDb);
  }
};

module.exports = {
  dbType,
  query,
  run,
  get,
  withTransaction,
  withExclusiveConnection,
  withBootLock,
  close,
  toPgSql
};
