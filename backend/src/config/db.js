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
  // Importar sqlite3 de forma condicional para evitar que intente cargarse en entornos Linux de producción
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, '../../sistema_familiar.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error al conectar con SQLite:', err.message);
    } else {
      console.log('Conectado exitosamente a la base de datos SQLite.');
    }
  });
}

// Función wrapper para devolver filas de forma unificada
const query = (sql, params = []) => {
  // Ajustar la sintaxis de placeholders de SQLite (?) a PostgreSQL ($1, $2...) si es necesario
  let pgSql = sql;
  if (dbType === 'pg') {
    let index = 1;
    pgSql = sql.replace(/\?/g, () => `$${index++}`);
  }

  return new Promise((resolve, reject) => {
    if (dbType === 'pg') {
      pgPool.query(pgSql, params, (err, res) => {
        if (err) reject(err);
        else resolve(res.rows);
      });
    } else {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
};

const run = (sql, params = []) => {
  let pgSql = sql;
  if (dbType === 'pg') {
    let index = 1;
    // Si la consulta es INSERT en postgres, queremos que devuelva el ID del registro creado
    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      pgSql = sql.replace(/\?/g, () => `$${index++}`) + ' RETURNING id';
    } else {
      pgSql = sql.replace(/\?/g, () => `$${index++}`);
    }
  }

  return new Promise((resolve, reject) => {
    if (dbType === 'pg') {
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

const get = (sql, params = []) => {
  let pgSql = sql;
  if (dbType === 'pg') {
    let index = 1;
    pgSql = sql.replace(/\?/g, () => `$${index++}`);
  }

  return new Promise((resolve, reject) => {
    if (dbType === 'pg') {
      pgPool.query(pgSql, params, (err, res) => {
        if (err) reject(err);
        else resolve(res.rows[0] || null);
      });
    } else {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }
  });
};

module.exports = {
  dbType,
  query,
  run,
  get
};

