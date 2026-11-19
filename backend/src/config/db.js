const { Pool } = require('pg');
const path = require('path');

let dbType = 'sqlite';
let sqliteDb = null;
let pgPool = null;

if (process.env.DATABASE_URL) {
  dbType = 'pg';
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  console.log('Detectado entorno cloud: Conectado exitosamente a PostgreSQL (Neon).');
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, '../../sistema_familiar.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error al conectar con SQLite:', err.message);
    } else {
      sqliteDb.run('PRAGMA foreign_keys = ON;');
      console.log('Conectado exitosamente a la base de datos SQLite (Foreign Keys ON).');
    }
  });
}

// Formatea SQL con placeholders ? a $1, $2... para PostgreSQL
const toPgSql = (sql, isInsert = false) => {
  let index = 1;
  const converted = sql.replace(/\?/g, () => `$${index++}`);
  if (isInsert && !/RETURNING\s+/i.test(converted)) {
    return `${converted} RETURNING id`;
  }
  return converted;
};

// Función wrapper para devolver múltiples filas
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (dbType === 'pg') {
      const pgSql = toPgSql(sql, false);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) reject(err);
        else resolve(res.rows);
      });
    } else {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    }
  });
};

// Función wrapper para INSERT / UPDATE / DELETE / DDL
const run = (sql, params = []) => {
  const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
  return new Promise((resolve, reject) => {
    if (dbType === 'pg') {
      const pgSql = toPgSql(sql, isInsert);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          reject(err);
        } else {
          const lastID = res.rows && res.rows[0] ? res.rows[0].id : null;
          resolve({ id: lastID, changes: res.rowCount });
        }
      });
    } else {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    }
  });
};

// Función wrapper para devolver una única fila
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (dbType === 'pg') {
      const pgSql = toPgSql(sql, false);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) reject(err);
        else resolve(res.rows[0] || null);
      });
    } else {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    }
  });
};

// Cola de exclusión mutua para transacciones en SQLite (conexión única)
let sqliteTxLock = Promise.resolve();

/**
 * Ejecuta una función asíncrona dentro de una transacción ACID (BEGIN / COMMIT / ROLLBACK).
 * En PostgreSQL utiliza un cliente dedicado del pool; en SQLite serializa la transacción.
 */
const withTransaction = async (callback) => {
  if (dbType === 'pg') {
    const client = await pgPool.connect();
    const tx = {
      query: async (sql, params = []) => {
        const res = await client.query(toPgSql(sql, false), params);
        return res.rows;
      },
      get: async (sql, params = []) => {
        const res = await client.query(toPgSql(sql, false), params);
        return res.rows[0] || null;
      },
      run: async (sql, params = []) => {
        const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
        const res = await client.query(toPgSql(sql, isInsert), params);
        const lastID = res.rows && res.rows[0] ? res.rows[0].id : null;
        return { id: lastID, changes: res.rowCount };
      }
    };

    try {
      await client.query('BEGIN');
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } else {
    let releaseLock;
    const prevLock = sqliteTxLock;
    sqliteTxLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevLock;

    const tx = { query, get, run };
    try {
      await run('BEGIN IMMEDIATE TRANSACTION');
      const result = await callback(tx);
      await run('COMMIT');
      return result;
    } catch (error) {
      try {
        await run('ROLLBACK');
      } catch (_) {
        // Ignorar error secundario si la transacción ya fue abortada
      }
      throw error;
    } finally {
      releaseLock();
    }
  }
};

module.exports = {
  dbType,
  query,
  run,
  get,
  withTransaction
};
