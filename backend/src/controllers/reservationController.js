const db = require('../config/db');
const { getTodayString, formatDate, addDaysToDateStr, getDaysDifference } = require('../utils/date');

// Obtener o crear la caja abierta del hotel actual para registrar anticipos
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

// Normaliza el intervalo [checkIn, checkOut) asegurando al menos 1 día de duración para detección de solapamientos
const normalizeInterval = (checkInStr, checkOutStr) => {
  const start = formatDate(checkInStr);
  let end = formatDate(checkOutStr);
  if (end <= start) {
    end = addDaysToDateStr(start, 1);
  }
  const nights = Math.max(1, getDaysDifference(start, end));
  return { start, end, nights };
};

/**
 * Detecta conflictos de disponibilidad para una lista de habitaciones en el rango [start, end).
 * Verifica:
 * 1) Habitaciones fuera de servicio o en mantenimiento.
 * 2) Otras reservas activas ('PENDIENTE', 'CONFIRMADA', 'CHECKED_IN') que se solapen: existingStart < end AND existingEnd > start.
 * 3) Estadías activas ('ACTIVA') en curso cuyas fechas se solapen con el rango solicitado.
 */
const findRoomConflicts = async (
  txOrDb,
  hotelId,
  roomIds,
  start,
  end,
  excludeReservationId = null
) => {
  const conflicts = [];
  const today = getTodayString();

  for (const rawRoomId of roomIds) {
    const roomId = Number(rawRoomId);
    const room = await txOrDb.get(
      'SELECT id, number, status, active FROM rooms WHERE id = ? AND hotel_id = ?',
      [roomId, hotelId]
    );

    if (!room || Number(room.active) === 0) {
      conflicts.push({
        room_id: roomId,
        room_number: room?.number || String(roomId),
        type: 'INACTIVE_ROOM',
        reason: `La habitación #${room?.number || roomId} no existe o está desactivada.`
      });
      continue;
    }

    if (room.status === 'FUERA_DE_SERVICIO' || room.status === 'MANTENIMIENTO') {
      conflicts.push({
        room_id: roomId,
        room_number: room.number,
        type: 'MAINTENANCE_BLOCK',
        reason: `La habitación #${room.number} se encuentra bloqueada (${room.status}).`
      });
      continue;
    }

    // 1. Verificar solapamiento con otras reservas activas
    const params = [hotelId, roomId];
    let excludeClause = '';
    if (excludeReservationId) {
      excludeClause = 'AND rv.id != ?';
      params.push(Number(excludeReservationId));
    }

    const existingReservations = await txOrDb.query(
      `SELECT
        rv.id,
        rv.code,
        rv.check_in_expected,
        rv.check_out_expected,
        rv.status,
        g.first_name,
        g.last_name
       FROM reservation_rooms rr
       JOIN reservations rv ON rr.reservation_id = rv.id
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.hotel_id = ?
         AND rr.room_id = ?
         AND rv.status IN ('PENDIENTE', 'CONFIRMADA', 'CHECKED_IN')
         ${excludeClause}`,
      params
    );

    for (const ev of existingReservations) {
      const evInterval = normalizeInterval(ev.check_in_expected, ev.check_out_expected);
      if (evInterval.start < end && evInterval.end > start) {
        const guestName = `${ev.first_name || ''}${ev.last_name ? ' ' + ev.last_name : ''}`.trim();
        conflicts.push({
          room_id: roomId,
          room_number: room.number,
          type: 'RESERVATION_OVERLAP',
          status: ev.status,
          reservation_id: ev.id,
          reservation_code: ev.code,
          reason: `Conflicto en Hab. #${room.number} con reserva ${ev.code || '#' + ev.id} (${guestName || 'Huésped'}) del ${evInterval.start} al ${evInterval.end}.`,
          message: `Conflicto en Hab. #${room.number} con reserva ${ev.code || '#' + ev.id} (${guestName || 'Huésped'}) del ${evInterval.start} al ${evInterval.end}.`
        });
      }
    }

    // 2. Verificar solapamiento con estadías activas en curso (Walk-ins o huéspedes alojados)
    const activeStay = await txOrDb.get(
      `SELECT
        s.id,
        s.reservation_id,
        s.check_in_time,
        s.next_payment_date,
        g.first_name,
        g.last_name
       FROM stays s
       LEFT JOIN guests g ON s.guest_id = g.id
       WHERE s.hotel_id = ? AND s.room_id = ? AND s.status = 'ACTIVA'
       LIMIT 1`,
      [hotelId, roomId]
    );

    if (
      activeStay &&
      (!excludeReservationId || Number(activeStay.reservation_id) !== Number(excludeReservationId))
    ) {
      const stayStart = formatDate(activeStay.check_in_time);
      const fallbackEnd = addDaysToDateStr(today, 1);
      const stayEnd =
        activeStay.next_payment_date && activeStay.next_payment_date > today
          ? activeStay.next_payment_date
          : fallbackEnd;

      if (stayStart < end && stayEnd > start) {
        const guestName = `${activeStay.first_name || ''}${activeStay.last_name ? ' ' + activeStay.last_name : ''}`.trim();
        conflicts.push({
          room_id: roomId,
          room_number: room.number,
          type: 'ACTIVE_STAY_OVERLAP',
          status: 'OCUPADA',
          stay_id: activeStay.id,
          reason: `La Hab. #${room.number} está ocupada actualmente por ${guestName || 'un huésped'} (hasta al menos ${stayEnd}).`,
          message: `La Hab. #${room.number} está ocupada actualmente por ${guestName || 'un huésped'} (hasta al menos ${stayEnd}).`
        });
      }
    }
  }

  return conflicts;
};

// 1. Motor de Consulta de Disponibilidad por fechas, tipo y capacidad
exports.checkAvailability = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      checkIn,
      checkInDate,
      checkOut,
      checkOutDate,
      roomTypeId,
      minCapacity,
      capacity,
      excludeReservationId
    } = req.query;

    const effectiveMinCap = minCapacity || capacity;
    const today = getTodayString();
    const { start, end, nights } = normalizeInterval(
      checkIn || checkInDate || today,
      checkOut || checkOutDate || addDaysToDateStr(today, 1)
    );

    const allRooms = await db.query(
      `SELECT
        r.id,
        r.number,
        r.floor,
        r.room_type_id,
        rt.name as room_type_name,
        rt.code as room_type_code,
        COALESCE(r.price_override, rt.base_price, 0) as price,
        COALESCE(r.rate_3_days, rt.rate_3_days) as rate_3_days,
        COALESCE(r.rate_weekly, rt.rate_weekly) as rate_weekly,
        COALESCE(r.capacity, rt.capacity, 2) as capacity,
        COALESCE(NULLIF(r.bed_config, ''), rt.bed_config, '1 Cama Doble') as bed_config,
        COALESCE(NULLIF(r.amenities, ''), rt.amenities, 'Baño privado, TV, Wi-Fi') as amenities,
        r.status
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.hotel_id = ? AND r.active = 1
       ORDER BY r.floor ASC, r.number ASC`,
      [hotelId]
    );

    const candidateRooms = allRooms.filter((r) => {
      if (roomTypeId && roomTypeId !== 'ALL' && String(r.room_type_id) !== String(roomTypeId)) return false;
      if (effectiveMinCap && Number(r.capacity || 2) < Number(effectiveMinCap)) return false;
      return true;
    });

    const conflicts = await findRoomConflicts(
      db,
      hotelId,
      candidateRooms.map((r) => r.id),
      start,
      end,
      excludeReservationId
    );

    const conflictMap = new Map();
    for (const c of conflicts) {
      if (!conflictMap.has(c.room_id)) {
        conflictMap.set(c.room_id, []);
      }
      conflictMap.get(c.room_id).push(c);
    }

    const availableRooms = [];
    const conflictingRooms = [];

    for (const r of candidateRooms) {
      const ratePerNight = Number(r.price || 0);
      const roomPayload = {
        id: r.id,
        number: r.number,
        floor: r.floor || '1',
        room_type_id: r.room_type_id,
        room_type_name: r.room_type_name || 'Estándar',
        room_type_code: r.room_type_code || 'STD',
        capacity: Number(r.capacity || 2),
        effective_capacity: Number(r.capacity || 2),
        bed_config: r.bed_config,
        amenities: r.amenities,
        status: r.status,
        price: ratePerNight,
        rate_per_night: ratePerNight,
        suggested_total: ratePerNight * nights
      };

      if (conflictMap.has(r.id)) {
        conflictingRooms.push({
          ...roomPayload,
          conflicts: conflictMap.get(r.id)
        });
      } else {
        availableRooms.push(roomPayload);
      }
    }

    res.json({
      check_in: start,
      check_out: end,
      nights,
      available_count: availableRooms.length,
      conflicting_count: conflictingRooms.length,
      available_rooms: availableRooms,
      conflicting_rooms: conflictingRooms
    });
  } catch (error) {
    console.error('Error al consultar disponibilidad:', error);
    res.status(500).json({ error: 'Error al consultar disponibilidad de habitaciones.' });
  }
};

// 2. Calendario Visual de Ocupación (Timeline / Gantt por habitación y fecha)
exports.getOccupancyCalendar = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const startDate = req.query.startDate
      ? formatDate(req.query.startDate)
      : addDaysToDateStr(today, -2);
    let daysCount = Math.min(45, Math.max(7, Number(req.query.days || 14)));
    if (req.query.endDate) {
      const diff = getDaysDifference(startDate, formatDate(req.query.endDate)) + 1;
      daysCount = Math.min(45, Math.max(1, diff));
    }
    const endDate = addDaysToDateStr(startDate, daysCount);

    const dates = [];
    const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    for (let i = 0; i < daysCount; i++) {
      const dStr = addDaysToDateStr(startDate, i);
      const [yyyy, mm, dd] = dStr.split('-').map(Number);
      const dt = new Date(yyyy, mm - 1, dd);
      dates.push({
        date: dStr,
        day: `${dd}/${mm}`,
        weekday: weekdays[dt.getDay()],
        is_today: dStr === today
      });
    }

    const rooms = await db.query(
      `SELECT
        r.id,
        r.number,
        r.floor,
        r.status,
        rt.name as room_type_name,
        COALESCE(r.price_override, rt.base_price, 0) as price,
        COALESCE(r.capacity, rt.capacity, 2) as capacity
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.hotel_id = ? AND r.active = 1
       ORDER BY r.floor ASC, r.number ASC`,
      [hotelId]
    );

    const reservations = await db.query(
      `SELECT
        rv.*,
        g.first_name,
        g.last_name,
        g.document as guest_document,
        g.phone as guest_phone
       FROM reservations rv
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.hotel_id = ?
         AND rv.status IN ('PENDIENTE', 'CONFIRMADA', 'CHECKED_IN')
         AND rv.check_in_expected < ?
         AND rv.check_out_expected >= ?
       ORDER BY rv.check_in_expected ASC`,
      [hotelId, endDate, startDate]
    );

    const resRooms = await db.query(
      `SELECT rr.*, r.number as room_number
       FROM reservation_rooms rr
       JOIN rooms r ON rr.room_id = r.id
       WHERE rr.hotel_id = ?`,
      [hotelId]
    );

    const activeStays = await db.query(
      `SELECT
        s.id as stay_id,
        s.room_id,
        s.reservation_id,
        s.check_in_time,
        s.next_payment_date,
        s.payment_type,
        g.first_name,
        g.last_name,
        ga.balance as pending_balance
       FROM stays s
       LEFT JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.hotel_id = ? AND s.status = 'ACTIVA'`,
      [hotelId]
    );

    const formattedReservations = [];
    for (const rv of reservations) {
      const assigned = resRooms.filter((rr) => rr.reservation_id === rv.id);
      const interval = normalizeInterval(rv.check_in_expected, rv.check_out_expected);
      const guestFullName =
        `${rv.first_name || ''}${rv.last_name ? ' ' + rv.last_name : ''}`.trim() || 'Huésped';

      for (const a of assigned) {
        formattedReservations.push({
          id: rv.id,
          reservation_id: rv.id,
          code: rv.code || `RES-${rv.id}`,
          is_group: Number(rv.is_group || 0),
          group_name: rv.group_name || '',
          guest_name: guestFullName,
          guest_document: rv.guest_document || '',
          guest_phone: rv.guest_phone || '',
          check_in: interval.start,
          check_out: interval.end,
          check_in_date: interval.start,
          check_out_date: interval.end,
          nights: interval.nights,
          status: rv.status,
          total_price: Number(rv.total_price || 0),
          advance_paid: Number(rv.advance_paid || 0),
          room_id: a.room_id,
          room_number: a.room_number,
          rate_per_night: Number(a.rate_per_night || a.price || 0),
          room_ids: assigned.map((item) => item.room_id),
          room_numbers: assigned.map((item) => item.room_number)
        });
      }
    }

    const formattedStays = activeStays.map((st) => {
      const stayStart = formatDate(st.check_in_time);
      const fallbackEnd = addDaysToDateStr(today, 1);
      const stayEnd =
        st.next_payment_date && st.next_payment_date > today
          ? st.next_payment_date
          : fallbackEnd;
      return {
        stay_id: st.stay_id,
        room_id: st.room_id,
        reservation_id: st.reservation_id,
        guest_name: `${st.first_name || ''}${st.last_name ? ' ' + st.last_name : ''}`.trim() || 'Huésped',
        check_in: stayStart,
        check_out: stayEnd,
        start_date: stayStart,
        end_date: stayEnd,
        status: 'ACTIVA',
        payment_type: st.payment_type
      };
    });

    res.json({
      start_date: startDate,
      end_date: endDate,
      days: dates.map((d) => d.date),
      days_count: daysCount,
      dates,
      rooms: rooms.map((r) => ({
        ...r,
        price: Number(r.price || 0),
        capacity: Number(r.capacity || 2)
      })),
      reservations: formattedReservations,
      stays: formattedStays,
      active_stays: formattedStays
    });
  } catch (error) {
    console.error('Error al generar calendario de ocupación:', error);
    res.status(500).json({ error: 'Error al generar el calendario de ocupación.' });
  }
};

// 3. Listar todas las reservas del establecimiento
exports.listReservations = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { status, isGroup } = req.query;

    const params = [hotelId];
    let filterSql = '';
    if (status && status !== 'ALL') {
      filterSql += ' AND rv.status = ?';
      params.push(String(status));
    }
    if (isGroup === '1' || isGroup === 'true') {
      filterSql += ' AND rv.is_group = 1';
    }

    const reservations = await db.query(
      `SELECT
        rv.*,
        g.first_name,
        g.last_name,
        g.doc_type,
        g.document as guest_document,
        g.phone as guest_phone,
        g.email as guest_email
       FROM reservations rv
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.hotel_id = ? ${filterSql}
       ORDER BY rv.check_in_expected DESC, rv.id DESC
       LIMIT 150`,
      params
    );

    const resRooms = await db.query(
      `SELECT
        rr.*,
        r.number as room_number,
        r.floor,
        rt.name as room_type_name
       FROM reservation_rooms rr
       JOIN rooms r ON rr.room_id = r.id
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE rr.hotel_id = ?`,
      [hotelId]
    );

    const enriched = reservations.map((rv) => {
      const assigned = resRooms
        .filter((rr) => rr.reservation_id === rv.id)
        .map((rr) => ({
          room_id: rr.room_id,
          room_number: rr.room_number,
          floor: rr.floor || '1',
          room_type_name: rr.room_type_name || 'Estándar',
          rate_per_night: Number(rr.rate_per_night || rr.price || 0),
          price: Number(rr.price || 0)
        }));

      const totalPrice = Number(rv.total_price || 0);
      const advancePaid = Number(rv.advance_paid || 0);
      const discountAmount = Number(rv.discount_amount || 0);
      const subtotalPrice = Number(rv.subtotal_price || totalPrice + discountAmount);
      const interval = normalizeInterval(rv.check_in_expected, rv.check_out_expected);

      return {
        id: rv.id,
        code: rv.code || `RES-${rv.id}`,
        hotel_id: rv.hotel_id,
        guest_id: rv.guest_id,
        guest_name: `${rv.first_name || ''}${rv.last_name ? ' ' + rv.last_name : ''}`.trim() || 'Huésped',
        guest_doc_type: rv.doc_type || 'CC',
        guest_document: rv.guest_document || '',
        guest_phone: rv.guest_phone || '',
        guest_email: rv.guest_email || '',
        is_group: Number(rv.is_group || (assigned.length > 1 ? 1 : 0)),
        group_name: rv.group_name || '',
        check_in_date: interval.start,
        check_in_expected: interval.start,
        check_in_time: rv.check_in_time || '15:00',
        check_out_date: interval.end,
        check_out_expected: interval.end,
        check_out_time: rv.check_out_time || '13:00',
        nights: Number(rv.nights || interval.nights),
        adults: Number(rv.adults || 1),
        children: Number(rv.children || 0),
        status: rv.status,
        subtotal_price: subtotalPrice,
        discount_amount: discountAmount,
        discount_reason: rv.discount_reason || '',
        total_price: totalPrice,
        advance_paid: advancePaid,
        pending_balance: Math.max(0, totalPrice - advancePaid),
        payment_method: rv.payment_method || 'Efectivo',
        observations: rv.observations || '',
        cancellation_reason: rv.cancellation_reason || '',
        created_at: rv.created_at,
        rooms: assigned
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error al listar reservas:', error);
    res.status(500).json({ error: 'Error al obtener las reservas del establecimiento.' });
  }
};

// 4. Crear Reserva Individual o Grupal (con control transaccional de conflictos y registro de anticipo)
exports.createReservation = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      guest_name,
      guest_document,
      guest_phone,
      guest_email,
      is_group,
      group_name,
      check_in_expected,
      check_in_date,
      check_in_time,
      check_out_expected,
      check_out_date,
      check_out_time,
      adults,
      children,
      room_ids,
      rooms: customRooms,
      discount_amount,
      discount_reason,
      advance_paid,
      payment_method,
      status,
      observations
    } = req.body;

    const effectiveCheckIn = check_in_expected || check_in_date;
    const effectiveCheckOut = check_out_expected || check_out_date;

    if (!guest_name || !effectiveCheckIn || !effectiveCheckOut) {
      return res.status(400).json({
        error: 'Nombre del huésped titular, fecha de llegada y fecha de salida son obligatorios.'
      });
    }

    // Extraer IDs de habitaciones solicitadas
    let requestedRooms = [];
    if (Array.isArray(customRooms) && customRooms.length > 0) {
      requestedRooms = customRooms.map((cr) => ({
        room_id: Number(cr.room_id || cr.id),
        rate_per_night:
          cr.rate_per_night !== undefined && cr.rate_per_night !== ''
            ? Number(cr.rate_per_night)
            : null
      }));
    } else if (Array.isArray(room_ids) && room_ids.length > 0) {
      requestedRooms = room_ids.map((id) => ({ room_id: Number(id), rate_per_night: null }));
    }

    if (requestedRooms.length === 0) {
      return res.status(400).json({
        error: 'Debes seleccionar al menos una habitación disponible para la reserva.'
      });
    }

    const uniqueRoomIds = Array.from(new Set(requestedRooms.map((r) => r.room_id)));
    if (uniqueRoomIds.length !== requestedRooms.length) {
      return res.status(400).json({
        error: 'No se puede asignar la misma habitación dos veces en la misma reserva.'
      });
    }

    const { start, end, nights } = normalizeInterval(effectiveCheckIn, effectiveCheckOut);
    const today = getTodayString();

    const createdReservation = await db.withTransaction(async (tx) => {
      // 1. Validar conflictos de disponibilidad dentro de la transacción ACID
      const conflicts = await findRoomConflicts(tx, hotelId, uniqueRoomIds, start, end, null);
      if (conflicts.length > 0) {
        const err = new Error(conflicts[0].reason);
        err.statusCode = 409;
        err.conflicts = conflicts;
        throw err;
      }

      // 2. Consultar datos de las habitaciones seleccionadas y calcular tarifas
      let subtotal = 0;
      const roomEntries = [];
      for (const reqRoom of requestedRooms) {
        const dbRoom = await tx.get(
          `SELECT r.id, r.number, r.room_type_id, r.status, COALESCE(r.price_override, rt.base_price, 0) as base_rate
           FROM rooms r
           LEFT JOIN room_types rt ON r.room_type_id = rt.id
           WHERE r.id = ? AND r.hotel_id = ? AND r.active = 1`,
          [reqRoom.room_id, hotelId]
        );
        if (!dbRoom) {
          const err = new Error(`La habitación ID ${reqRoom.room_id} no existe en este hotel.`);
          err.statusCode = 404;
          throw err;
        }
        const nightRate =
          reqRoom.rate_per_night !== null && !isNaN(reqRoom.rate_per_night)
            ? Number(reqRoom.rate_per_night)
            : Number(dbRoom.base_rate || 0);
        const roomTotal = nightRate * nights;
        subtotal += roomTotal;
        roomEntries.push({
          room_id: dbRoom.id,
          room_number: dbRoom.number,
          room_type_id: dbRoom.room_type_id,
          current_status: dbRoom.status,
          rate_per_night: nightRate,
          price: roomTotal
        });
      }

      const disc = Math.max(0, Number(discount_amount || 0));
      const total = Math.max(0, subtotal - disc);
      const advance = Math.max(0, Number(advance_paid || 0));
      const isGroupFlag = is_group || roomEntries.length > 1 ? 1 : 0;
      const finalStatus =
        status && ['PENDIENTE', 'CONFIRMADA'].includes(status)
          ? status
          : advance > 0
          ? 'CONFIRMADA'
          : 'PENDIENTE';

      // 3. Crear o reutilizar huésped titular
      let guestId = null;
      if (guest_document && String(guest_document).trim()) {
        const existingGuest = await tx.get(
          'SELECT id FROM guests WHERE hotel_id = ? AND document = ? LIMIT 1',
          [hotelId, String(guest_document).trim()]
        );
        if (existingGuest) {
          guestId = existingGuest.id;
          await tx.run(
            'UPDATE guests SET first_name = ?, phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?',
            [guest_name.trim(), guest_phone || null, guest_email || null, guestId]
          );
        }
      }

      if (!guestId) {
        const gIns = await tx.run(
          `INSERT INTO guests (hotel_id, first_name, last_name, doc_type, document, phone, email, nationality, created_at)
           VALUES (?, ?, '', 'CC', ?, ?, ?, 'Colombiana', ?)`,
          [
            hotelId,
            guest_name.trim(),
            guest_document ? String(guest_document).trim() : '',
            guest_phone || '',
            guest_email || '',
            today
          ]
        );
        guestId = gIns.id;
      }

      // 4. Insertar Reserva
      const tempCode = `RES-${hotelId}-${Date.now().toString().slice(-6)}`;
      const nowIso = new Date().toISOString();

      const rvIns = await tx.run(
        `INSERT INTO reservations (
          hotel_id, code, guest_id, is_group, group_name,
          check_in_expected, check_in_time, check_out_expected, check_out_time,
          nights, adults, children, status,
          subtotal_price, discount_amount, discount_reason, total_price, advance_paid,
          payment_method, confirmed_at, user_id, observations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          tempCode,
          guestId,
          isGroupFlag,
          group_name || '',
          start,
          check_in_time || '15:00',
          end,
          check_out_time || '13:00',
          nights,
          Number(adults || 1),
          Number(children || 0),
          finalStatus,
          subtotal,
          disc,
          discount_reason || '',
          total,
          advance,
          payment_method || 'Efectivo',
          finalStatus === 'CONFIRMADA' ? nowIso : null,
          req.user?.id || 1,
          observations || '',
          today
        ]
      );

      const reservationId = rvIns.id;
      const officialCode = `RES-H${hotelId}-${String(reservationId).padStart(4, '0')}`;
      await tx.run('UPDATE reservations SET code = ? WHERE id = ?', [officialCode, reservationId]);

      // 5. Insertar habitaciones de la reserva y actualizar estado en Rack si aplica para hoy
      for (const re of roomEntries) {
        await tx.run(
          `INSERT INTO reservation_rooms (hotel_id, reservation_id, room_id, room_type_id, rate_per_night, price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [hotelId, reservationId, re.room_id, re.room_type_id, re.rate_per_night, re.price]
        );

        if (start <= today && end > today && ['DISPONIBLE', 'LIMPIA'].includes(re.current_status)) {
          await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
            'RESERVADA',
            re.room_id,
            hotelId
          ]);
          await tx.run(
            `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
             VALUES (?, ?, 'OCCUPANCY', ?, 'RESERVADA', ?, 0, ?, ?)`,
            [
              hotelId,
              re.room_id,
              re.current_status,
              `Reserva ${officialCode} asignada (${guest_name.trim()})`,
              req.user?.id || 1,
              nowIso
            ]
          );
        }
      }

      // 6. Si hay anticipo pagado, registrarlo en Caja
      if (advance > 0) {
        const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
        const roomNums = roomEntries.map((r) => `#${r.room_number}`).join(', ');
        await tx.run(
          `INSERT INTO cash_movements (hotel_id, register_id, type, amount, category, payment_method, description, date, user_id)
           VALUES (?, ?, 'INGRESO', ?, 'Anticipo Reserva', ?, ?, ?, ?)`,
          [
            hotelId,
            registerId,
            advance,
            payment_method || 'Efectivo',
            `Anticipo reserva ${officialCode} - ${guest_name.trim()} (Hab. ${roomNums})`,
            today,
            req.user?.id || 1
          ]
        );
      }

      // 7. Registrar en Auditoría
      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CREAR_RESERVA', 'RESERVAS', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          reservationId,
          `Reserva ${officialCode} creada para ${guest_name.trim()} (${start} a ${end}, ${roomEntries.length} hab(s), Total: $${total})`,
          today
        ]
      );

      return {
        id: reservationId,
        code: officialCode,
        status: finalStatus,
        nights,
        subtotal_price: subtotal,
        discount_amount: disc,
        total_price: total,
        advance_paid: advance,
        pending_balance: Math.max(0, total - advance),
        rooms: roomEntries
      };
    });

    res.status(201).json({
      message: 'Reserva registrada exitosamente sin conflictos de disponibilidad.',
      ...createdReservation,
      reservation: createdReservation
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        conflicts: error.conflicts || []
      });
    }
    console.error('Error al crear reserva:', error);
    res.status(500).json({ error: 'Error interno al crear la reserva.' });
  }
};

// 5. Modificar Reserva Existente (con re-validación transaccional de conflictos)
exports.updateReservation = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const reservationId = Number(req.params.id);
    const {
      guest_name,
      guest_document,
      guest_phone,
      guest_email,
      is_group,
      group_name,
      check_in_expected,
      check_in_date,
      check_in_time,
      check_out_expected,
      check_out_date,
      check_out_time,
      adults,
      children,
      room_ids,
      rooms: customRooms,
      discount_amount,
      discount_reason,
      observations
    } = req.body;

    const existing = await db.get(
      'SELECT * FROM reservations WHERE id = ? AND hotel_id = ?',
      [reservationId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Reserva no encontrada en este establecimiento.' });
    }
    if (['CANCELADA', 'CHECKED_IN', 'FINALIZADA'].includes(existing.status)) {
      return res.status(400).json({
        error: `No se pueden modificar las fechas o habitaciones de una reserva en estado ${existing.status}.`
      });
    }

    const { start, end, nights } = normalizeInterval(
      check_in_expected || check_in_date || existing.check_in_expected,
      check_out_expected || check_out_date || existing.check_out_expected
    );

    let requestedRooms = [];
    if (Array.isArray(customRooms) && customRooms.length > 0) {
      requestedRooms = customRooms.map((cr) => ({
        room_id: Number(cr.room_id || cr.id),
        rate_per_night:
          cr.rate_per_night !== undefined && cr.rate_per_night !== ''
            ? Number(cr.rate_per_night)
            : null
      }));
    } else if (Array.isArray(room_ids) && room_ids.length > 0) {
      requestedRooms = room_ids.map((id) => ({ room_id: Number(id), rate_per_night: null }));
    } else {
      const currentAssigned = await db.query(
        'SELECT room_id, rate_per_night FROM reservation_rooms WHERE reservation_id = ?',
        [reservationId]
      );
      requestedRooms = currentAssigned.map((r) => ({
        room_id: Number(r.room_id),
        rate_per_night: Number(r.rate_per_night || 0)
      }));
    }

    const uniqueRoomIds = Array.from(new Set(requestedRooms.map((r) => r.room_id)));

    await db.withTransaction(async (tx) => {
      const conflicts = await findRoomConflicts(
        tx,
        hotelId,
        uniqueRoomIds,
        start,
        end,
        reservationId
      );
      if (conflicts.length > 0) {
        const err = new Error(conflicts[0].reason);
        err.statusCode = 409;
        err.conflicts = conflicts;
        throw err;
      }

      if (guest_name) {
        await tx.run(
          `UPDATE guests
           SET first_name = ?,
               document = COALESCE(?, document),
               phone = COALESCE(?, phone),
               email = COALESCE(?, email)
           WHERE id = ? AND hotel_id = ?`,
          [
            guest_name.trim(),
            guest_document !== undefined ? guest_document : null,
            guest_phone !== undefined ? guest_phone : null,
            guest_email !== undefined ? guest_email : null,
            existing.guest_id,
            hotelId
          ]
        );
      }

      let subtotal = 0;
      const roomEntries = [];
      for (const reqRoom of requestedRooms) {
        const dbRoom = await tx.get(
          `SELECT r.id, r.number, r.room_type_id, COALESCE(r.price_override, rt.base_price, 0) as base_rate
           FROM rooms r
           LEFT JOIN room_types rt ON r.room_type_id = rt.id
           WHERE r.id = ? AND r.hotel_id = ?`,
          [reqRoom.room_id, hotelId]
        );
        const nightRate =
          reqRoom.rate_per_night !== null && !isNaN(reqRoom.rate_per_night) && reqRoom.rate_per_night > 0
            ? Number(reqRoom.rate_per_night)
            : Number(dbRoom?.base_rate || 0);
        const roomTotal = nightRate * nights;
        subtotal += roomTotal;
        roomEntries.push({
          room_id: reqRoom.room_id,
          room_type_id: dbRoom?.room_type_id || null,
          rate_per_night: nightRate,
          price: roomTotal
        });
      }

      const disc =
        discount_amount !== undefined ? Math.max(0, Number(discount_amount)) : Number(existing.discount_amount || 0);
      const total = Math.max(0, subtotal - disc);
      const isGroupFlag = is_group !== undefined ? (is_group ? 1 : 0) : roomEntries.length > 1 ? 1 : 0;

      await tx.run(
        `UPDATE reservations
         SET is_group = ?,
             group_name = COALESCE(?, group_name),
             check_in_expected = ?,
             check_in_time = COALESCE(?, check_in_time),
             check_out_expected = ?,
             check_out_time = COALESCE(?, check_out_time),
             nights = ?,
             adults = COALESCE(?, adults),
             children = COALESCE(?, children),
             subtotal_price = ?,
             discount_amount = ?,
             discount_reason = COALESCE(?, discount_reason),
             total_price = ?,
             observations = COALESCE(?, observations)
         WHERE id = ? AND hotel_id = ?`,
        [
          isGroupFlag,
          group_name !== undefined ? group_name : null,
          start,
          check_in_time || null,
          end,
          check_out_time || null,
          nights,
          adults !== undefined ? Number(adults) : null,
          children !== undefined ? Number(children) : null,
          subtotal,
          disc,
          discount_reason !== undefined ? discount_reason : null,
          total,
          observations !== undefined ? observations : null,
          reservationId,
          hotelId
        ]
      );

      await tx.run('DELETE FROM reservation_rooms WHERE reservation_id = ?', [reservationId]);
      for (const re of roomEntries) {
        await tx.run(
          `INSERT INTO reservation_rooms (hotel_id, reservation_id, room_id, room_type_id, rate_per_night, price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [hotelId, reservationId, re.room_id, re.room_type_id, re.rate_per_night, re.price]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'MODIFICAR_RESERVA', 'RESERVAS', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          reservationId,
          `Reserva ${existing.code || '#' + reservationId} modificada (${start} a ${end}, Total: $${total})`,
          getTodayString()
        ]
      );
      return {
        id: reservationId,
        code: existing.code || `RES-${reservationId}`,
        nights,
        subtotal_price: subtotal,
        discount_amount: disc,
        total_price: total
      };
    });

    const updated = await db.get('SELECT * FROM reservations WHERE id = ? AND hotel_id = ?', [
      reservationId,
      hotelId
    ]);

    res.json({
      message: 'Reserva actualizada correctamente.',
      id: reservationId,
      code: updated.code,
      status: updated.status,
      nights: Number(updated.nights),
      subtotal_price: Number(updated.subtotal_price),
      discount_amount: Number(updated.discount_amount),
      total_price: Number(updated.total_price),
      advance_paid: Number(updated.advance_paid)
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        conflicts: error.conflicts || []
      });
    }
    console.error('Error al modificar reserva:', error);
    res.status(500).json({ error: 'Error al modificar la reserva.' });
  }
};

// 6. Registrar Anticipo o Abono adicional a una Reserva
exports.registerAdvancePayment = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const reservationId = Number(req.params.id);
    const { amount, payment_method, notes } = req.body;

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ error: 'El monto del anticipo debe ser mayor a cero.' });
    }

    const rv = await db.get(
      `SELECT rv.*, g.first_name, g.last_name
       FROM reservations rv
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.id = ? AND rv.hotel_id = ?`,
      [reservationId, hotelId]
    );
    if (!rv) return res.status(404).json({ error: 'Reserva no encontrada.' });

    const today = getTodayString();
    const newAdvance = Number(rv.advance_paid || 0) + payAmount;
    const newStatus = rv.status === 'PENDIENTE' ? 'CONFIRMADA' : rv.status;

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE reservations
         SET advance_paid = ?,
             status = ?,
             confirmed_at = COALESCE(confirmed_at, ?)
         WHERE id = ? AND hotel_id = ?`,
        [newAdvance, newStatus, new Date().toISOString(), reservationId, hotelId]
      );

      const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
      const guestName = `${rv.first_name || ''}${rv.last_name ? ' ' + rv.last_name : ''}`.trim();

      await tx.run(
        `INSERT INTO cash_movements (hotel_id, register_id, type, amount, category, payment_method, description, date, user_id)
         VALUES (?, ?, 'INGRESO', ?, 'Anticipo Reserva', ?, ?, ?, ?)`,
        [
          hotelId,
          registerId,
          payAmount,
          payment_method || 'Efectivo',
          `Abono/Anticipo reserva ${rv.code || '#' + rv.id} (${guestName})${notes ? ' - ' + notes : ''}`,
          today,
          req.user?.id || 1
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ANTICIPO_RESERVA', 'RESERVAS', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          reservationId,
          `Anticipo de $${payAmount} registrado en reserva ${rv.code || '#' + rv.id}`,
          today
        ]
      );
    });

    res.json({
      message: 'Anticipo registrado en caja y acreditado a la reserva.',
      advance_paid: newAdvance,
      status: newStatus
    });
  } catch (error) {
    console.error('Error al registrar anticipo de reserva:', error);
    res.status(500).json({ error: 'Error al registrar el anticipo.' });
  }
};

// 7. Cambiar estado de la Reserva: CONFIRMADA, CANCELADA, NO_SHOW o CHECKED_IN (conversión a estancia activa)
exports.updateReservationStatus = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const reservationId = Number(req.params.id);
    const { status, cancellation_reason, payment_type } = req.body;

    const validStatuses = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'NO_SHOW', 'CHECKED_IN'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado de reserva no válido.' });
    }

    const rv = await db.get(
      `SELECT rv.*, g.first_name, g.last_name
       FROM reservations rv
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.id = ? AND rv.hotel_id = ?`,
      [reservationId, hotelId]
    );
    if (!rv) return res.status(404).json({ error: 'Reserva no encontrada.' });

    const assignedRooms = await db.query(
      `SELECT rr.*, r.number as room_number, r.status as room_status
       FROM reservation_rooms rr
       JOIN rooms r ON rr.room_id = r.id
       WHERE rr.reservation_id = ?`,
      [reservationId]
    );

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    await db.withTransaction(async (tx) => {
      if (status === 'CANCELADA' || status === 'NO_SHOW') {
        await tx.run(
          `UPDATE reservations
           SET status = ?,
               cancellation_reason = COALESCE(?, cancellation_reason),
               cancelled_at = ?
           WHERE id = ? AND hotel_id = ?`,
          [status, cancellation_reason || null, nowIso, reservationId, hotelId]
        );

        // Liberar habitaciones que estuvieran en estado RESERVADA
        for (const ar of assignedRooms) {
          if (ar.room_status === 'RESERVADA') {
            await tx.run("UPDATE rooms SET status = 'DISPONIBLE' WHERE id = ? AND hotel_id = ?", [
              ar.room_id,
              hotelId
            ]);
            await tx.run(
              `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
               VALUES (?, ?, 'OCCUPANCY', 'RESERVADA', 'DISPONIBLE', ?, 0, ?, ?)`,
              [
                hotelId,
                ar.room_id,
                `Reserva ${rv.code} marcada como ${status}`,
                req.user?.id || 1,
                nowIso
              ]
            );
          }
        }
      } else if (status === 'CONFIRMADA') {
        await tx.run(
          'UPDATE reservations SET status = ?, confirmed_at = ? WHERE id = ? AND hotel_id = ?',
          ['CONFIRMADA', nowIso, reservationId, hotelId]
        );

        if (rv.check_in_expected <= today && rv.check_out_expected > today) {
          for (const ar of assignedRooms) {
            if (['DISPONIBLE', 'LIMPIA'].includes(ar.room_status)) {
              await tx.run("UPDATE rooms SET status = 'RESERVADA' WHERE id = ? AND hotel_id = ?", [
                ar.room_id,
                hotelId
              ]);
            }
          }
        }
      } else if (status === 'CHECKED_IN') {
        if (rv.status === 'CHECKED_IN') {
          const err = new Error('Esta reserva ya realizó el Check-in.');
          err.statusCode = 400;
          throw err;
        }

        await tx.run('UPDATE reservations SET status = ? WHERE id = ? AND hotel_id = ?', [
          'CHECKED_IN',
          reservationId,
          hotelId
        ]);

        const totalAdvance = Number(rv.advance_paid || 0);
        const totalDiscount = Number(rv.discount_amount || 0);
        const roomsCount = Math.max(1, assignedRooms.length);
        let remainingAdvance = totalAdvance;

        for (let idx = 0; idx < assignedRooms.length; idx++) {
          const ar = assignedRooms[idx];
          const nightRate = Number(ar.rate_per_night || ar.price || 0);
          const roomCharge = Math.max(
            0,
            Number(ar.price || nightRate) - Math.round(totalDiscount / roomsCount)
          );
          const allocatedAdvance =
            idx === assignedRooms.length - 1
              ? remainingAdvance
              : Math.min(roomCharge, remainingAdvance);
          remainingAdvance = Math.max(0, remainingAdvance - allocatedAdvance);
          const balance = Math.max(0, roomCharge - allocatedAdvance);
          const nextPayDate = rv.check_out_expected > today ? rv.check_out_expected : addDaysToDateStr(today, 1);

          const stayIns = await tx.run(
            `INSERT INTO stays (
              hotel_id, reservation_id, room_id, guest_id,
              check_in_time, payment_type, next_payment_date, rate_per_period, status, observations
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?)`,
            [
              hotelId,
              reservationId,
              ar.room_id,
              rv.guest_id,
              today,
              payment_type || 'Pago diario',
              nextPayDate,
              nightRate,
              `Ingreso desde reserva ${rv.code}`
            ]
          );

          const accIns = await tx.run(
            `INSERT INTO guest_accounts (hotel_id, stay_id, total_charges, total_paid, balance, status)
             VALUES (?, ?, ?, ?, ?, 'ABIERTA')`,
            [hotelId, stayIns.id, roomCharge, allocatedAdvance, balance]
          );

          await tx.run(
            `INSERT INTO account_charges (hotel_id, account_id, type, description, amount, date, user_id)
             VALUES (?, ?, 'ALOJAMIENTO', ?, ?, ?, ?)`,
            [
              hotelId,
              accIns.id,
              `Estancia por reserva ${rv.code} (${rv.nights || 1} noche(s))`,
              roomCharge,
              today,
              req.user?.id || 1
            ]
          );

          if (allocatedAdvance > 0) {
            await tx.run(
              `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                hotelId,
                accIns.id,
                rv.payment_method || 'Efectivo',
                allocatedAdvance,
                today,
                `Anticipo acreditado de ${rv.code}`,
                req.user?.id || 1
              ]
            );
          }

          await tx.run("UPDATE rooms SET status = 'OCUPADA' WHERE id = ? AND hotel_id = ?", [
            ar.room_id,
            hotelId
          ]);

          await tx.run(
            `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
             VALUES (?, ?, 'OCCUPANCY', ?, 'OCUPADA', ?, 0, ?, ?)`,
            [
              hotelId,
              ar.room_id,
              ar.room_status,
              `Check-in ejecutado desde Reserva ${rv.code}`,
              req.user?.id || 1,
              nowIso
            ]
          );
        }
      } else {
        await tx.run('UPDATE reservations SET status = ? WHERE id = ? AND hotel_id = ?', [
          status,
          reservationId,
          hotelId
        ]);
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ESTADO_RESERVA', 'RESERVAS', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          reservationId,
          `Reserva ${rv.code || '#' + rv.id} cambió de ${rv.status} a ${status}${
            cancellation_reason ? ' (' + cancellation_reason + ')' : ''
          }`,
          today
        ]
      );
    });

    res.json({
      message: `Estado de la reserva actualizado a ${status}.`,
      status
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al actualizar estado de reserva:', error);
    res.status(500).json({ error: 'Error al actualizar el estado de la reserva.' });
  }
};
