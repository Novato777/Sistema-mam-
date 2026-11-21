/**
 * Migraciones versionadas del esquema (SQLite y PostgreSQL).
 *
 * Cada migración se ejecuta UNA sola vez y queda registrada en la tabla
 * schema_migrations. Son idempotentes: si se interrumpen, al volver a correr
 * no duplican nada.
 *
 *   1. limpieza_datos_multitenant  -> corrige datos inconsistentes
 *   2. restricciones_multitenant   -> blindaje del esquema (FK, defaults, CHECK)
 *   3. indices_rendimiento         -> índices para consultas por hotel
 *
 * En SQLite no se pueden agregar restricciones a una tabla existente, así que
 * la migración 2 reconstruye las tablas afectadas con el procedimiento oficial
 * (crear tabla nueva -> copiar -> borrar -> renombrar) dentro de una sola
 * transacción y verifica PRAGMA foreign_key_check antes de confirmar.
 */
const db = require('../config/db');

const isPg = db.dbType === 'pg';

/** Expresión de fecha del día (YYYY-MM-DD, hora de Colombia) para DEFAULT. */
const NOW_DATE_DEFAULT = isPg
  ? "(to_char(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'))"
  : "(date('now', '-5 hours'))";

/** Tablas que no pertenecen a un hotel concreto. */
const GLOBAL_TABLES = new Set(['hotels', 'users', 'schema_migrations']);

/** Restricciones CHECK de integridad de dinero (solo si los datos actuales las cumplen). */
const CHECKS = {
  cash_movements: [
    { name: 'chk_cash_movements_amount', expr: 'amount >= 0' },
    { name: 'chk_cash_movements_type', expr: "type IN ('INGRESO', 'EGRESO')" }
  ],
  payments: [{ name: 'chk_payments_amount', expr: 'amount >= 0' }]
};

const log = (...args) => console.log('[migraciones]', ...args);
const pgName = (s) => s.slice(0, 63);

/* =========================================================================
   INTROSPECCIÓN (funciona sobre una conexión c con query/get/run)
========================================================================= */

const listTables = async (c) => {
  if (isPg) {
    const rows = await c.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`
    );
    return rows.map((r) => r.name);
  }
  const rows = await c.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_mig\\_%' ESCAPE '\\' ORDER BY name"
  );
  return rows.map((r) => r.name);
};

const listColumns = async (c, table) => {
  if (isPg) {
    const rows = await c.query(
      `SELECT column_name AS name, column_default AS dflt
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ?`,
      [table]
    );
    return rows;
  }
  const rows = await c.query(`PRAGMA table_info("${table}")`);
  return rows.map((r) => ({ name: r.name, dflt: r.dflt_value }));
};

/** FKs de una sola columna: [{ from, table, to, onDelete }] */
const listForeignKeys = async (c, table) => {
  if (isPg) {
    const rows = await c.query(
      `SELECT att.attname AS "from", pcl.relname AS "table", patt.attname AS "to",
              con.confdeltype AS deltype, array_length(con.conkey, 1) AS ncols
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
       JOIN pg_class pcl ON pcl.oid = con.confrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
       JOIN pg_attribute patt ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[1]
       WHERE con.contype = 'f' AND ns.nspname = current_schema() AND cl.relname = ?`,
      [table]
    );
    const map = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
    return rows
      .filter((r) => Number(r.ncols) === 1)
      .map((r) => ({ from: r.from, table: r.table, to: r.to, onDelete: map[r.deltype] || 'NO ACTION' }));
  }
  const rows = await c.query(`PRAGMA foreign_key_list("${table}")`);
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r);
  }
  return [...byId.values()]
    .filter((parts) => parts.length === 1)
    .map(([r]) => ({ from: r.from, table: r.table, to: r.to, onDelete: r.on_delete }));
};

/** FKs compuestas existentes: lista de "colA,colB->tabla" para detectar duplicados. */
const listCompositeFkKeys = async (c, table) => {
  if (isPg) {
    const rows = await c.query(
      `SELECT con.conname AS name FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
       WHERE con.contype = 'f' AND ns.nspname = current_schema() AND cl.relname = ?`,
      [table]
    );
    return new Set(rows.map((r) => r.name));
  }
  const rows = await c.query(`PRAGMA foreign_key_list("${table}")`);
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, { cols: [], table: r.table });
    byId.get(r.id).cols.push(r.from);
  }
  return new Set([...byId.values()].filter((f) => f.cols.length > 1).map((f) => `${f.cols.join(',')}->${f.table}`));
};

const constraintExists = async (c, name) => {
  if (!isPg) return false;
  const row = await c.get('SELECT 1 AS ok FROM pg_constraint WHERE conname = ?', [name]);
  return Boolean(row);
};

/* =========================================================================
   PLAN DE BLINDAJE (común a ambos motores)
========================================================================= */

/**
 * Calcula, para cada tabla, qué hay que corregir:
 *  - dropHotelDefault: hotel_id / default_hotel_id con DEFAULT 1 (fuga entre hoteles)
 *  - fixCreatedAt:     created_at con fecha fija
 *  - hotelFk:          hotel_id sin FK a hotels
 *  - tenantFks:        (hotel_id, col) -> padre(hotel_id, id) para que un registro
 *                      no pueda apuntar a datos de OTRO hotel
 *  - checks:           restricciones CHECK de dinero
 */
const buildPlan = async (c) => {
  const tables = await listTables(c);
  const info = {};
  for (const t of tables) {
    const cols = await listColumns(c, t);
    info[t] = { cols, names: new Set(cols.map((x) => x.name)), fks: await listForeignKeys(c, t) };
  }

  const plan = {};
  const parentsNeedingKey = new Set();
  const skipped = [];

  for (const t of tables) {
    const { cols, names, fks } = info[t];
    const p = { dropDefaults: [], fixCreatedAt: false, addFks: [], checks: [] };

    for (const col of cols) {
      if ((col.name === 'hotel_id' || col.name === 'default_hotel_id') && col.dflt !== null && col.dflt !== undefined) {
        p.dropDefaults.push(col.name);
      }
      if (col.name === 'created_at' && col.dflt && /^'?\d{4}-\d{2}-\d{2}'?(::text)?$/.test(String(col.dflt).trim())) {
        p.fixCreatedAt = true;
      }
    }

    if (names.has('hotel_id') && t !== 'hotels') {
      const hasHotelFk = fks.some((f) => f.from === 'hotel_id' && f.table === 'hotels');
      if (!hasHotelFk) {
        p.addFks.push({
          cols: ['hotel_id'],
          ref: 'hotels',
          refCols: ['id'],
          onDelete: t === 'user_sessions' ? 'SET NULL' : 'CASCADE',
          name: pgName(`fk_${t}_hotel`)
        });
      }
    }

    if (t === 'users' && names.has('default_hotel_id')) {
      const hasFk = fks.some((f) => f.from === 'default_hotel_id' && f.table === 'hotels');
      if (!hasFk) {
        p.addFks.push({
          cols: ['default_hotel_id'],
          ref: 'hotels',
          refCols: ['id'],
          onDelete: 'SET NULL',
          name: pgName('fk_users_default_hotel')
        });
      }
    }

    // FKs compuestas de aislamiento entre hoteles
    if (names.has('hotel_id') && !GLOBAL_TABLES.has(t)) {
      const existing = await listCompositeFkKeys(c, t);
      for (const fk of fks) {
        if (fk.to !== 'id' || GLOBAL_TABLES.has(fk.table) || fk.from === 'hotel_id') continue;
        const parent = info[fk.table];
        if (!parent || !parent.names.has('hotel_id')) continue;
        const name = pgName(`fk_${t}_${fk.from}_tenant`);
        const key = `hotel_id,${fk.from}->${fk.table}`;
        if (isPg ? existing.has(name) : existing.has(key)) continue;
        // Registros que YA apuntan a datos de otro hotel: no bloquear el arranque,
        // omitir esta restricción y reportarlo para corregirlo a mano.
        const mixed = await c.get(
          `SELECT COUNT(*) AS n FROM ${t} ch JOIN ${fk.table} pa ON pa.id = ch.${fk.from}
           WHERE ch.${fk.from} IS NOT NULL AND ch.hotel_id <> pa.hotel_id`
        );
        if (Number(mixed?.n || 0) > 0) {
          log(`AVISO: ${mixed.n} fila(s) de ${t}.${fk.from} apuntan a ${fk.table} de OTRO hotel; no se agrega ${name}.`);
          skipped.push(`${t}.${fk.from}`);
          continue;
        }
        parentsNeedingKey.add(fk.table);
        p.addFks.push({ cols: ['hotel_id', fk.from], ref: fk.table, refCols: ['hotel_id', 'id'], onDelete: null, name });
      }
    }

    for (const chk of CHECKS[t] || []) {
      p.checks.push(chk);
    }

    if (p.dropDefaults.length || p.fixCreatedAt || p.addFks.length || p.checks.length) plan[t] = p;
  }
  return { plan, parentsNeedingKey, info, skipped };
};

/** Devuelve las CHECK que los datos actuales cumplen (las demás se omiten con aviso). */
const validChecks = async (c, table, checks) => {
  const ok = [];
  for (const chk of checks) {
    const bad = await c.get(`SELECT COUNT(*) AS n FROM ${table} WHERE NOT (${chk.expr})`);
    if (Number(bad?.n || 0) > 0) {
      log(`AVISO: no se aplica ${chk.name} en ${table}: ${bad.n} fila(s) no cumplen "${chk.expr}".`);
    } else {
      ok.push(chk);
    }
  }
  return ok;
};

/* =========================================================================
   MIGRACIÓN 1: limpieza de datos
========================================================================= */

const cleanupData = async (c) => {
  const tables = await listTables(c);
  const report = [];

  // Usuarios cuyo hotel por defecto ya no existe
  const fixedDefault = await c.run(
    `UPDATE users SET default_hotel_id = NULL
     WHERE default_hotel_id IS NOT NULL AND default_hotel_id NOT IN (SELECT id FROM hotels)`
  );
  await c.run(
    `UPDATE users SET default_hotel_id = (
       SELECT MIN(uh.hotel_id) FROM user_hotels uh WHERE uh.user_id = users.id AND uh.active = 1
     ) WHERE default_hotel_id IS NULL`
  );
  if (fixedDefault.changes) report.push(`users.default_hotel_id inválido corregido: ${fixedDefault.changes}`);

  // Sesiones de hoteles eliminados: se conservan, sin hotel
  if (tables.includes('user_sessions')) {
    const r = await c.run(
      'UPDATE user_sessions SET hotel_id = NULL WHERE hotel_id IS NOT NULL AND hotel_id NOT IN (SELECT id FROM hotels)'
    );
    if (r.changes) report.push(`user_sessions sin hotel válido: ${r.changes}`);
  }

  // Filas de hoteles que ya no existen (inalcanzables). Se borran en varias
  // pasadas porque algunas dependen de otras (FK RESTRICT).
  const scoped = [];
  for (const t of tables) {
    if (GLOBAL_TABLES.has(t) || t === 'user_sessions') continue;
    const cols = await listColumns(c, t);
    if (cols.some((x) => x.name === 'hotel_id')) scoped.push(t);
  }
  for (let pass = 0; pass < 6; pass++) {
    let pending = 0;
    for (const t of scoped) {
      const n = await c.get(`SELECT COUNT(*) AS n FROM ${t} WHERE hotel_id NOT IN (SELECT id FROM hotels)`);
      if (!Number(n?.n)) continue;
      // En PG un error aborta la transacción completa: aislarlo con SAVEPOINT.
      if (isPg) await c.run('SAVEPOINT limpieza');
      try {
        const r = await c.run(`DELETE FROM ${t} WHERE hotel_id NOT IN (SELECT id FROM hotels)`);
        if (isPg) await c.run('RELEASE SAVEPOINT limpieza');
        report.push(`${t}: ${r.changes} fila(s) huérfana(s) eliminada(s)`);
      } catch (_) {
        if (isPg) await c.run('ROLLBACK TO SAVEPOINT limpieza');
        pending++;
      }
    }
    if (!pending) break;
  }
  return report;
};

/* =========================================================================
   MIGRACIÓN 2: restricciones (SQLite: reconstrucción / PG: ALTER)
========================================================================= */

const fkClause = (fk) =>
  `FOREIGN KEY (${fk.cols.join(', ')}) REFERENCES ${fk.ref} (${fk.refCols.join(', ')})${
    fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ''
  }`;

const tenantKeyIndex = (parent) => `ux_${parent}_tenant_key`;

/** Transforma el DDL original de SQLite aplicando el plan. */
const transformSqliteDdl = (sql, table, p, checks) => {
  let ddl = sql.replace(/^CREATE TABLE\s+("?)(\w+)\1/i, `CREATE TABLE "_mig_${table}"`);
  for (const col of p.dropDefaults) {
    const re = new RegExp(`(\\b${col}\\s+INTEGER(?:\\s+NOT\\s+NULL)?)\\s+DEFAULT\\s+\\(?'?\\d+'?\\)?`, 'i');
    ddl = ddl.replace(re, '$1');
  }
  if (p.fixCreatedAt) {
    ddl = ddl.replace(
      /(\bcreated_at\s+TEXT(?:\s+NOT\s+NULL)?)\s+DEFAULT\s+'\d{4}-\d{2}-\d{2}'/i,
      `$1 DEFAULT ${NOW_DATE_DEFAULT}`
    );
  }
  const extra = [...p.addFks.map(fkClause), ...checks.map((k) => `CONSTRAINT ${k.name} CHECK (${k.expr})`)];
  if (extra.length) {
    const close = ddl.lastIndexOf(')');
    ddl = `${ddl.slice(0, close).replace(/\s+$/, '')},\n        ${extra.join(',\n        ')}\n      )`;
  }
  return ddl;
};

const hardenSqlite = async () =>
  db.withExclusiveConnection(async (c) => {
    await c.run('PRAGMA foreign_keys = OFF');
    try {
      await c.run('BEGIN IMMEDIATE TRANSACTION');
      try {
        const { plan, parentsNeedingKey, skipped } = await buildPlan(c);
        const done = [];
        done.skipped = skipped;
        for (const [table, p] of Object.entries(plan)) {
          const checks = await validChecks(c, table, p.checks);
          const master = await c.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
          const indexes = await c.query(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL",
            [table]
          );
          const seq = await c.get('SELECT seq FROM sqlite_sequence WHERE name = ?', [table]).catch(() => null);
          const ddl = transformSqliteDdl(master.sql, table, p, checks);

          await c.run(`DROP TABLE IF EXISTS "_mig_${table}"`);
          await c.run(ddl);
          await c.run(`INSERT INTO "_mig_${table}" SELECT * FROM "${table}"`);
          await c.run(`DROP TABLE "${table}"`);
          await c.run(`ALTER TABLE "_mig_${table}" RENAME TO "${table}"`);
          for (const ix of indexes) await c.run(ix.sql);
          if (seq && seq.seq) {
            await c.run('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?', [seq.seq, table]);
          }
          done.push(table);
        }
        // Clave única (hotel_id, id) en las tablas padre de las FK compuestas
        for (const parent of parentsNeedingKey) {
          await c.run(`CREATE UNIQUE INDEX IF NOT EXISTS ${tenantKeyIndex(parent)} ON ${parent} (hotel_id, id)`);
        }
        const violations = await c.query('PRAGMA foreign_key_check');
        if (violations.length) {
          const sample = violations
            .slice(0, 10)
            .map((v) => `${v.table}#${v.rowid}->${v.parent}`)
            .join(', ');
          throw new Error(`Hay ${violations.length} referencia(s) inválida(s): ${sample}`);
        }
        await c.run('COMMIT');
        return done;
      } catch (err) {
        await c.run('ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      await c.run('PRAGMA foreign_keys = ON');
    }
  });

const hardenPg = async () =>
  db.withTransaction(async (c) => {
    const { plan, parentsNeedingKey, skipped } = await buildPlan(c);
    const done = [];
    done.skipped = skipped;
    for (const parent of parentsNeedingKey) {
      await c.run(`CREATE UNIQUE INDEX IF NOT EXISTS ${tenantKeyIndex(parent)} ON ${parent} (hotel_id, id)`);
    }
    for (const [table, p] of Object.entries(plan)) {
      for (const col of p.dropDefaults) {
        await c.run(`ALTER TABLE ${table} ALTER COLUMN ${col} DROP DEFAULT`);
      }
      if (p.fixCreatedAt) {
        await c.run(`ALTER TABLE ${table} ALTER COLUMN created_at SET DEFAULT ${NOW_DATE_DEFAULT}`);
      }
      for (const fk of p.addFks) {
        if (await constraintExists(c, fk.name)) continue;
        await c.run(`ALTER TABLE ${table} ADD CONSTRAINT ${fk.name} ${fkClause(fk)}`);
      }
      for (const chk of await validChecks(c, table, p.checks)) {
        if (await constraintExists(c, chk.name)) continue;
        await c.run(`ALTER TABLE ${table} ADD CONSTRAINT ${chk.name} CHECK (${chk.expr})`);
      }
      done.push(table);
    }
    return done;
  });

/* =========================================================================
   MIGRACIÓN 3: índices
========================================================================= */

const HOT_COLUMNS = ['status', 'date', 'shift_date', 'scheduled_date', 'check_in_date', 'check_out_date', 'created_at'];

const createIndexes = async (c) => {
  const tables = await listTables(c);
  let created = 0;
  const make = async (name, table, cols) => {
    await c.run(`CREATE INDEX IF NOT EXISTS ${pgName(name)} ON ${table} (${cols.join(', ')})`);
    created++;
  };
  for (const t of tables) {
    if (t === 'schema_migrations') continue;
    const names = new Set((await listColumns(c, t)).map((x) => x.name));
    if (names.has('hotel_id')) {
      await make(`idx_${t}_hotel`, t, ['hotel_id']);
      for (const hc of HOT_COLUMNS) {
        if (names.has(hc)) await make(`idx_${t}_hotel_${hc}`, t, ['hotel_id', hc]);
      }
    }
    for (const fk of await listForeignKeys(c, t)) {
      if (fk.from === 'hotel_id') continue;
      await make(`idx_${t}_${fk.from}`, t, [fk.from]);
    }
  }
  // Consultas frecuentes fuera de hotel_id
  if (tables.includes('user_sessions')) await make('idx_user_sessions_user', 'user_sessions', ['user_id', 'revoked']);
  if (tables.includes('user_hotels')) await make('idx_user_hotels_hotel', 'user_hotels', ['hotel_id', 'active']);
  return created;
};

/* =========================================================================
   EJECUCIÓN
========================================================================= */

const MIGRATIONS = [
  {
    version: 1,
    name: 'limpieza_datos_multitenant',
    up: () => db.withTransaction((c) => cleanupData(c))
  },
  {
    version: 2,
    name: 'restricciones_multitenant',
    up: () => (isPg ? hardenPg() : hardenSqlite())
  },
  {
    version: 3,
    name: 'indices_rendimiento',
    up: () => db.withTransaction((c) => createIndexes(c))
  }
];

const runMigrations = async () => {
  await db.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`
  );
  const applied = new Set((await db.query('SELECT version FROM schema_migrations')).map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    log(`Aplicando ${m.version} (${m.name})…`);
    const result = await m.up();
    if (result && Array.isArray(result.skipped) && result.skipped.length) {
      // Quedaron restricciones sin aplicar por datos mezclados entre hoteles:
      // no se marca como aplicada para reintentarlo en el próximo arranque.
      log(`  ${m.name}: pendiente por datos a corregir (${result.skipped.join(', ')}); se reintentará al reiniciar.`);
      continue;
    }
    // schema_migrations no tiene columna id: en PG se indica RETURNING explícito.
    await db.run(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)${isPg ? ' RETURNING version' : ''}`, [
      m.version,
      m.name,
      new Date().toISOString()
    ]);
    if (Array.isArray(result) && result.length) log(`  ${m.name}: ${result.join(' | ')}`);
    else if (typeof result === 'number') log(`  ${m.name}: ${result} índice(s) asegurado(s)`);
  }
  if (!isPg) await db.run('PRAGMA optimize');
};

module.exports = { runMigrations, MIGRATIONS, buildPlan, transformSqliteDdl };
