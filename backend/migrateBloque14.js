const { dbType, run, query, get } = require('./src/config/db');
const { getTodayString } = require('./src/utils/date');

const migrateBloque14 = async () => {
  const isPg = dbType === 'pg';
  const pkType = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const numType = isPg ? 'DECIMAL(12,2)' : 'REAL';

  const ensureCol = async (tbl, col, def) => {
    try {
      if (isPg) {
        await run(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      } else {
        const cols = await query(`PRAGMA table_info(${tbl})`);
        if (!cols.some(c => c.name.toLowerCase() === col.toLowerCase())) {
          await run(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`);
          console.log(`Columna ${col} agregada a ${tbl}`);
        }
      }
    } catch (e) {
      console.warn(`Columna ${col} ya existe o error leve:`, e.message);
    }
  };

  await ensureCol('hotels', 'whatsapp_phone_number_id', 'TEXT');
  await ensureCol('hotels', 'whatsapp_access_token', 'TEXT');
  await ensureCol('hotels', 'whatsapp_business_account_id', 'TEXT');
  await ensureCol('hotels', 'smtp_host', 'TEXT');
  await ensureCol('hotels', 'smtp_port', 'INTEGER DEFAULT 587');
  await ensureCol('hotels', 'smtp_user', 'TEXT');
  await ensureCol('hotels', 'smtp_pass', 'TEXT');
  await ensureCol('hotels', 'smtp_from_email', 'TEXT');
  await ensureCol('hotels', 'smtp_secure', 'INTEGER DEFAULT 0');

  // Tabla notification_center
  await run(`
    CREATE TABLE IF NOT EXISTS notification_center (
      id ${pkType},
      hotel_id INTEGER NOT NULL,
      user_id INTEGER,
      category TEXT NOT NULL DEFAULT 'OPERACION',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'INFO',
      action_url TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    )
  `);

  // Tabla message_templates
  await run(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id ${pkType},
      hotel_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'WHATSAPP',
      title TEXT NOT NULL,
      body_template TEXT NOT NULL,
      variables_json TEXT,
      active INTEGER DEFAULT 1,
      updated_at TEXT,
      UNIQUE(hotel_id, code, channel),
      FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
    )
  `);

  // Tabla message_outbox
  await run(`
    CREATE TABLE IF NOT EXISTS message_outbox (
      id ${pkType},
      hotel_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      recipient_name TEXT,
      template_code TEXT,
      message_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDIENTE',
      external_id TEXT,
      error_message TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
    )
  `);

  // Semillas por defecto para cada hotel
  const hotels = await query('SELECT id, name FROM hotels');
  const nowIso = new Date().toISOString();

  for (const h of hotels) {
    const tplCount = await get('SELECT COUNT(*) as c FROM message_templates WHERE hotel_id = ?', [h.id]);
    if (!tplCount || Number(tplCount.c) === 0) {
      const defaultTemplates = [
        [
          'CONFIRMACION_RESERVA',
          'WHATSAPP',
          'Confirmación de Reserva',
          '¡Hola {{guest_name}}! Confirmamos tu reserva {{reservation_code}} en {{hotel_name}} para el check-in el {{check_in_date}} en la habitación {{room_number}}. Saldo pendiente: ${{balance}} COP. ¡Te esperamos!',
          JSON.stringify(['guest_name', 'reservation_code', 'hotel_name', 'check_in_date', 'room_number', 'balance'])
        ],
        [
          'CONFIRMACION_RESERVA',
          'EMAIL',
          'Confirmación de Reserva en {{hotel_name}}',
          'Estimado(a) {{guest_name}},\n\nNos complace confirmar su reserva #{{reservation_code}} en {{hotel_name}}.\n\nDetalles:\n- Check-in: {{check_in_date}} (a partir de las {{check_in_time}})\n- Check-out: {{check_out_date}}\n- Habitación: {{room_number}}\n- Total reserva: ${{total}} COP\n- Saldo pendiente: ${{balance}} COP\n\nDirección: {{hotel_address}}\nTeléfono: {{hotel_phone}}\n\n¡Gracias por elegirnos!',
          JSON.stringify(['guest_name', 'reservation_code', 'hotel_name', 'check_in_date', 'check_in_time', 'check_out_date', 'room_number', 'total', 'balance', 'hotel_address', 'hotel_phone'])
        ],
        [
          'RECORDATORIO_CHECKIN',
          'WHATSAPP',
          'Recordatorio de Check-in Hoy',
          '¡Buen día {{guest_name}}! Te recordamos que hoy es tu fecha de llegada a {{hotel_name}}. Tu habitación {{room_number}} estará lista a partir de las {{check_in_time}}. Contáctanos si tienes algún requerimiento especial al {{hotel_phone}}.',
          JSON.stringify(['guest_name', 'hotel_name', 'room_number', 'check_in_time', 'hotel_phone'])
        ],
        [
          'AVISO_CHECKOUT',
          'WHATSAPP',
          'Aviso de Check-out',
          'Estimado(a) {{guest_name}}, te recordamos que el horario de check-out en {{hotel_name}} es hasta las {{check_out_time}}. Tu saldo pendiente en recepción es ${{balance}} COP. Agradecemos tu visita.',
          JSON.stringify(['guest_name', 'hotel_name', 'check_out_time', 'balance'])
        ],
        [
          'BIENVENIDA_HUESPED',
          'WHATSAPP',
          'Bienvenida al Hotel',
          '¡Bienvenido(a) a {{hotel_name}}, {{guest_name}}! Deseamos que disfrutes tu estancia en la habitación {{room_number}}. Si requieres room service o restaurante, puedes comunicarte con recepción marcando a recepción.',
          JSON.stringify(['hotel_name', 'guest_name', 'room_number'])
        ]
      ];

      for (const [code, channel, title, body, vars] of defaultTemplates) {
        await run(
          `INSERT INTO message_templates (hotel_id, code, channel, title, body_template, variables_json, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [h.id, code, channel, title, body, vars, nowIso]
        );
      }
      console.log(`Plantillas base sembradas para Hotel ${h.id} (${h.name})`);
    }
  }

  console.log('Migración de Bloque 14 completada con éxito.');
};

if (require.main === module) {
  migrateBloque14().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = migrateBloque14;

