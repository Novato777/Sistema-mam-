const db = require('../config/db');
const { getTodayString, formatDate, addDaysToDateStr } = require('../utils/date');
const { postByRuleInTransaction, isBankMethod } = require('./accountingController');

// Asegura una caja abierta en el hotel para registrar cobros/abonos de recepción
const ensureOpenCashRegister = async (txOrDb, hotelId, userId = 1) => {
  let reg = await txOrDb.get(
    "SELECT id FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' ORDER BY id DESC LIMIT 1",
    [hotelId]
  );
  if (!reg) {
    const res = await txOrDb.run(
      `INSERT INTO cash_registers (hotel_id, user_id, name, opening_time, opening_balance, status)
       VALUES (?, ?, 'Caja Principal Recepción', ?, 0, 'ABIERTA')`,
      [hotelId, userId || 1, getTodayString()]
    );
    return res.id;
  }
  return reg.id;
};

const safeParseJsonArray = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

// Recalcula los totales y el saldo de un folio (guest_accounts) a partir de sus cargos y pagos reales
const recalculateAccountTotals = async (txOrDb, accountId) => {
  const chargesRow = await txOrDb.get(
    'SELECT COALESCE(SUM(amount), 0) as total_charges FROM account_charges WHERE account_id = ?',
    [accountId]
  );
  const paymentsRow = await txOrDb.get(
    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE account_id = ?',
    [accountId]
  );
  const totalCharges = Number(chargesRow?.total_charges || 0);
  const totalPaid = Number(paymentsRow?.total_paid || 0);
  const balance = Math.max(0, totalCharges - totalPaid);

  await txOrDb.run(
    'UPDATE guest_accounts SET total_charges = ?, total_paid = ?, balance = ? WHERE id = ?',
    [totalCharges, totalPaid, balance, accountId]
  );

  return { total_charges: totalCharges, total_paid: totalPaid, balance };
};

// 1. Directorio de Huéspedes del Hotel con métricas de visitas e historial
exports.listGuests = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { search, nationality } = req.query;

    const guests = await db.query(
      `SELECT
        g.*,
        (SELECT COUNT(*) FROM stays s WHERE s.guest_id = g.id AND s.hotel_id = g.hotel_id) as total_stays,
        (SELECT COUNT(*) FROM stays s WHERE s.guest_id = g.id AND s.hotel_id = g.hotel_id AND s.status = 'ACTIVA') as active_stays,
        (SELECT MAX(s.check_in_time) FROM stays s WHERE s.guest_id = g.id AND s.hotel_id = g.hotel_id) as last_visit_date,
        (SELECT COALESCE(SUM(ga.total_charges), 0)
         FROM stays s
         JOIN guest_accounts ga ON ga.stay_id = s.id
         WHERE s.guest_id = g.id AND s.hotel_id = g.hotel_id) as total_billed,
        (SELECT COALESCE(SUM(ga.balance), 0)
         FROM stays s
         JOIN guest_accounts ga ON ga.stay_id = s.id
         WHERE s.guest_id = g.id AND s.hotel_id = g.hotel_id AND ga.balance > 0) as pending_balance
       FROM guests g
       WHERE g.hotel_id = ?
       ORDER BY g.id DESC`,
      [hotelId]
    );

    const formatted = guests
      .map((g) => ({
        ...g,
        full_name: `${g.first_name || ''}${g.last_name ? ' ' + g.last_name : ''}`.trim(),
        total_stays: Number(g.total_stays || 0),
        active_stays: Number(g.active_stays || 0),
        total_billed: Number(g.total_billed || 0),
        pending_balance: Number(g.pending_balance || 0),
        vip_status: Number(g.vip_status || 0),
        documents: safeParseJsonArray(g.documents_json)
      }))
      .filter((g) => {
        if (nationality && nationality !== 'ALL') {
          if (nationality === 'EXTRANJERO' && (g.nationality || 'Colombiana').toLowerCase() === 'colombiana') {
            return false;
          }
          if (nationality === 'NACIONAL' && (g.nationality || 'Colombiana').toLowerCase() !== 'colombiana') {
            return false;
          }
        }
        if (search && String(search).trim()) {
          const q = String(search).toLowerCase().trim();
          const match =
            g.full_name.toLowerCase().includes(q) ||
            (g.document || '').toLowerCase().includes(q) ||
            (g.phone || '').toLowerCase().includes(q) ||
            (g.email || '').toLowerCase().includes(q) ||
            (g.company || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      });

    res.json(formatted);
  } catch (error) {
    console.error('Error al listar huéspedes:', error);
    res.status(500).json({ error: 'Error al consultar el directorio de huéspedes.' });
  }
};

// 2. Detalle e Historial Completo de Visitas / Hospedajes de un Huésped
exports.getGuestHistory = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const guestId = Number(req.params.guestId);

    const guest = await db.get('SELECT * FROM guests WHERE id = ? AND hotel_id = ?', [
      guestId,
      hotelId
    ]);
    if (!guest) {
      return res.status(404).json({ error: 'Huésped no encontrado en este establecimiento.' });
    }

    const stays = await db.query(
      `SELECT
        s.*,
        r.number as room_number,
        r.floor as room_floor,
        rt.name as room_type_name,
        ga.id as account_id,
        ga.total_charges,
        ga.total_paid,
        ga.balance,
        ga.status as account_status
       FROM stays s
       LEFT JOIN rooms r ON s.room_id = r.id
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.guest_id = ? AND s.hotel_id = ?
       ORDER BY s.id DESC`,
      [guestId, hotelId]
    );

    const reservations = await db.query(
      `SELECT rv.*
       FROM reservations rv
       WHERE rv.guest_id = ? AND rv.hotel_id = ?
       ORDER BY rv.id DESC`,
      [guestId, hotelId]
    );

    res.json({
      guest: {
        ...guest,
        full_name: `${guest.first_name || ''}${guest.last_name ? ' ' + guest.last_name : ''}`.trim(),
        vip_status: Number(guest.vip_status || 0),
        documents: safeParseJsonArray(guest.documents_json)
      },
      stays: stays.map((s) => ({
        ...s,
        total_charges: Number(s.total_charges || 0),
        total_paid: Number(s.total_paid || 0),
        balance: Number(s.balance || 0),
        documents: safeParseJsonArray(s.documents_json)
      })),
      reservations
    });
  } catch (error) {
    console.error('Error al obtener historial del huésped:', error);
    res.status(500).json({ error: 'Error al consultar el historial del huésped.' });
  }
};

// 3. Crear o Actualizar Ficha de Huésped (con campos legales SIRE/TRA y documentos asociados)
exports.saveGuest = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const guestId = req.params.guestId ? Number(req.params.guestId) : null;
    const {
      first_name,
      last_name,
      full_name,
      doc_type,
      document,
      phone,
      email,
      nationality,
      origin_city,
      destination_city,
      travel_purpose,
      occupation,
      company,
      vehicle_plate,
      emergency_contact,
      address,
      birth_date,
      observations,
      documents,
      vip_status
    } = req.body;

    const resolvedFirstName = (first_name || full_name || '').trim();
    const resolvedLastName = (last_name || '').trim();

    if (!resolvedFirstName) {
      return res.status(400).json({ error: 'El nombre del huésped es obligatorio.' });
    }

    const docsJson = JSON.stringify(safeParseJsonArray(documents));
    const today = getTodayString();

    if (guestId) {
      const existing = await db.get('SELECT id FROM guests WHERE id = ? AND hotel_id = ?', [
        guestId,
        hotelId
      ]);
      if (!existing) {
        return res.status(404).json({ error: 'Huésped no encontrado en este hotel.' });
      }

      await db.run(
        `UPDATE guests
         SET first_name = ?,
             last_name = ?,
             doc_type = COALESCE(?, doc_type),
             document = COALESCE(?, document),
             phone = COALESCE(?, phone),
             email = COALESCE(?, email),
             nationality = COALESCE(?, nationality),
             origin_city = COALESCE(?, origin_city),
             destination_city = COALESCE(?, destination_city),
             travel_purpose = COALESCE(?, travel_purpose),
             occupation = COALESCE(?, occupation),
             company = COALESCE(?, company),
             vehicle_plate = COALESCE(?, vehicle_plate),
             emergency_contact = COALESCE(?, emergency_contact),
             address = COALESCE(?, address),
             birth_date = COALESCE(?, birth_date),
             observations = COALESCE(?, observations),
             documents_json = COALESCE(?, documents_json),
             vip_status = COALESCE(?, vip_status)
         WHERE id = ? AND hotel_id = ?`,
        [
          resolvedFirstName,
          resolvedLastName,
          doc_type || null,
          document !== undefined ? String(document).trim() : null,
          phone !== undefined ? phone : null,
          email !== undefined ? email : null,
          nationality || null,
          origin_city !== undefined ? origin_city : null,
          destination_city !== undefined ? destination_city : null,
          travel_purpose || null,
          occupation !== undefined ? occupation : null,
          company !== undefined ? company : null,
          vehicle_plate !== undefined ? vehicle_plate : null,
          emergency_contact !== undefined ? emergency_contact : null,
          address !== undefined ? address : null,
          birth_date !== undefined ? birth_date : null,
          observations !== undefined ? observations : null,
          documents !== undefined ? docsJson : null,
          vip_status !== undefined ? (vip_status ? 1 : 0) : null,
          guestId,
          hotelId
        ]
      );

      await db.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ACTUALIZAR_HUESPED', 'RECEPCION', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          guestId,
          `Ficha de huésped actualizada: ${resolvedFirstName} ${resolvedLastName} (${document || 'S/D'})`,
          today
        ]
      );

      const updated = await db.get('SELECT * FROM guests WHERE id = ?', [guestId]);
      return res.json({
        message: 'Ficha del huésped actualizada correctamente.',
        guest: {
          ...updated,
          full_name: `${updated.first_name || ''}${updated.last_name ? ' ' + updated.last_name : ''}`.trim(),
          documents: safeParseJsonArray(updated.documents_json)
        }
      });
    }

    const ins = await db.run(
      `INSERT INTO guests (
        hotel_id, first_name, last_name, doc_type, document, phone, email,
        nationality, origin_city, destination_city, travel_purpose, occupation,
        company, vehicle_plate, emergency_contact, address, birth_date,
        observations, documents_json, vip_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        resolvedFirstName,
        resolvedLastName,
        doc_type || 'CC',
        document ? String(document).trim() : '',
        phone || '',
        email || '',
        nationality || 'Colombiana',
        origin_city || '',
        destination_city || '',
        travel_purpose || 'Turismo',
        occupation || '',
        company || '',
        vehicle_plate || '',
        emergency_contact || '',
        address || '',
        birth_date || '',
        observations || '',
        docsJson,
        vip_status ? 1 : 0,
        today
      ]
    );

    await db.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
       VALUES (?, ?, 'REGISTRAR_HUESPED', 'RECEPCION', ?, ?, ?)`,
      [
        hotelId,
        req.user?.id || 1,
        ins.id,
        `Nuevo huésped registrado: ${resolvedFirstName} ${resolvedLastName} (${document || 'S/D'})`,
        today
      ]
    );

    const created = await db.get('SELECT * FROM guests WHERE id = ?', [ins.id]);
    res.status(201).json({
      message: 'Huésped registrado exitosamente.',
      guest: {
        ...created,
        full_name: `${created.first_name || ''}${created.last_name ? ' ' + created.last_name : ''}`.trim(),
        documents: safeParseJsonArray(created.documents_json)
      }
    });
  } catch (error) {
    console.error('Error al guardar huésped:', error);
    res.status(500).json({ error: 'Error interno al guardar la ficha del huésped.' });
  }
};

// 4. Listar Estancias Activas (Huéspedes Alojados Actualmente) e Históricas con Estado de Folio
exports.listStays = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const statusFilter = req.query.status || 'ACTIVA';

    const params = [hotelId];
    let statusClause = '';
    if (statusFilter !== 'ALL') {
      statusClause = 'AND s.status = ?';
      params.push(String(statusFilter));
    }

    const stays = await db.query(
      `SELECT
        s.*,
        r.number as room_number,
        r.floor as room_floor,
        r.status as room_status,
        rt.name as room_type_name,
        g.first_name,
        g.last_name,
        g.doc_type,
        g.document as guest_document,
        g.phone as guest_phone,
        g.email as guest_email,
        g.nationality as guest_nationality,
        COALESCE(NULLIF(s.origin_city, ''), g.origin_city, '') as origin_city,
        COALESCE(NULLIF(s.destination_city, ''), g.destination_city, '') as destination_city,
        COALESCE(NULLIF(s.travel_purpose, ''), g.travel_purpose, 'Turismo') as travel_purpose,
        COALESCE(NULLIF(s.vehicle_plate, ''), g.vehicle_plate, '') as vehicle_plate,
        ga.id as account_id,
        ga.total_charges,
        ga.total_paid,
        ga.balance,
        ga.status as account_status
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.hotel_id = ? ${statusClause}
       ORDER BY s.status ASC, r.floor ASC, r.number ASC, s.id DESC
       LIMIT 200`,
      params
    );

    const companions = await db.query(
      'SELECT * FROM stay_companions WHERE hotel_id = ? ORDER BY id ASC',
      [hotelId]
    );

    const enriched = stays.map((s) => {
      const stayCompanions = companions.filter((c) => Number(c.stay_id) === Number(s.id));
      const isForeign =
        (s.guest_nationality || 'Colombiana').trim().toLowerCase() !== 'colombiana';
      const traComplete = Boolean(
        s.guest_document && s.origin_city && s.destination_city && s.travel_purpose
      );
      const sireApplicable = isForeign;
      const sireComplete = !sireApplicable || Boolean(s.guest_document && s.origin_city && s.destination_city);

      return {
        id: s.id,
        hotel_id: s.hotel_id,
        reservation_id: s.reservation_id,
        room_id: s.room_id,
        room_number: s.room_number,
        room_floor: s.room_floor || '1',
        room_status: s.room_status,
        room_type_name: s.room_type_name || 'Estándar',
        guest_id: s.guest_id,
        guest_name: `${s.first_name || ''}${s.last_name ? ' ' + s.last_name : ''}`.trim(),
        doc_type: s.doc_type || 'CC',
        guest_document: s.guest_document || '',
        guest_phone: s.guest_phone || '',
        guest_email: s.guest_email || '',
        guest_nationality: s.guest_nationality || 'Colombiana',
        origin_city: s.origin_city || '',
        destination_city: s.destination_city || '',
        travel_purpose: s.travel_purpose || 'Turismo',
        vehicle_plate: s.vehicle_plate || '',
        check_in_time: s.check_in_time,
        check_out_time: s.check_out_time,
        expected_check_out: s.expected_check_out || s.next_payment_date || '',
        payment_type: s.payment_type || 'Pago diario',
        next_payment_date: s.next_payment_date || '',
        rate_per_period: Number(s.rate_per_period || 0),
        adults: Number(s.adults || 1),
        children: Number(s.children || 0),
        status: s.status,
        observations: s.observations || '',
        authorized_balance_checkout: Number(s.authorized_balance_checkout || 0),
        checkout_auth_reason: s.checkout_auth_reason || '',
        documents: safeParseJsonArray(s.documents_json),
        companions: stayCompanions,
        account_id: s.account_id,
        total_charges: Number(s.total_charges || 0),
        total_paid: Number(s.total_paid || 0),
        balance: Number(s.balance || 0),
        account_status: s.account_status || 'ABIERTA',
        legal_compliance: {
          tra_ready: traComplete,
          sire_applicable: sireApplicable,
          sire_ready: sireComplete
        }
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error al listar estancias:', error);
    res.status(500).json({ error: 'Error al obtener las estancias del hotel.' });
  }
};

// 5. Consultar Folio / Cuenta de Estancia Detallada (Cargos, Pagos, Acompañantes y Documentos)
exports.getStayFolio = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);

    const stay = await db.get(
      `SELECT
        s.*,
        r.number as room_number,
        r.floor as room_floor,
        rt.name as room_type_name,
        g.first_name,
        g.last_name,
        g.doc_type,
        g.document as guest_document,
        g.phone as guest_phone,
        g.email as guest_email,
        g.nationality as guest_nationality,
        g.documents_json as guest_documents_json,
        ga.id as account_id,
        ga.total_charges,
        ga.total_paid,
        ga.balance,
        ga.status as account_status
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.id = ? AND s.hotel_id = ?`,
      [stayId, hotelId]
    );

    if (!stay) {
      return res.status(404).json({ error: 'Estancia no encontrada en este establecimiento.' });
    }

    const companions = await db.query(
      'SELECT * FROM stay_companions WHERE stay_id = ? AND hotel_id = ? ORDER BY id ASC',
      [stayId, hotelId]
    );

    const charges = stay.account_id
      ? await db.query(
          'SELECT * FROM account_charges WHERE account_id = ? ORDER BY id DESC',
          [stay.account_id]
        )
      : [];

    const payments = stay.account_id
      ? await db.query('SELECT * FROM payments WHERE account_id = ? ORDER BY id DESC', [
          stay.account_id
        ])
      : [];

    res.json({
      stay: {
        ...stay,
        guest_name: `${stay.first_name || ''}${stay.last_name ? ' ' + stay.last_name : ''}`.trim(),
        rate_per_period: Number(stay.rate_per_period || 0),
        total_charges: Number(stay.total_charges || 0),
        total_paid: Number(stay.total_paid || 0),
        balance: Number(stay.balance || 0),
        documents: safeParseJsonArray(stay.documents_json),
        guest_documents: safeParseJsonArray(stay.guest_documents_json)
      },
      companions,
      charges: charges.map((c) => ({ ...c, amount: Number(c.amount || 0) })),
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount || 0) }))
    });
  } catch (error) {
    console.error('Error al consultar folio de estancia:', error);
    res.status(500).json({ error: 'Error al obtener el folio de la estancia.' });
  }
};

// 6. Realizar Check-in Profesional (con validación de estado de habitación, acompañantes, SIRE/TRA y apertura de Folio)
exports.performCheckIn = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      room_id,
      reservation_id,
      guest_id,
      guest_name,
      first_name,
      last_name,
      doc_type,
      guest_document,
      document,
      guest_phone,
      phone,
      guest_email,
      email,
      nationality,
      origin_city,
      destination_city,
      travel_purpose,
      occupation,
      company,
      vehicle_plate,
      emergency_contact,
      payment_type,
      expected_check_out,
      next_payment_date,
      rate_per_period,
      initial_charge,
      initial_payment,
      payment_method,
      adults,
      children,
      companions,
      documents,
      observations,
      force_clean_override
    } = req.body;

    const targetRoomId = Number(room_id);
    const resolvedName = (first_name || guest_name || '').trim();
    const resolvedLastName = (last_name || '').trim();
    const resolvedDoc = String(guest_document || document || '').trim();
    const resolvedPhone = guest_phone || phone || '';
    const resolvedEmail = guest_email || email || '';

    if (!targetRoomId || !resolvedName || !resolvedDoc) {
      return res.status(400).json({
        error:
          'Habitación, nombre del huésped titular y número de documento de identificación son obligatorios para realizar el Check-in.'
      });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const createdStay = await db.withTransaction(async (tx) => {
      // 1. Verificar estado de la habitación para evitar Check-in incorrectos
      const room = await tx.get(
        `SELECT r.*, COALESCE(r.price_override, rt.base_price, 0) as base_price
         FROM rooms r
         LEFT JOIN room_types rt ON r.room_type_id = rt.id
         WHERE r.id = ? AND r.hotel_id = ?`,
        [targetRoomId, hotelId]
      );

      if (!room || Number(room.active) === 0) {
        const err = new Error('La habitación seleccionada no existe o se encuentra desactivada.');
        err.statusCode = 404;
        throw err;
      }

      if (room.status === 'OCUPADA') {
        const err = new Error(
          `Check-in bloqueado: La habitación #${room.number} ya se encuentra OCUPADA por otro huésped.`
        );
        err.statusCode = 409;
        throw err;
      }

      if (room.status === 'MANTENIMIENTO' || room.status === 'FUERA_DE_SERVICIO') {
        const err = new Error(
          `Check-in bloqueado: La habitación #${room.number} está bloqueada por ${room.status}.`
        );
        err.statusCode = 400;
        throw err;
      }

      if (
        ['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA', 'INSPECCION_PENDIENTE'].includes(room.status) &&
        !force_clean_override
      ) {
        const err = new Error(
          `Check-in bloqueado: La habitación #${room.number} está en estado ${room.status}. Debe completarse la limpieza o autorizarse expresamente el ingreso.`
        );
        err.statusCode = 400;
        throw err;
      }

      // 2. Crear o actualizar el huésped titular en el directorio del hotel
      let resolvedGuestId = guest_id ? Number(guest_id) : null;
      if (!resolvedGuestId && resolvedDoc) {
        const existingGuest = await tx.get(
          'SELECT id FROM guests WHERE hotel_id = ? AND document = ? LIMIT 1',
          [hotelId, resolvedDoc]
        );
        if (existingGuest) {
          resolvedGuestId = existingGuest.id;
        }
      }

      const docsJson = JSON.stringify(safeParseJsonArray(documents));

      if (resolvedGuestId) {
        await tx.run(
          `UPDATE guests
           SET first_name = ?,
               last_name = COALESCE(NULLIF(?, ''), last_name),
               doc_type = COALESCE(?, doc_type),
               document = ?,
               phone = COALESCE(NULLIF(?, ''), phone),
               email = COALESCE(NULLIF(?, ''), email),
               nationality = COALESCE(NULLIF(?, ''), nationality),
               origin_city = COALESCE(NULLIF(?, ''), origin_city),
               destination_city = COALESCE(NULLIF(?, ''), destination_city),
               travel_purpose = COALESCE(NULLIF(?, ''), travel_purpose),
               occupation = COALESCE(NULLIF(?, ''), occupation),
               company = COALESCE(NULLIF(?, ''), company),
               vehicle_plate = COALESCE(NULLIF(?, ''), vehicle_plate),
               emergency_contact = COALESCE(NULLIF(?, ''), emergency_contact),
               documents_json = CASE WHEN ? != '[]' THEN ? ELSE documents_json END
           WHERE id = ? AND hotel_id = ?`,
          [
            resolvedName,
            resolvedLastName,
            doc_type || 'CC',
            resolvedDoc,
            resolvedPhone,
            resolvedEmail,
            nationality || 'Colombiana',
            origin_city || '',
            destination_city || '',
            travel_purpose || 'Turismo',
            occupation || '',
            company || '',
            vehicle_plate || '',
            emergency_contact || '',
            docsJson,
            docsJson,
            resolvedGuestId,
            hotelId
          ]
        );
      } else {
        const gIns = await tx.run(
          `INSERT INTO guests (
            hotel_id, first_name, last_name, doc_type, document, phone, email,
            nationality, origin_city, destination_city, travel_purpose,
            occupation, company, vehicle_plate, emergency_contact,
            observations, documents_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            resolvedName,
            resolvedLastName,
            doc_type || 'CC',
            resolvedDoc,
            resolvedPhone,
            resolvedEmail,
            nationality || 'Colombiana',
            origin_city || '',
            destination_city || '',
            travel_purpose || 'Turismo',
            occupation || '',
            company || '',
            vehicle_plate || '',
            emergency_contact || '',
            observations || '',
            docsJson,
            today
          ]
        );
        resolvedGuestId = gIns.id;
      }

      // 3. Determinar tarifa y fechas de la estancia
      const effectiveRate =
        rate_per_period !== undefined && rate_per_period !== ''
          ? Number(rate_per_period)
          : Number(room.base_price || 0);
      const effectiveNextDate =
        next_payment_date || expected_check_out || addDaysToDateStr(today, 1);
      const effectiveExpectedOut = expected_check_out || effectiveNextDate;

      const stayIns = await tx.run(
        `INSERT INTO stays (
          hotel_id, reservation_id, room_id, guest_id,
          check_in_time, expected_check_out, payment_type, next_payment_date,
          rate_per_period, adults, children, origin_city, destination_city,
          travel_purpose, vehicle_plate, documents_json, status, observations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?)`,
        [
          hotelId,
          reservation_id ? Number(reservation_id) : null,
          targetRoomId,
          resolvedGuestId,
          today,
          effectiveExpectedOut,
          payment_type || 'Pago diario',
          effectiveNextDate,
          effectiveRate,
          Number(adults || 1),
          Number(children || 0),
          origin_city || '',
          destination_city || '',
          travel_purpose || 'Turismo',
          vehicle_plate || '',
          docsJson,
          observations || ''
        ]
      );

      const stayId = stayIns.id;

      // 4. Registrar acompañantes si fueron suministrados
      const companionsList = Array.isArray(companions) ? companions : [];
      for (const comp of companionsList) {
        if (!comp.full_name || !String(comp.full_name).trim()) continue;
        await tx.run(
          `INSERT INTO stay_companions (
            hotel_id, stay_id, full_name, doc_type, document,
            nationality, birth_date, relationship, is_minor, parental_auth_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            stayId,
            String(comp.full_name).trim(),
            comp.doc_type || 'CC',
            comp.document || '',
            comp.nationality || 'Colombiana',
            comp.birth_date || '',
            comp.relationship || 'Acompañante',
            comp.is_minor ? 1 : 0,
            comp.parental_auth_notes || '',
            today
          ]
        );
      }

      // 5. Abrir Folio / Cuenta de Estancia (guest_accounts) y registrar cargo y abono inicial
      const chargeAmount =
        initial_charge !== undefined && initial_charge !== ''
          ? Math.max(0, Number(initial_charge))
          : effectiveRate;
      const paidAmount =
        initial_payment !== undefined && initial_payment !== ''
          ? Math.max(0, Number(initial_payment))
          : 0;
      const initialBalance = Math.max(0, chargeAmount - paidAmount);

      const accIns = await tx.run(
        `INSERT INTO guest_accounts (hotel_id, stay_id, total_charges, total_paid, balance, status)
         VALUES (?, ?, ?, ?, ?, 'ABIERTA')`,
        [hotelId, stayId, chargeAmount, paidAmount, initialBalance]
      );
      const accountId = accIns.id;

      if (chargeAmount > 0) {
        await tx.run(
          `INSERT INTO account_charges (hotel_id, account_id, type, description, amount, date, user_id)
           VALUES (?, ?, 'ALOJAMIENTO', ?, ?, ?, ?)`,
          [
            hotelId,
            accountId,
            `Cargo inicial de alojamiento - Hab. #${room.number} (${payment_type || 'Pago diario'})`,
            chargeAmount,
            today,
            req.user?.id || 1
          ]
        );
      }

      if (paidAmount > 0) {
        const payIns = await tx.run(
          `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            accountId,
            payment_method || 'EFECTIVO',
            paidAmount,
            today,
            'Pago inicial en Check-in',
            req.user?.id || 1
          ]
        );

        const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
        await tx.run(
          `INSERT INTO cash_movements (
            hotel_id, register_id, type, amount, category,
            payment_method, description, date, payment_id, user_id
          ) VALUES (?, ?, 'INGRESO', ?, 'Cobro de Habitación', ?, ?, ?, ?, ?)`,
          [
            hotelId,
            registerId,
            paidAmount,
            payment_method || 'EFECTIVO',
            `Pago inicial Check-in Hab. #${room.number} - ${resolvedName} ${resolvedLastName}`.trim(),
            today,
            payIns.id,
            req.user?.id || 1
          ]
        );
      }

      // 6. Actualizar estado de la habitación a OCUPADA e insertar trazabilidad
      await tx.run("UPDATE rooms SET status = 'OCUPADA' WHERE id = ? AND hotel_id = ?", [
        targetRoomId,
        hotelId
      ]);

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'OCCUPANCY', ?, 'OCUPADA', ?, 0, ?, ?)`,
        [
          hotelId,
          targetRoomId,
          room.status,
          `Check-in: ${resolvedName} ${resolvedLastName} (Doc: ${resolvedDoc})`.trim(),
          req.user?.id || 1,
          nowIso
        ]
      );

      if (reservation_id) {
        await tx.run("UPDATE reservations SET status = 'CHECKED_IN' WHERE id = ? AND hotel_id = ?", [
          Number(reservation_id),
          hotelId
        ]);
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CHECK_IN', 'RECEPCION', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          stayId,
          `Check-in registrado en Hab. #${room.number} para ${resolvedName} ${resolvedLastName} (Folio #${accountId}, Cargo: $${chargeAmount}, Abono: $${paidAmount})`,
          today
        ]
      );

      return {
        stay_id: stayId,
        account_id: accountId,
        room_id: targetRoomId,
        room_number: room.number,
        guest_id: resolvedGuestId,
        total_charges: chargeAmount,
        total_paid: paidAmount,
        balance: initialBalance
      };
    });

    res.status(201).json({
      message: 'Check-in registrado exitosamente y folio de estancia abierto.',
      ...createdStay
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al realizar Check-in:', error);
    res.status(500).json({ error: 'Error interno al procesar el Check-in.' });
  }
};

// 7. Agregar Acompañante a una Estancia
exports.addCompanion = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);
    const {
      full_name,
      doc_type,
      document,
      nationality,
      birth_date,
      relationship,
      is_minor,
      parental_auth_notes
    } = req.body;

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: 'El nombre completo del acompañante es obligatorio.' });
    }

    if (is_minor && (!parental_auth_notes || !String(parental_auth_notes).trim())) {
      return res.status(400).json({
        error:
          'Por cumplimiento legal (Ley 679 / Protección de Menores), para registrar un menor de edad debe indicar el parentesco o soporte de autorización de los padres.'
      });
    }

    const stay = await db.get('SELECT id, room_id FROM stays WHERE id = ? AND hotel_id = ?', [
      stayId,
      hotelId
    ]);
    if (!stay) {
      return res.status(404).json({ error: 'Estancia no encontrada.' });
    }

    const today = getTodayString();
    const ins = await db.run(
      `INSERT INTO stay_companions (
        hotel_id, stay_id, full_name, doc_type, document,
        nationality, birth_date, relationship, is_minor, parental_auth_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        stayId,
        String(full_name).trim(),
        doc_type || 'CC',
        document || '',
        nationality || 'Colombiana',
        birth_date || '',
        relationship || 'Acompañante',
        is_minor ? 1 : 0,
        parental_auth_notes || '',
        today
      ]
    );

    const created = await db.get('SELECT * FROM stay_companions WHERE id = ?', [ins.id]);
    res.status(201).json({
      message: 'Acompañante registrado en la estancia.',
      companion: created
    });
  } catch (error) {
    console.error('Error al registrar acompañante:', error);
    res.status(500).json({ error: 'Error al registrar el acompañante.' });
  }
};

// 8. Eliminar Acompañante de una Estancia
exports.removeCompanion = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);
    const companionId = Number(req.params.companionId);

    await db.run(
      'DELETE FROM stay_companions WHERE id = ? AND stay_id = ? AND hotel_id = ?',
      [companionId, stayId, hotelId]
    );

    res.json({ message: 'Acompañante eliminado de la estancia.' });
  } catch (error) {
    console.error('Error al eliminar acompañante:', error);
    res.status(500).json({ error: 'Error al eliminar el acompañante.' });
  }
};

// 9. Registrar Nuevo Cargo en el Folio del Huésped (Alojamiento adicional, consumos, servicios, penalidades)
exports.addFolioCharge = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);
    const { type, description, amount } = req.body;

    const numAmount = Number(amount);
    if (!description || isNaN(numAmount) || numAmount === 0) {
      return res.status(400).json({
        error: 'Descripción y monto válido son obligatorios para registrar un cargo en el folio.'
      });
    }

    const account = await db.get(
      'SELECT * FROM guest_accounts WHERE stay_id = ? AND hotel_id = ?',
      [stayId, hotelId]
    );
    if (!account) {
      return res.status(404).json({ error: 'Folio de estancia no encontrado.' });
    }

    const today = getTodayString();
    const totals = await db.withTransaction(async (tx) => {
      const chIns = await tx.run(
        `INSERT INTO account_charges (hotel_id, account_id, type, description, amount, date, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          account.id,
          type || 'SERVICIO_ADICIONAL',
          description.trim(),
          numAmount,
          today,
          req.user?.id || 1
        ]
      );

      const recalc = await recalculateAccountTotals(tx, account.id);

      if (numAmount > 0) {
        const isLodging = ['ALOJAMIENTO', 'HOSPEDAJE'].includes(String(type || '').toUpperCase());
        await postByRuleInTransaction({
          tx,
          hotelId,
          eventCode: isLodging ? 'HOSPEDAJE_CARGO' : 'POS_CARGO_FOLIO',
          amount: numAmount,
          entryDate: today,
          description: `Cargo Folio #${account.id}: ${description.trim()}`,
          reference: `CARGO-${chIns.id}`,
          sourceModule: 'ACCOUNT_CHARGE',
          sourceId: chIns.id,
          userId: req.user?.id || 1
        });
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CARGO_FOLIO', 'RECEPCION', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          stayId,
          `Cargo en Folio #${account.id}: ${type || 'SERVICIO'} - ${description.trim()} ($${numAmount})`,
          today
        ]
      );

      return recalc;
    });

    res.status(201).json({
      message: 'Cargo registrado en el folio de estancia.',
      ...totals
    });
  } catch (error) {
    console.error('Error al agregar cargo al folio:', error);
    res.status(500).json({ error: 'Error al registrar el cargo en el folio.' });
  }
};

// 10. Registrar Pago o Abono en el Folio del Huésped (integrado con Caja)
exports.addFolioPayment = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);
    const { amount, method, reference, next_payment_date } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'El monto del pago o abono debe ser mayor a cero.' });
    }

    const stayInfo = await db.get(
      `SELECT s.*, r.number as room_number, g.first_name, g.last_name, ga.id as account_id
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.id = ? AND s.hotel_id = ?`,
      [stayId, hotelId]
    );

    if (!stayInfo) {
      return res.status(404).json({ error: 'Estancia o folio no encontrado.' });
    }

    const today = getTodayString();
    const guestFullName =
      `${stayInfo.first_name || ''}${stayInfo.last_name ? ' ' + stayInfo.last_name : ''}`.trim();

    const totals = await db.withTransaction(async (tx) => {
      const payIns = await tx.run(
        `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          stayInfo.account_id,
          method || 'EFECTIVO',
          numAmount,
          today,
          reference || 'Abono en recepción',
          req.user?.id || 1
        ]
      );

      if (next_payment_date) {
        await tx.run('UPDATE stays SET next_payment_date = ? WHERE id = ? AND hotel_id = ?', [
          formatDate(next_payment_date),
          stayId,
          hotelId
        ]);
      }

      const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
      await tx.run(
        `INSERT INTO cash_movements (
          hotel_id, register_id, type, amount, category,
          payment_method, description, date, payment_id, user_id
        ) VALUES (?, ?, 'INGRESO', ?, 'Cobro de Habitación', ?, ?, ?, ?, ?)`,
        [
          hotelId,
          registerId,
          numAmount,
          method || 'EFECTIVO',
          `Abono/Pago Folio Hab. #${stayInfo.room_number} - ${guestFullName}${
            reference ? ' (' + reference + ')' : ''
          }`,
          today,
          payIns.id,
          req.user?.id || 1
        ]
      );

      const recalc = await recalculateAccountTotals(tx, stayInfo.account_id);

      await postByRuleInTransaction({
        tx,
        hotelId,
        eventCode: isBankMethod(method) ? 'HOSPEDAJE_PAGO_BANCO' : 'HOSPEDAJE_PAGO_EFECTIVO',
        amount: numAmount,
        entryDate: today,
        description: `Pago Folio Hab. #${stayInfo.room_number} - ${guestFullName}`,
        reference: reference || `PAY-${payIns.id}`,
        sourceModule: 'FOLIO_PAYMENT',
        sourceId: payIns.id,
        thirdPartyName: guestFullName,
        userId: req.user?.id || 1
      });

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'PAGO_FOLIO', 'RECEPCION', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          stayId,
          `Pago de $${numAmount} (${method || 'EFECTIVO'}) en Folio #${stayInfo.account_id} - Hab. #${stayInfo.room_number}`,
          today
        ]
      );

      return recalc;
    });

    res.status(201).json({
      message: 'Pago registrado en el folio e ingresado en caja.',
      ...totals
    });
  } catch (error) {
    console.error('Error al registrar pago en folio:', error);
    res.status(500).json({ error: 'Error al registrar el pago en el folio.' });
  }
};

// 11. Cambio de Habitación durante la Estancia (con trazabilidad en Folio, Historial de Habitaciones y Limpieza)
exports.changeStayRoom = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);
    const {
      new_room_id,
      new_rate_per_period,
      price_adjustment,
      reason,
      old_room_next_status
    } = req.body;

    const targetNewRoomId = Number(new_room_id);
    if (!targetNewRoomId) {
      return res.status(400).json({
        error: 'Debe seleccionar la nueva habitación de destino.'
      });
    }

    const stay = await db.get(
      `SELECT s.*, r.number as old_room_number, g.first_name, g.last_name, ga.id as account_id
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.id = ? AND s.hotel_id = ?`,
      [stayId, hotelId]
    );

    if (!stay || stay.status !== 'ACTIVA') {
      return res.status(400).json({
        error: 'Solo se puede realizar cambio de habitación en una estancia ACTIVA.'
      });
    }

    if (Number(stay.room_id) === targetNewRoomId) {
      return res.status(400).json({
        error: 'La habitación de destino debe ser distinta a la habitación actual.'
      });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const result = await db.withTransaction(async (tx) => {
      const newRoom = await tx.get(
        `SELECT r.*, COALESCE(r.price_override, rt.base_price, 0) as base_price
         FROM rooms r
         LEFT JOIN room_types rt ON r.room_type_id = rt.id
         WHERE r.id = ? AND r.hotel_id = ? AND r.active = 1`,
        [targetNewRoomId, hotelId]
      );

      if (!newRoom) {
        const err = new Error('La habitación de destino no existe o está inactiva.');
        err.statusCode = 404;
        throw err;
      }

      if (!['DISPONIBLE', 'LIMPIA', 'RESERVADA'].includes(newRoom.status)) {
        const err = new Error(
          `No es posible trasladar al huésped a la Hab. #${newRoom.number} porque se encuentra en estado ${newRoom.status}.`
        );
        err.statusCode = 400;
        throw err;
      }

      const oldRoomStatusAfter = old_room_next_status || 'PENDIENTE_LIMPIEZA';
      const updatedRate =
        new_rate_per_period !== undefined && new_rate_per_period !== ''
          ? Number(new_rate_per_period)
          : Number(stay.rate_per_period || newRoom.base_price || 0);

      // 1. Actualizar la estancia hacia la nueva habitación
      const transferNote = `[Cambio Hab. #${stay.old_room_number} → #${newRoom.number} (${today}): ${
        reason || 'Solicitud de recepción'
      }]`;
      const combinedObs = stay.observations
        ? `${stay.observations} | ${transferNote}`
        : transferNote;

      await tx.run(
        `UPDATE stays
         SET room_id = ?, rate_per_period = ?, observations = ?
         WHERE id = ? AND hotel_id = ?`,
        [targetNewRoomId, updatedRate, combinedObs, stayId, hotelId]
      );

      // 2. Actualizar estados de habitación antigua y nueva
      await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
        oldRoomStatusAfter,
        stay.room_id,
        hotelId
      ]);
      await tx.run("UPDATE rooms SET status = 'OCUPADA' WHERE id = ? AND hotel_id = ?", [
        targetNewRoomId,
        hotelId
      ]);

      // 3. Crear tarea de limpieza para la habitación liberada si quedó PENDIENTE_LIMPIEZA
      if (oldRoomStatusAfter === 'PENDIENTE_LIMPIEZA') {
        await tx.run(
          `INSERT INTO housekeeping_tasks (hotel_id, room_id, stay_id, task_type, priority, status, notes, created_at)
           VALUES (?, ?, ?, 'ASEO_CAMBIO_HAB', 'ALTA', 'PENDIENTE', ?, ?)`,
          [
            hotelId,
            stay.room_id,
            stayId,
            `Aseo requerido por traslado de huésped desde Hab. #${stay.old_room_number} hacia Hab. #${newRoom.number}`,
            today
          ]
        );
      }

      // 4. Registrar historial en ambas habitaciones
      const guestName = `${stay.first_name || ''}${stay.last_name ? ' ' + stay.last_name : ''}`.trim();
      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'OCCUPANCY', 'OCUPADA', ?, ?, 0, ?, ?)`,
        [
          hotelId,
          stay.room_id,
          oldRoomStatusAfter,
          `Traslado de huésped (${guestName}) hacia Hab. #${newRoom.number}. Motivo: ${reason || 'N/A'}`,
          req.user?.id || 1,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'OCCUPANCY', ?, 'OCUPADA', ?, 0, ?, ?)`,
        [
          hotelId,
          targetNewRoomId,
          newRoom.status,
          `Recepción de huésped (${guestName}) trasladado desde Hab. #${stay.old_room_number}`,
          req.user?.id || 1,
          nowIso
        ]
      );

      // 5. Si hay ajuste de tarifa en el folio, registrarlo como cargo y recalcular
      const adjAmount = Number(price_adjustment || 0);
      let accountTotals = null;
      if (stay.account_id) {
        if (adjAmount !== 0) {
          await tx.run(
            `INSERT INTO account_charges (hotel_id, account_id, type, description, amount, date, user_id)
             VALUES (?, ?, 'CAMBIO_HABITACION', ?, ?, ?, ?)`,
            [
              hotelId,
              stay.account_id,
              `Ajuste por cambio de Hab. #${stay.old_room_number} a Hab. #${newRoom.number} (${
                reason || 'Cambio de tarifa'
              })`,
              adjAmount,
              today,
              req.user?.id || 1
            ]
          );
        }
        accountTotals = await recalculateAccountTotals(tx, stay.account_id);
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CAMBIO_HABITACION', 'RECEPCION', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          stayId,
          `Cambio de habitación para ${guestName}: Hab. #${stay.old_room_number} → Hab. #${newRoom.number} (Ajuste: $${adjAmount})`,
          today
        ]
      );

      return {
        stay_id: stayId,
        old_room_id: stay.room_id,
        old_room_number: stay.old_room_number,
        new_room_id: targetNewRoomId,
        new_room_number: newRoom.number,
        rate_per_period: updatedRate,
        account_totals: accountTotals
      };
    });

    res.json({
      message: `Cambio de habitación ejecutado exitosamente (#${result.old_room_number} → #${result.new_room_number}).`,
      ...result
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al cambiar de habitación:', error);
    res.status(500).json({ error: 'Error interno al procesar el cambio de habitación.' });
  }
};

// 12. Realizar Check-out Profesional (con validación estricta de saldo pendiente, liquidación de folio y disparo de Housekeeping)
exports.performCheckOut = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const stayId = Number(req.params.stayId);
    const {
      settle_payment_amount,
      payment_method,
      payment_reference,
      authorize_pending_balance,
      checkout_auth_reason,
      next_room_status,
      observations
    } = req.body;

    const stay = await db.get(
      `SELECT
        s.*,
        r.number as room_number,
        r.status as room_status,
        g.first_name,
        g.last_name,
        ga.id as account_id,
        ga.total_charges,
        ga.total_paid,
        ga.balance
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.id = ? AND s.hotel_id = ?`,
      [stayId, hotelId]
    );

    if (!stay) {
      return res.status(404).json({ error: 'Estancia no encontrada en este establecimiento.' });
    }
    if (stay.status === 'FINALIZADA') {
      return res.status(400).json({ error: 'Esta estancia ya realizó el Check-out previamente.' });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();
    const guestFullName =
      `${stay.first_name || ''}${stay.last_name ? ' ' + stay.last_name : ''}`.trim();

    const checkoutResult = await db.withTransaction(async (tx) => {
      let currentBalance = Number(stay.balance || 0);
      const settleAmount = Math.max(0, Number(settle_payment_amount || 0));

      // 1. Si se envía un pago de liquidación en el momento del Check-out, registrarlo primero
      if (settleAmount > 0 && stay.account_id) {
        const payIns = await tx.run(
          `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            stay.account_id,
            payment_method || 'EFECTIVO',
            settleAmount,
            today,
            payment_reference || 'Liquidación de saldo en Check-out',
            req.user?.id || 1
          ]
        );

        const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
        await tx.run(
          `INSERT INTO cash_movements (
            hotel_id, register_id, type, amount, category,
            payment_method, description, date, payment_id, user_id
          ) VALUES (?, ?, 'INGRESO', ?, 'Cobro de Habitación', ?, ?, ?, ?, ?)`,
          [
            hotelId,
            registerId,
            settleAmount,
            payment_method || 'EFECTIVO',
            `Liquidación Check-out Hab. #${stay.room_number} - ${guestFullName}`,
            today,
            payIns.id,
            req.user?.id || 1
          ]
        );

        const recalc = await recalculateAccountTotals(tx, stay.account_id);
        currentBalance = recalc.balance;
      } else if (stay.account_id) {
        const recalc = await recalculateAccountTotals(tx, stay.account_id);
        currentBalance = recalc.balance;
      }

      // 2. Validación estricta de saldo pendiente antes de permitir la salida
      if (currentBalance > 0) {
        if (!authorize_pending_balance) {
          const err = new Error(
            `Check-out bloqueado por saldo pendiente: El folio de la Hab. #${
              stay.room_number
            } (${guestFullName}) tiene un saldo pendiente de $${currentBalance.toLocaleString(
              'es-CO'
            )}. Debe recaudar el pago o autorizar expresamente la salida con saldo pendiente.`
          );
          err.statusCode = 400;
          err.pending_balance = currentBalance;
          throw err;
        }

        if (!checkout_auth_reason || !String(checkout_auth_reason).trim()) {
          const err = new Error(
            'Debe indicar el motivo o la autorización administrativa para permitir un Check-out con saldo pendiente.'
          );
          err.statusCode = 400;
          throw err;
        }
      }

      const finalRoomStatus = next_room_status || 'PENDIENTE_LIMPIEZA';
      const finalAccountStatus = currentBalance > 0 ? 'CXC_PENDIENTE' : 'CERRADA';

      // 3. Cerrar la estancia
      await tx.run(
        `UPDATE stays
         SET status = 'FINALIZADA',
             check_out_time = ?,
             authorized_balance_checkout = ?,
             checkout_auth_reason = ?,
             observations = CASE WHEN ? != '' THEN COALESCE(observations, '') || ' | ' || ? ELSE observations END
         WHERE id = ? AND hotel_id = ?`,
        [
          today,
          currentBalance > 0 ? 1 : 0,
          currentBalance > 0 ? String(checkout_auth_reason).trim() : null,
          observations ? String(observations).trim() : '',
          observations ? String(observations).trim() : '',
          stayId,
          hotelId
        ]
      );

      if (stay.account_id) {
        await tx.run('UPDATE guest_accounts SET status = ? WHERE id = ?', [
          finalAccountStatus,
          stay.account_id
        ]);
      }

      if (stay.reservation_id) {
        await tx.run(
          "UPDATE reservations SET status = 'FINALIZADA' WHERE id = ? AND hotel_id = ?",
          [stay.reservation_id, hotelId]
        );
      }

      // 4. Actualizar estado de la habitación y disparar tarea de Housekeeping
      await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
        finalRoomStatus,
        stay.room_id,
        hotelId
      ]);

      await tx.run(
        `INSERT INTO housekeeping_tasks (
          hotel_id, room_id, stay_id, task_type, priority, status, notes, created_at
        ) VALUES (?, ?, ?, 'ASEO_SALIDA', 'ALTA', 'PENDIENTE', ?, ?)`,
        [
          hotelId,
          stay.room_id,
          stayId,
          `Aseo por Check-out de Hab. #${stay.room_number} (Huésped saliente: ${guestFullName})`,
          today
        ]
      );

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'OCCUPANCY', ?, ?, ?, 0, ?, ?)`,
        [
          hotelId,
          stay.room_id,
          stay.room_status,
          finalRoomStatus,
          `Check-out de ${guestFullName}. Estado folio: ${finalAccountStatus} (Saldo final: $${currentBalance})`,
          req.user?.id || 1,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CHECK_OUT', 'RECEPCION', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          stayId,
          `Check-out ejecutado en Hab. #${stay.room_number} (${guestFullName}). Saldo pendiente final: $${currentBalance}${
            currentBalance > 0 ? ' [Autorizado: ' + checkout_auth_reason + ']' : ''
          }`,
          today
        ]
      );

      return {
        stay_id: stayId,
        room_id: stay.room_id,
        room_number: stay.room_number,
        new_room_status: finalRoomStatus,
        account_status: finalAccountStatus,
        final_balance: currentBalance
      };
    });

    res.json({
      message: `Check-out completado exitosamente. Habitación #${checkoutResult.room_number} pasó a ${checkoutResult.new_room_status}.`,
      ...checkoutResult
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        pending_balance: error.pending_balance
      });
    }
    console.error('Error al realizar Check-out:', error);
    res.status(500).json({ error: 'Error interno al procesar el Check-out.' });
  }
};

// 13. Reporte de Cumplimiento Legal Colombiano (Libro de Registro de Huéspedes TRA / SIRE)
exports.getLegalComplianceReport = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const hotel = await db.get(
      'SELECT id, name, tax_id, city, sire_code, tra_code FROM hotels WHERE id = ?',
      [hotelId]
    );

    const rows = await db.query(
      `SELECT
        s.id as stay_id,
        s.check_in_time,
        s.check_out_time,
        s.expected_check_out,
        s.status as stay_status,
        s.adults,
        s.children,
        r.number as room_number,
        g.first_name,
        g.last_name,
        g.doc_type,
        g.document,
        g.nationality,
        g.birth_date,
        g.phone,
        g.email,
        COALESCE(NULLIF(s.origin_city, ''), g.origin_city, 'No registrada') as origin_city,
        COALESCE(NULLIF(s.destination_city, ''), g.destination_city, 'No registrada') as destination_city,
        COALESCE(NULLIF(s.travel_purpose, ''), g.travel_purpose, 'Turismo') as travel_purpose,
        ga.total_charges
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.hotel_id = ?
       ORDER BY s.id DESC
       LIMIT 200`,
      [hotelId]
    );

    const companions = await db.query(
      'SELECT * FROM stay_companions WHERE hotel_id = ? ORDER BY id ASC',
      [hotelId]
    );

    const traRecords = rows.map((row) => {
      const compList = companions.filter((c) => Number(c.stay_id) === Number(row.stay_id));
      const isForeign =
        (row.nationality || 'Colombiana').trim().toLowerCase() !== 'colombiana';
      return {
        stay_id: row.stay_id,
        room_number: row.room_number,
        guest_name: `${row.first_name || ''}${row.last_name ? ' ' + row.last_name : ''}`.trim(),
        doc_type: row.doc_type || 'CC',
        document: row.document || '',
        nationality: row.nationality || 'Colombiana',
        is_foreign_sire: isForeign,
        origin_city: row.origin_city,
        destination_city: row.destination_city,
        travel_purpose: row.travel_purpose,
        check_in: row.check_in_time,
        check_out: row.check_out_time || row.expected_check_out || '',
        stay_status: row.stay_status,
        companions_count: compList.length,
        minors_count: compList.filter((c) => Number(c.is_minor) === 1).length,
        companions: compList,
        total_accommodation: Number(row.total_charges || 0)
      };
    });

    res.json({
      hotel: {
        id: hotel?.id,
        name: hotel?.name,
        tax_id: hotel?.tax_id,
        city: hotel?.city,
        sire_code: hotel?.sire_code || 'No configurado',
        tra_code: hotel?.tra_code || 'No configurado'
      },
      disclaimer:
        'Consolidado interno de Tarjeta de Registro de Alojamiento (TRA - MinCIT) y Registro de Extranjeros (SIRE - Migración Colombia) para control y exportación del establecimiento. No constituye transmisión automática oficial en línea.',
      total_records: traRecords.length,
      foreign_guests_sire_count: traRecords.filter((r) => r.is_foreign_sire).length,
      records: traRecords
    });
  } catch (error) {
    console.error('Error al generar reporte legal TRA/SIRE:', error);
    res.status(500).json({ error: 'Error al generar el libro de registro legal TRA/SIRE.' });
  }
};

