const db = require('../config/db');
const { getTodayString } = require('../utils/date');
const { ensureHotelDefaults } = require('../db/init');

// Listar todos los establecimientos a los que el usuario tiene acceso con resumen en tiempo real
exports.listHotels = async (req, res) => {
  try {
    const user = req.user;
    const hotels = await db.query(
      `SELECT h.*, uh.role as user_role
       FROM hotels h
       JOIN user_hotels uh ON uh.hotel_id = h.id
       WHERE uh.user_id = ? AND uh.active = 1 AND h.active = 1
       ORDER BY h.id ASC`,
      [user.id]
    );

    const today = getTodayString();
    const enriched = [];

    for (const h of hotels) {
      const roomStats = await db.get(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('OCUPADA', 'Pendiente de pago') THEN 1 ELSE 0 END) as occupied,
          SUM(CASE WHEN status = 'RESERVADA' THEN 1 ELSE 0 END) as reserved,
          SUM(CASE WHEN status IN ('LIMPIEZA', 'PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA', 'INSPECCION_PENDIENTE') THEN 1 ELSE 0 END) as cleaning,
          SUM(CASE WHEN status IN ('MANTENIMIENTO', 'FUERA_DE_SERVICIO') THEN 1 ELSE 0 END) as maintenance
         FROM rooms WHERE hotel_id = ? AND active = 1`,
        [h.id]
      );

      const staysStats = await db.get(
        "SELECT COUNT(*) as active_guests FROM stays WHERE hotel_id = ? AND status = 'ACTIVA'",
        [h.id]
      );

      const regStats = await db.get(
        "SELECT COUNT(*) as open_registers FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA'",
        [h.id]
      );

      const txStats = await db.get(
        `SELECT
          SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END) as income_today,
          SUM(CASE WHEN type = 'EGRESO' THEN amount ELSE 0 END) as expense_today,
          SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN amount ELSE 0 END) as services_today
         FROM cash_movements
         WHERE hotel_id = ? AND date LIKE ? AND COALESCE(voided, 0) = 0`,
        [h.id, `${today}%`]
      );

      const total = Number(roomStats?.total || 0);
      const occupied = Number(roomStats?.occupied || 0);
      const reserved = Number(roomStats?.reserved || 0);
      const cleaning = Number(roomStats?.cleaning || 0);
      const maintenance = Number(roomStats?.maintenance || 0);
      const free = Math.max(0, total - occupied - reserved - cleaning - maintenance);

      enriched.push({
        ...h,
        stats: {
          total_rooms: total,
          occupied_rooms: occupied,
          reserved_rooms: reserved,
          free_rooms: free,
          cleaning_rooms: cleaning,
          maintenance_rooms: maintenance,
          occupancy_rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
          active_guests: Number(staysStats?.active_guests || occupied),
          open_registers: Number(regStats?.open_registers || 0),
          income_today: Number(txStats?.income_today || 0),
          expense_today: Number(txStats?.expense_today || 0),
          services_today: Number(txStats?.services_today || 0)
        }
      });
    }

    res.json(enriched);
  } catch (error) {
    console.error('Error al listar hoteles:', error);
    res.status(500).json({ error: 'Error al obtener la lista de establecimientos.' });
  }
};

// Crear un nuevo establecimiento hotelero (Multi-Tenant)
exports.createHotel = async (req, res) => {
  try {
    const {
      name,
      legal_name,
      tax_id,
      tax_regime,
      address,
      city,
      country,
      phone,
      email,
      currency,
      timezone,
      check_in_time,
      check_out_time
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre comercial del hotel es obligatorio.' });
    }

    const today = getTodayString();

    const newHotel = await db.withTransaction(async (tx) => {
      const countRes = await tx.get('SELECT COUNT(*) as c FROM hotels');
      const nextNum = Number(countRes?.c || 0) + 1;
      const code = `hotel-${nextNum}-${Date.now().toString().slice(-4)}`;

      const ins = await tx.run(
        `INSERT INTO hotels (
          code, name, legal_name, tax_id, tax_regime, address, city, country,
          phone, email, currency, timezone, check_in_time, check_out_time, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          code,
          name.trim(),
          legal_name || name.trim(),
          tax_id || '',
          tax_regime || 'Régimen Simplificado / No Responsable de IVA',
          address || '',
          city || 'Colombia',
          country || 'Colombia',
          phone || '',
          email || '',
          currency || 'COP',
          timezone || 'America/Bogota',
          check_in_time || '15:00',
          check_out_time || '13:00',
          today
        ]
      );

      const hotelId = ins.id;

      await tx.run(
        'INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, ?, ?, 1)',
        [req.user.id, hotelId, 'PROPIETARIO']
      );

      await tx.run(
        `INSERT INTO cash_registers (hotel_id, user_id, name, opening_time, opening_balance, status)
         VALUES (?, ?, 'Caja Principal Recepción', ?, 0, 'ABIERTA')`,
        [hotelId, req.user.id, today]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CREAR_HOTEL', 'CONFIGURACION', ?, ?, ?)`,
        [hotelId, req.user.id, hotelId, `Nuevo establecimiento creado: ${name.trim()}`, today]
      );

      return await tx.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    });

    await ensureHotelDefaults(newHotel.id);

    res.status(201).json({
      message: 'Establecimiento hotelero creado e inicializado con éxito.',
      hotel: newHotel
    });
  } catch (error) {
    console.error('Error al crear hotel:', error);
    res.status(500).json({ error: 'Error interno al crear el establecimiento hotelero.' });
  }
};

// Obtener configuración completa de un establecimiento
exports.getHotelConfig = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    const taxes = await db.query('SELECT * FROM hotel_taxes WHERE hotel_id = ? ORDER BY id ASC', [hotelId]);
    const paymentMethods = await db.query(
      'SELECT * FROM hotel_payment_methods WHERE hotel_id = ? ORDER BY id ASC',
      [hotelId]
    );
    const departments = await db.query(
      'SELECT * FROM hotel_departments WHERE hotel_id = ? ORDER BY id ASC',
      [hotelId]
    );
    const roomTypes = await db.query(
      'SELECT * FROM room_types WHERE hotel_id = ? AND active = 1 ORDER BY id ASC',
      [hotelId]
    );

    res.json({
      hotel,
      taxes,
      paymentMethods,
      departments,
      roomTypes
    });
  } catch (error) {
    console.error('Error al obtener configuración del hotel:', error);
    res.status(500).json({ error: 'Error al cargar la configuración del hotel.' });
  }
};

// Actualizar identidad comercial, datos tributarios y políticas del hotel
exports.updateHotelConfig = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      name,
      legal_name,
      tax_id,
      tax_regime,
      logo_url,
      address,
      city,
      country,
      phone,
      email,
      website,
      currency,
      timezone,
      check_in_time,
      check_out_time,
      accommodation_policy,
      cancellation_policy,
      reservation_policy,
      sire_code,
      tra_code
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre comercial del hotel es obligatorio.' });
    }

    await db.run(
      `UPDATE hotels SET
        name = ?,
        legal_name = ?,
        tax_id = ?,
        tax_regime = ?,
        logo_url = ?,
        address = ?,
        city = ?,
        country = ?,
        phone = ?,
        email = ?,
        website = ?,
        currency = ?,
        timezone = ?,
        check_in_time = ?,
        check_out_time = ?,
        accommodation_policy = ?,
        cancellation_policy = ?,
        reservation_policy = ?,
        sire_code = ?,
        tra_code = ?
       WHERE id = ?`,
      [
        name.trim(),
        legal_name || '',
        tax_id || '',
        tax_regime || '',
        logo_url || '/logo.png',
        address || '',
        city || '',
        country || 'Colombia',
        phone || '',
        email || '',
        website || '',
        currency || 'COP',
        timezone || 'America/Bogota',
        check_in_time || '15:00',
        check_out_time || '13:00',
        accommodation_policy || '',
        cancellation_policy || '',
        reservation_policy || '',
        sire_code || '',
        tra_code || '',
        hotelId
      ]
    );

    await db.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
       VALUES (?, ?, 'ACTUALIZAR_CONFIG_HOTEL', 'CONFIGURACION', ?, ?, ?)`,
      [hotelId, req.user.id, hotelId, `Configuración actualizada para ${name.trim()}`, getTodayString()]
    );

    const updated = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    res.json({ message: 'Configuración del hotel actualizada correctamente.', hotel: updated });
  } catch (error) {
    console.error('Error al actualizar hotel:', error);
    res.status(500).json({ error: 'Error al guardar la configuración del hotel.' });
  }
};

// --- IMPUESTOS ---
exports.createTax = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { name, code, percentage, is_inclusive, applies_to } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Nombre y código del impuesto son obligatorios.' });
    }
    const result = await db.run(
      `INSERT INTO hotel_taxes (hotel_id, name, code, percentage, is_inclusive, applies_to, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [hotelId, name.trim(), code.trim().toUpperCase(), Number(percentage || 0), is_inclusive ? 1 : 0, applies_to || 'ALL']
    );
    const created = await db.get('SELECT * FROM hotel_taxes WHERE id = ?', [result.id]);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear impuesto.' });
  }
};

exports.updateTax = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const taxId = req.params.taxId;
    const { name, code, percentage, is_inclusive, applies_to, active } = req.body;
    await db.run(
      `UPDATE hotel_taxes
       SET name = COALESCE(?, name),
           code = COALESCE(?, code),
           percentage = COALESCE(?, percentage),
           is_inclusive = COALESCE(?, is_inclusive),
           applies_to = COALESCE(?, applies_to),
           active = COALESCE(?, active)
       WHERE id = ? AND hotel_id = ?`,
      [
        name,
        code ? code.toUpperCase() : null,
        percentage !== undefined ? Number(percentage) : null,
        is_inclusive !== undefined ? (is_inclusive ? 1 : 0) : null,
        applies_to,
        active !== undefined ? (active ? 1 : 0) : null,
        taxId,
        hotelId
      ]
    );
    const updated = await db.get('SELECT * FROM hotel_taxes WHERE id = ? AND hotel_id = ?', [taxId, hotelId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar impuesto.' });
  }
};

exports.deleteTax = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const taxId = req.params.taxId;
    await db.run('DELETE FROM hotel_taxes WHERE id = ? AND hotel_id = ?', [taxId, hotelId]);
    res.json({ message: 'Impuesto eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar impuesto.' });
  }
};

// --- MÉTODOS DE PAGO ---
exports.createPaymentMethod = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { name, code, type, requires_reference } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre del método de pago es obligatorio.' });
    const cleanCode = (code || name).trim().toUpperCase().replace(/\s+/g, '_');
    const result = await db.run(
      `INSERT INTO hotel_payment_methods (hotel_id, name, code, type, requires_reference, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [hotelId, name.trim(), cleanCode, type || 'CASH', requires_reference ? 1 : 0]
    );
    const created = await db.get('SELECT * FROM hotel_payment_methods WHERE id = ?', [result.id]);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear método de pago.' });
  }
};

exports.updatePaymentMethod = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const pmId = req.params.pmId;
    const { name, type, requires_reference, active } = req.body;
    await db.run(
      `UPDATE hotel_payment_methods
       SET name = COALESCE(?, name),
           type = COALESCE(?, type),
           requires_reference = COALESCE(?, requires_reference),
           active = COALESCE(?, active)
       WHERE id = ? AND hotel_id = ?`,
      [
        name,
        type,
        requires_reference !== undefined ? (requires_reference ? 1 : 0) : null,
        active !== undefined ? (active ? 1 : 0) : null,
        pmId,
        hotelId
      ]
    );
    const updated = await db.get('SELECT * FROM hotel_payment_methods WHERE id = ? AND hotel_id = ?', [pmId, hotelId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar método de pago.' });
  }
};

exports.deletePaymentMethod = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const pmId = req.params.pmId;
    await db.run('DELETE FROM hotel_payment_methods WHERE id = ? AND hotel_id = ?', [pmId, hotelId]);
    res.json({ message: 'Método de pago eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar método de pago.' });
  }
};

// --- DEPARTAMENTOS ---
exports.createDepartment = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { name, code, description } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre del departamento es obligatorio.' });
    const cleanCode = (code || name).trim().toUpperCase().replace(/\s+/g, '_');
    const result = await db.run(
      `INSERT INTO hotel_departments (hotel_id, name, code, description, active)
       VALUES (?, ?, ?, ?, 1)`,
      [hotelId, name.trim(), cleanCode, description || '']
    );
    const created = await db.get('SELECT * FROM hotel_departments WHERE id = ?', [result.id]);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear departamento.' });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const deptId = req.params.deptId;
    await db.run('DELETE FROM hotel_departments WHERE id = ? AND hotel_id = ?', [deptId, hotelId]);
    res.json({ message: 'Departamento eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar departamento.' });
  }
};

// --- TIPOS DE HABITACIÓN ---
exports.getRoomTypes = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const types = await db.query(
      `SELECT
        rt.*,
        COUNT(r.id) as rooms_count
       FROM room_types rt
       LEFT JOIN rooms r ON r.room_type_id = rt.id AND r.active = 1
       WHERE rt.hotel_id = ? AND rt.active = 1
       GROUP BY rt.id
       ORDER BY rt.id ASC`,
      [hotelId]
    );
    const formatted = types.map((rt) => {
      let parsedPhotos = [];
      if (rt.photos) {
        try {
          const p = JSON.parse(rt.photos);
          if (Array.isArray(p)) parsedPhotos = p;
        } catch (_) {
          parsedPhotos = String(rt.photos)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
      return {
        ...rt,
        base_price: Number(rt.base_price || 0),
        rate_3_days: rt.rate_3_days !== null && rt.rate_3_days !== undefined ? Number(rt.rate_3_days) : null,
        rate_weekly: rt.rate_weekly !== null && rt.rate_weekly !== undefined ? Number(rt.rate_weekly) : null,
        capacity: Number(rt.capacity || 2),
        rooms_count: Number(rt.rooms_count || 0),
        photos_list: parsedPhotos
      };
    });
    res.json(formatted);
  } catch (error) {
    console.error('Error al listar tipos de habitación:', error);
    res.status(500).json({ error: 'Error al listar tipos de habitación.' });
  }
};

exports.createRoomType = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      name,
      code,
      base_price,
      rate_3_days,
      rate_weekly,
      capacity,
      bed_config,
      amenities,
      photos,
      description
    } = req.body;
    if (!name || base_price === undefined) {
      return res.status(400).json({ error: 'Nombre y tarifa base son obligatorios.' });
    }
    const photosStr = Array.isArray(photos)
      ? JSON.stringify(photos.filter(Boolean))
      : typeof photos === 'string' && photos.trim().length > 0
      ? JSON.stringify(
          photos
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : '[]';

    const result = await db.run(
      `INSERT INTO room_types (
        hotel_id, name, code, base_price, rate_3_days, rate_weekly,
        capacity, bed_config, amenities, photos, description, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        hotelId,
        name.trim(),
        (code || 'STD').trim().toUpperCase(),
        Number(base_price),
        rate_3_days !== undefined && rate_3_days !== '' && rate_3_days !== null ? Number(rate_3_days) : null,
        rate_weekly !== undefined && rate_weekly !== '' && rate_weekly !== null ? Number(rate_weekly) : null,
        Number(capacity || 2),
        bed_config || '1 Cama Doble',
        amenities || 'Baño privado, TV, Wi-Fi',
        photosStr,
        description || ''
      ]
    );
    const created = await db.get('SELECT * FROM room_types WHERE id = ?', [result.id]);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear tipo de habitación.' });
  }
};

exports.updateRoomType = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const rtId = req.params.rtId;
    const {
      name,
      code,
      base_price,
      rate_3_days,
      rate_weekly,
      capacity,
      bed_config,
      amenities,
      photos,
      description
    } = req.body;

    let photosStr = null;
    if (photos !== undefined) {
      photosStr = Array.isArray(photos)
        ? JSON.stringify(photos.filter(Boolean))
        : typeof photos === 'string'
        ? JSON.stringify(
            photos
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        : '[]';
    }

    await db.run(
      `UPDATE room_types
       SET name = COALESCE(?, name),
           code = COALESCE(?, code),
           base_price = COALESCE(?, base_price),
           rate_3_days = COALESCE(?, rate_3_days),
           rate_weekly = COALESCE(?, rate_weekly),
           capacity = COALESCE(?, capacity),
           bed_config = COALESCE(?, bed_config),
           amenities = COALESCE(?, amenities),
           photos = COALESCE(?, photos),
           description = COALESCE(?, description)
       WHERE id = ? AND hotel_id = ?`,
      [
        name || null,
        code ? code.toUpperCase() : null,
        base_price !== undefined ? Number(base_price) : null,
        rate_3_days !== undefined && rate_3_days !== '' ? Number(rate_3_days) : null,
        rate_weekly !== undefined && rate_weekly !== '' ? Number(rate_weekly) : null,
        capacity !== undefined ? Number(capacity) : null,
        bed_config !== undefined ? bed_config : null,
        amenities !== undefined ? amenities : null,
        photosStr,
        description !== undefined ? description : null,
        rtId,
        hotelId
      ]
    );
    const updated = await db.get('SELECT * FROM room_types WHERE id = ? AND hotel_id = ?', [rtId, hotelId]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar tipo de habitación.' });
  }
};

exports.deleteRoomType = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const rtId = req.params.rtId;
    const roomsUsing = await db.get(
      'SELECT COUNT(*) as c FROM rooms WHERE hotel_id = ? AND room_type_id = ? AND active = 1',
      [hotelId, rtId]
    );
    if (Number(roomsUsing?.c || 0) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar este tipo de habitación porque tiene habitaciones activas asociadas.'
      });
    }
    await db.run('UPDATE room_types SET active = 0 WHERE id = ? AND hotel_id = ?', [rtId, hotelId]);
    res.json({ message: 'Tipo de habitación desactivado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar tipo de habitación.' });
  }
};

