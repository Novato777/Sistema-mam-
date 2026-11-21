const db = require('../config/db');
const { getTodayString, formatDate } = require('../utils/date');

const normalizeMethodBucket = (methodStr) => {
  const m = String(methodStr || 'EFECTIVO')
    .trim()
    .toUpperCase();
  if (m.includes('EFECTIVO') || m === 'CASH') return 'EFECTIVO';
  if (m.includes('TRANSF') || m.includes('NEQUI') || m.includes('DAVIPLATA') || m.includes('BANCOLOMBIA')) {
    return 'TRANSFERENCIA';
  }
  if (m.includes('TARJETA') || m.includes('DATAFONO') || m.includes('CREDITO') || m.includes('DEBITO')) {
    return 'TARJETA';
  }
  return 'OTRO';
};

// Calcula el estado financiero en tiempo real de una caja específica
const calculateRegisterSummary = async (txOrDb, register) => {
  const movements = await txOrDb.query(
    'SELECT * FROM cash_movements WHERE register_id = ? AND hotel_id = ? ORDER BY id DESC',
    [register.id, register.hotel_id]
  );

  const openingBalance = Number(register.opening_balance || 0);
  let activeIncome = 0;
  let activeExpense = 0;
  let voidedCount = 0;
  let voidedAmount = 0;

  const byMethod = {
    EFECTIVO: { income: 0, expense: 0, net: 0 },
    TRANSFERENCIA: { income: 0, expense: 0, net: 0 },
    TARJETA: { income: 0, expense: 0, net: 0 },
    OTRO: { income: 0, expense: 0, net: 0 }
  };

  const bySubtype = {
    INGRESO: 0,
    EGRESO: 0,
    ABONO: 0,
    ANTICIPO: 0,
    PAGO_HUESPED: 0,
    PAGO_SERVICIO: 0,
    DEVOLUCION: 0,
    ANULACION_COMPENSATORIA: 0
  };

  for (const mov of movements) {
    const amt = Number(mov.amount || 0);
    const isCompensating = mov.movement_subtype === 'ANULACION_COMPENSATORIA';
    const isVoided = Number(mov.voided) === 1 && !isCompensating;

    if (isCompensating) {
      bySubtype.ANULACION_COMPENSATORIA += amt;
      continue;
    }

    if (isVoided) {
      voidedCount += 1;
      voidedAmount += amt;
      continue;
    }

    const bucket = normalizeMethodBucket(mov.payment_method);
    const isIncome = mov.type === 'INGRESO' || mov.type === 'Ingreso';

    if (isIncome) {
      activeIncome += amt;
      byMethod[bucket].income += amt;
      byMethod[bucket].net += amt;
    } else {
      activeExpense += amt;
      byMethod[bucket].expense += amt;
      byMethod[bucket].net -= amt;
    }

    const st = mov.movement_subtype || (isIncome ? 'INGRESO' : 'EGRESO');
    if (bySubtype[st] !== undefined) {
      bySubtype[st] += amt;
    }
  }

  const expectedCash = openingBalance + byMethod.EFECTIVO.net;
  const expectedTransfer = byMethod.TRANSFERENCIA.net;
  const expectedCard = byMethod.TARJETA.net;
  const expectedOther = byMethod.OTRO.net;
  const expectedTotal = openingBalance + activeIncome - activeExpense;

  return {
    register_id: register.id,
    opening_balance: openingBalance,
    active_income: activeIncome,
    active_expense: activeExpense,
    expected_cash: expectedCash,
    expected_transfer: expectedTransfer,
    expected_card: expectedCard,
    expected_other: expectedOther,
    expected_total: expectedTotal,
    voided_count: voidedCount,
    voided_amount: voidedAmount,
    movements_count: movements.length,
    by_method: byMethod,
    by_subtype: bySubtype
  };
};

// Asegura que los números de comprobante sean consecutivos por hotel
const buildReceiptNumber = (hotelId, isIncome, movementId) => {
  const prefix = isIncome ? 'RC' : 'CE';
  return `${prefix}-H${hotelId}-${String(movementId).padStart(5, '0')}`;
};

// 1. Resumen General de Cajas, Turnos Activos, Arqueos y Cuentas por Cobrar en Recepción
exports.getCashOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;

    const registers = await db.query(
      `SELECT
        cr.*,
        u.username as operator_username,
        u.full_name as operator_name,
        cu.full_name as closed_by_name
       FROM cash_registers cr
       LEFT JOIN users u ON cr.user_id = u.id
       LEFT JOIN users cu ON cr.closed_by = cu.id
       WHERE cr.hotel_id = ?
       ORDER BY cr.status ASC, cr.id DESC
       LIMIT 50`,
      [hotelId]
    );

    const enrichedRegisters = [];
    for (const reg of registers) {
      const summary = await calculateRegisterSummary(db, reg);
      enrichedRegisters.push({
        ...reg,
        opening_balance: Number(reg.opening_balance || 0),
        closing_balance: reg.closing_balance !== null ? Number(reg.closing_balance) : null,
        expected_balance:
          reg.expected_balance !== null ? Number(reg.expected_balance) : summary.expected_total,
        difference: Number(reg.difference || 0),
        shift: reg.shift || 'MAÑANA',
        operation_point: reg.operation_point || 'RECEPCION',
        summary
      });
    }

    const openRegisters = enrichedRegisters.filter((r) => r.status === 'ABIERTA');
    const userOpenReg =
      openRegisters.find((r) => Number(r.user_id) === Number(req.user?.id)) ||
      openRegisters[0] ||
      null;

    const audits = await db.query(
      `SELECT
        ca.*,
        cr.name as register_name,
        cr.shift,
        cr.operation_point,
        u.full_name as auditor_name
       FROM cash_audits ca
       JOIN cash_registers cr ON ca.register_id = cr.id
       LEFT JOIN users u ON ca.user_id = u.id
       WHERE ca.hotel_id = ?
       ORDER BY ca.id DESC
       LIMIT 30`,
      [hotelId]
    );

    const activeStays = await db.query(
      `SELECT
        s.id as stay_id,
        r.number as room_number,
        g.first_name,
        g.last_name,
        ga.id as account_id,
        ga.balance
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.hotel_id = ? AND s.status = 'ACTIVA'
       ORDER BY r.number ASC`,
      [hotelId]
    );

    const activeReservations = await db.query(
      `SELECT
        rv.id as reservation_id,
        rv.code,
        rv.total_price,
        rv.advance_paid,
        rv.status,
        g.first_name,
        g.last_name
       FROM reservations rv
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.hotel_id = ? AND rv.status IN ('PENDIENTE', 'CONFIRMADA')
       ORDER BY rv.id DESC`,
      [hotelId]
    );

    res.json({
      active_register: userOpenReg,
      open_registers: openRegisters,
      recent_registers: enrichedRegisters,
      recent_audits: audits.map((a) => ({
        ...a,
        expected_cash: Number(a.expected_cash || 0),
        counted_cash: Number(a.counted_cash || 0),
        cash_difference: Number(a.cash_difference || 0),
        expected_transfer: Number(a.expected_transfer || 0),
        counted_transfer: Number(a.counted_transfer || 0),
        expected_card: Number(a.expected_card || 0),
        counted_card: Number(a.counted_card || 0),
        total_expected: Number(a.total_expected || 0),
        total_counted: Number(a.total_counted || 0),
        total_difference: Number(a.total_difference || 0)
      })),
      active_stays: activeStays.map((s) => ({
        stay_id: s.stay_id,
        room_number: s.room_number,
        guest_name: `${s.first_name || ''}${s.last_name ? ' ' + s.last_name : ''}`.trim(),
        account_id: s.account_id,
        balance: Number(s.balance || 0)
      })),
      active_reservations: activeReservations.map((rv) => ({
        reservation_id: rv.reservation_id,
        code: rv.code || `RES-${rv.reservation_id}`,
        guest_name: `${rv.first_name || ''}${rv.last_name ? ' ' + rv.last_name : ''}`.trim(),
        total_price: Number(rv.total_price || 0),
        advance_paid: Number(rv.advance_paid || 0),
        pending_balance: Math.max(0, Number(rv.total_price || 0) - Number(rv.advance_paid || 0)),
        status: rv.status
      }))
    });
  } catch (error) {
    console.error('Error en getCashOverview:', error);
    res.status(500).json({ error: 'Error al obtener el estado general de caja.' });
  }
};

// 2. Apertura de Caja por Usuario, Turno y Punto de Operación con Saldo Inicial
exports.openCashRegister = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      name,
      shift,
      operation_point,
      opening_balance,
      observations
    } = req.body;

    const resolvedPoint = (operation_point || 'RECEPCION').toUpperCase();
    const resolvedShift = (shift || 'MAÑANA').toUpperCase();
    const resolvedName =
      (name || '').trim() || `Caja ${resolvedPoint} - Turno ${resolvedShift}`;
    const initialBal = Math.max(0, Number(opening_balance || 0));

    // Verificar si ya hay una caja abierta en el mismo punto de operación
    const existingOpen = await db.get(
      `SELECT id, name, shift FROM cash_registers
       WHERE hotel_id = ? AND status = 'ABIERTA' AND operation_point = ?`,
      [hotelId, resolvedPoint]
    );

    if (existingOpen) {
      return res.status(409).json({
        error: `Ya existe una caja abierta en el punto de operación ${resolvedPoint} (${existingOpen.name}). Realice el cierre del turno anterior antes de abrir una nueva caja en ese mismo punto.`
      });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const ins = await db.run(
      `INSERT INTO cash_registers (
        hotel_id, user_id, name, shift, operation_point,
        opening_time, opening_balance, status, observations
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ABIERTA', ?)`,
      [
        hotelId,
        req.user?.id || 1,
        resolvedName,
        resolvedShift,
        resolvedPoint,
        nowIso,
        initialBal,
        observations || ''
      ]
    );

    await db.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
       VALUES (?, ?, 'APERTURA_CAJA', 'CAJA', ?, ?, ?)`,
      [
        hotelId,
        req.user?.id || 1,
        ins.id,
        `Apertura de ${resolvedName} (Punto: ${resolvedPoint}, Turno: ${resolvedShift}, Saldo inicial: $${initialBal})`,
        today
      ]
    );

    const created = await db.get('SELECT * FROM cash_registers WHERE id = ?', [ins.id]);
    const summary = await calculateRegisterSummary(db, created);

    res.status(201).json({
      message: 'Caja abierta exitosamente.',
      register: {
        ...created,
        opening_balance: Number(created.opening_balance || 0),
        summary
      }
    });
  } catch (error) {
    console.error('Error al abrir caja:', error);
    res.status(500).json({ error: 'Error interno al realizar la apertura de caja.' });
  }
};

// 3. Realizar Arqueo de Caja (Parcial o Pre-cierre) con cálculo de Diferencias de Caja
exports.performCashAudit = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const registerId = Number(req.params.registerId);
    const {
      counted_cash,
      counted_transfer,
      counted_card,
      audit_type,
      notes
    } = req.body;

    const reg = await db.get(
      'SELECT * FROM cash_registers WHERE id = ? AND hotel_id = ?',
      [registerId, hotelId]
    );
    if (!reg) {
      return res.status(404).json({ error: 'Caja no encontrada en este establecimiento.' });
    }

    const summary = await calculateRegisterSummary(db, reg);

    const cCash = Number(counted_cash ?? summary.expected_cash);
    const cTransfer = Number(counted_transfer ?? summary.expected_transfer);
    const cCard = Number(counted_card ?? summary.expected_card);

    const cashDiff = cCash - summary.expected_cash;
    const totalExpected =
      summary.expected_cash + summary.expected_transfer + summary.expected_card + summary.expected_other;
    const totalCounted = cCash + cTransfer + cCard + summary.expected_other;
    const totalDiff = totalCounted - totalExpected;

    const nowIso = new Date().toISOString();
    const today = getTodayString();

    const ins = await db.run(
      `INSERT INTO cash_audits (
        hotel_id, register_id, user_id, audit_type,
        expected_cash, counted_cash, cash_difference,
        expected_transfer, counted_transfer,
        expected_card, counted_card,
        total_expected, total_counted, total_difference,
        notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        registerId,
        req.user?.id || 1,
        audit_type || 'ARQUEO_PARCIAL',
        summary.expected_cash,
        cCash,
        cashDiff,
        summary.expected_transfer,
        cTransfer,
        summary.expected_card,
        cCard,
        totalExpected,
        totalCounted,
        totalDiff,
        notes || '',
        nowIso
      ]
    );

    await db.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
       VALUES (?, ?, 'ARQUEO_CAJA', 'CAJA', ?, ?, ?)`,
      [
        hotelId,
        req.user?.id || 1,
        ins.id,
        `Arqueo en ${reg.name}: Esperado $${totalExpected}, Contado $${totalCounted}, Diferencia $${totalDiff}`,
        today
      ]
    );

    const createdAudit = await db.get('SELECT * FROM cash_audits WHERE id = ?', [ins.id]);
    res.status(201).json({
      message: 'Arqueo de caja registrado exitosamente.',
      audit: {
        ...createdAudit,
        expected_cash: Number(createdAudit.expected_cash),
        counted_cash: Number(createdAudit.counted_cash),
        cash_difference: Number(createdAudit.cash_difference),
        total_expected: Number(createdAudit.total_expected),
        total_counted: Number(createdAudit.total_counted),
        total_difference: Number(createdAudit.total_difference)
      }
    });
  } catch (error) {
    console.error('Error al realizar arqueo de caja:', error);
    res.status(500).json({ error: 'Error al procesar el arqueo de caja.' });
  }
};

// 4. Cierre Formal de Turno de Caja (con Arqueo Final y Registro de Diferencias)
exports.closeCashRegister = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const registerId = Number(req.params.registerId);
    const {
      counted_cash,
      counted_transfer,
      counted_card,
      closing_balance,
      observations
    } = req.body;

    const reg = await db.get(
      'SELECT * FROM cash_registers WHERE id = ? AND hotel_id = ?',
      [registerId, hotelId]
    );
    if (!reg) {
      return res.status(404).json({ error: 'Caja no encontrada en este establecimiento.' });
    }
    if (reg.status === 'CERRADA') {
      return res.status(400).json({ error: 'Esta caja ya fue cerrada anteriormente.' });
    }

    const summary = await calculateRegisterSummary(db, reg);

    const cCash =
      counted_cash !== undefined && counted_cash !== ''
        ? Number(counted_cash)
        : closing_balance !== undefined && closing_balance !== ''
        ? Number(closing_balance)
        : summary.expected_cash;
    const cTransfer =
      counted_transfer !== undefined && counted_transfer !== ''
        ? Number(counted_transfer)
        : summary.expected_transfer;
    const cCard =
      counted_card !== undefined && counted_card !== ''
        ? Number(counted_card)
        : summary.expected_card;

    const totalExpected = summary.expected_total;
    const totalDeclared =
      closing_balance !== undefined && closing_balance !== '' && counted_cash === undefined
        ? Number(closing_balance)
        : cCash + cTransfer + cCard + summary.expected_other;
    const difference = totalDeclared - totalExpected;
    const cashDifference = cCash - summary.expected_cash;

    const nowIso = new Date().toISOString();
    const today = getTodayString();

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE cash_registers
         SET status = 'CERRADA',
             closing_time = ?,
             closing_balance = ?,
             expected_balance = ?,
             difference = ?,
             declared_cash = ?,
             declared_transfer = ?,
             declared_card = ?,
             closed_by = ?,
             observations = CASE WHEN ? != '' THEN COALESCE(observations, '') || ' | Cierre: ' || ? ELSE observations END
         WHERE id = ? AND hotel_id = ?`,
        [
          nowIso,
          totalDeclared,
          totalExpected,
          difference,
          cCash,
          cTransfer,
          cCard,
          req.user?.id || 1,
          observations ? String(observations).trim() : '',
          observations ? String(observations).trim() : '',
          registerId,
          hotelId
        ]
      );

      await tx.run(
        `INSERT INTO cash_audits (
          hotel_id, register_id, user_id, audit_type,
          expected_cash, counted_cash, cash_difference,
          expected_transfer, counted_transfer,
          expected_card, counted_card,
          total_expected, total_counted, total_difference,
          notes, created_at
        ) VALUES (?, ?, ?, 'ARQUEO_CIERRE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          registerId,
          req.user?.id || 1,
          summary.expected_cash,
          cCash,
          cashDifference,
          summary.expected_transfer,
          cTransfer,
          summary.expected_card,
          cCard,
          totalExpected,
          totalDeclared,
          difference,
          observations || 'Arqueo definitivo de cierre de turno',
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CIERRE_CAJA', 'CAJA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          registerId,
          `Cierre de ${reg.name} (Turno ${reg.shift || 'MAÑANA'}): Esperado $${totalExpected}, Declarado $${totalDeclared}, Diferencia $${difference}`,
          today
        ]
      );
    });

    const closedReg = await db.get('SELECT * FROM cash_registers WHERE id = ?', [registerId]);
    res.json({
      message: 'Caja cerrada exitosamente con arqueo definitivo.',
      register: {
        ...closedReg,
        opening_balance: Number(closedReg.opening_balance || 0),
        closing_balance: Number(closedReg.closing_balance || 0),
        expected_balance: Number(closedReg.expected_balance || 0),
        difference: Number(closedReg.difference || 0)
      }
    });
  } catch (error) {
    console.error('Error al cerrar caja:', error);
    res.status(500).json({ error: 'Error interno al cerrar la caja.' });
  }
};

// 5. Registrar Movimiento Financiero (Ingreso, Egreso, Abono, Anticipo, Pago de Huésped, Pago de Servicio o Devolución)
exports.createCashMovement = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      register_id,
      type,
      movement_subtype,
      amount,
      category,
      payment_method,
      description,
      reference,
      stay_id,
      reservation_id,
      date
    } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'El monto del movimiento debe ser mayor a cero.' });
    }

    const resolvedSubtype = (movement_subtype || type || 'INGRESO').toUpperCase();
    const isExpenseSubtype =
      resolvedSubtype === 'EGRESO' ||
      resolvedSubtype === 'DEVOLUCION' ||
      String(type || '').toUpperCase() === 'EGRESO';
    const resolvedType = isExpenseSubtype ? 'EGRESO' : 'INGRESO';

    const today = date ? formatDate(date) : getTodayString();
    const nowIso = new Date().toISOString();

    const createdMovement = await db.withTransaction(async (tx) => {
      // 1. Determinar la caja abierta donde se registrará el movimiento
      let targetReg = null;
      if (register_id) {
        targetReg = await tx.get(
          'SELECT * FROM cash_registers WHERE id = ? AND hotel_id = ?',
          [Number(register_id), hotelId]
        );
        // Caja indicada que no existe en ESTE hotel: error explícito (antes se
        // abría otra caja en silencio y el dinero quedaba donde no se esperaba).
        if (!targetReg) {
          const err = new Error('La caja indicada no existe en este establecimiento.');
          err.statusCode = 404;
          throw err;
        }
      } else {
        targetReg = await tx.get(
          "SELECT * FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' ORDER BY id DESC LIMIT 1",
          [hotelId]
        );
      }

      if (!targetReg) {
        // Si no existe ninguna caja abierta, abrir automáticamente la Caja Principal
        const regIns = await tx.run(
          `INSERT INTO cash_registers (
            hotel_id, user_id, name, shift, operation_point, opening_time, opening_balance, status
          ) VALUES (?, ?, 'Caja Principal Recepción', 'MAÑANA', 'RECEPCION', ?, 0, 'ABIERTA')`,
          [hotelId, req.user?.id || 1, nowIso]
        );
        targetReg = await tx.get('SELECT * FROM cash_registers WHERE id = ?', [regIns.id]);
      } else if (targetReg.status !== 'ABIERTA') {
        const err = new Error(
          `No se pueden registrar movimientos en la caja "${targetReg.name}" porque se encuentra CERRADA.`
        );
        err.statusCode = 400;
        throw err;
      }

      let linkedPaymentId = null;
      let resolvedCategory = category || '';
      let resolvedDesc = (description || '').trim();

      // 2. Si es PAGO_HUESPED o ABONO vinculado a una estancia (stay_id), impactar el Folio automáticamente
      if (stay_id && resolvedType === 'INGRESO') {
        const stayInfo = await tx.get(
          `SELECT s.id, r.number as room_number, g.first_name, g.last_name, ga.id as account_id
           FROM stays s
           JOIN rooms r ON s.room_id = r.id
           JOIN guests g ON s.guest_id = g.id
           LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
           WHERE s.id = ? AND s.hotel_id = ?`,
          [Number(stay_id), hotelId]
        );

        if (stayInfo && stayInfo.account_id) {
          const payIns = await tx.run(
            `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              hotelId,
              stayInfo.account_id,
              payment_method || 'EFECTIVO',
              numAmount,
              today,
              reference || resolvedDesc || 'Pago en Caja',
              req.user?.id || 1
            ]
          );
          linkedPaymentId = payIns.id;

          const chargesRow = await tx.get(
            'SELECT COALESCE(SUM(amount), 0) as total_charges FROM account_charges WHERE account_id = ?',
            [stayInfo.account_id]
          );
          const paymentsRow = await tx.get(
            'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE account_id = ?',
            [stayInfo.account_id]
          );
          const totC = Number(chargesRow?.total_charges || 0);
          const totP = Number(paymentsRow?.total_paid || 0);
          await tx.run(
            'UPDATE guest_accounts SET total_charges = ?, total_paid = ?, balance = ? WHERE id = ?',
            [totC, totP, Math.max(0, totC - totP), stayInfo.account_id]
          );

          if (!resolvedCategory) resolvedCategory = 'Cobro de Habitación';
          if (!resolvedDesc) {
            resolvedDesc = `Pago/Abono Folio Hab. #${stayInfo.room_number} - ${stayInfo.first_name} ${stayInfo.last_name}`.trim();
          }
        }
      }

      // 3. Si es ANTICIPO vinculado a una reserva (reservation_id), impactar la reserva automáticamente
      if (reservation_id && resolvedType === 'INGRESO') {
        const rv = await tx.get(
          `SELECT rv.*, g.first_name, g.last_name
           FROM reservations rv
           LEFT JOIN guests g ON rv.guest_id = g.id
           WHERE rv.id = ? AND rv.hotel_id = ?`,
          [Number(reservation_id), hotelId]
        );
        if (rv) {
          const newAdv = Number(rv.advance_paid || 0) + numAmount;
          const nextSt = rv.status === 'PENDIENTE' ? 'CONFIRMADA' : rv.status;
          await tx.run(
            `UPDATE reservations
             SET advance_paid = ?, status = ?, confirmed_at = COALESCE(confirmed_at, ?)
             WHERE id = ? AND hotel_id = ?`,
            [newAdv, nextSt, nowIso, rv.id, hotelId]
          );
          if (!resolvedCategory) resolvedCategory = 'Anticipo Reserva';
          if (!resolvedDesc) {
            resolvedDesc = `Anticipo Reserva ${rv.code || '#' + rv.id} - ${rv.first_name || ''}`.trim();
          }
        }
      }

      if (!resolvedCategory) {
        const defaultCatMap = {
          INGRESO: 'Ingreso Operativo',
          EGRESO: 'Gasto Operativo',
          ABONO: 'Abono de Huésped',
          ANTICIPO: 'Anticipo Reserva',
          PAGO_HUESPED: 'Cobro de Habitación',
          PAGO_SERVICIO: 'Venta de Servicios',
          DEVOLUCION: 'Devolución a Cliente'
        };
        resolvedCategory = defaultCatMap[resolvedSubtype] || 'Movimiento de Caja';
      }

      if (!resolvedDesc) {
        resolvedDesc = `${resolvedCategory} (${payment_method || 'EFECTIVO'})`;
      }

      const movIns = await tx.run(
        `INSERT INTO cash_movements (
          hotel_id, register_id, type, movement_subtype, amount,
          category, payment_method, description, reference, date,
          payment_id, stay_id, reservation_id, user_id, voided, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          hotelId,
          targetReg.id,
          resolvedType,
          resolvedSubtype,
          numAmount,
          resolvedCategory,
          payment_method || 'EFECTIVO',
          resolvedDesc,
          reference || '',
          today,
          linkedPaymentId,
          stay_id ? Number(stay_id) : null,
          reservation_id ? Number(reservation_id) : null,
          req.user?.id || 1,
          nowIso
        ]
      );

      const receiptNum = buildReceiptNumber(hotelId, resolvedType === 'INGRESO', movIns.id);
      await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [
        receiptNum,
        movIns.id
      ]);

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'MOVIMIENTO_CAJA', 'CAJA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          movIns.id,
          `Comprobante ${receiptNum} [${resolvedType}/${resolvedSubtype}]: $${numAmount} (${
            payment_method || 'EFECTIVO'
          }) - ${resolvedDesc}`,
          today
        ]
      );

      return tx.get('SELECT * FROM cash_movements WHERE id = ?', [movIns.id]);
    });

    res.status(201).json({
      message: `Movimiento registrado exitosamente con comprobante ${createdMovement.receipt_number}.`,
      movement: {
        ...createdMovement,
        amount: Number(createdMovement.amount || 0)
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al registrar movimiento de caja:', error);
    res.status(500).json({ error: 'Error interno al registrar el movimiento de caja.' });
  }
};

// 6. Anulación Autorizada de Movimiento Financiero (Prohibición de borrado silencioso + Movimiento Compensatorio + Auditoría)
exports.voidCashMovement = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const movementId = Number(req.params.movementId || req.params.id);
    const { void_reason, reason } = req.body || {};

    const effectiveReason = String(void_reason || reason || '').trim();
    if (!effectiveReason) {
      return res.status(400).json({
        error:
          'Por control financiero y de auditoría, es obligatorio especificar el motivo de la anulación.'
      });
    }

    const original = await db.get(
      'SELECT * FROM cash_movements WHERE id = ? AND hotel_id = ?',
      [movementId, hotelId]
    );
    if (!original) {
      return res.status(404).json({ error: 'Movimiento financiero no encontrado.' });
    }
    if (Number(original.voided) === 1) {
      return res.status(400).json({ error: 'Este movimiento ya fue anulado previamente.' });
    }
    if (original.movement_subtype === 'ANULACION_COMPENSATORIA') {
      return res.status(400).json({
        error: 'No se puede anular un asiento compensatorio de anulación.'
      });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();
    const isOriginalIncome = original.type === 'INGRESO' || original.type === 'Ingreso';
    const inverseType = isOriginalIncome ? 'EGRESO' : 'INGRESO';

    const result = await db.withTransaction(async (tx) => {
      // 1. Insertar el movimiento compensatorio inverso para dejar rastro contable completo
      const compIns = await tx.run(
        `INSERT INTO cash_movements (
          hotel_id, register_id, type, movement_subtype, amount,
          category, payment_method, description, reference, date,
          original_movement_id, user_id, voided, void_reason, voided_at, voided_by, created_at
        ) VALUES (?, ?, ?, 'ANULACION_COMPENSATORIA', ?, 'Anulación Compensatoria', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          hotelId,
          original.register_id,
          inverseType,
          Number(original.amount || 0),
          original.payment_method || 'EFECTIVO',
          `[ASIENTO COMPENSATORIO] Anulación de ${
            original.receipt_number || 'Mov #' + original.id
          } (${original.description || ''}) — Motivo: ${effectiveReason}`,
          original.receipt_number || `MOV-${original.id}`,
          today,
          original.id,
          req.user?.id || 1,
          effectiveReason,
          nowIso,
          req.user?.id || 1,
          nowIso
        ]
      );

      const compReceipt = `ANUL-H${hotelId}-${String(compIns.id).padStart(5, '0')}`;
      await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [
        compReceipt,
        compIns.id
      ]);

      // 2. Marcar el movimiento original como anulado sin borrarlo jamás
      await tx.run(
        `UPDATE cash_movements
         SET voided = 1,
             void_reason = ?,
             voided_at = ?,
             voided_by = ?,
             compensating_movement_id = ?
         WHERE id = ? AND hotel_id = ?`,
        [
          effectiveReason,
          nowIso,
          req.user?.id || 1,
          compIns.id,
          original.id,
          hotelId
        ]
      );

      // 3. Si estaba vinculado a un pago de folio (payment_id), revertir el pago en el folio del huésped
      if (original.payment_id) {
        const payRow = await tx.get('SELECT * FROM payments WHERE id = ? AND hotel_id = ?', [
          original.payment_id,
          hotelId
        ]);
        if (payRow) {
          await tx.run('DELETE FROM payments WHERE id = ?', [payRow.id]);
          const chargesRow = await tx.get(
            'SELECT COALESCE(SUM(amount), 0) as total_charges FROM account_charges WHERE account_id = ?',
            [payRow.account_id]
          );
          const paymentsRow = await tx.get(
            'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE account_id = ?',
            [payRow.account_id]
          );
          const totC = Number(chargesRow?.total_charges || 0);
          const totP = Number(paymentsRow?.total_paid || 0);
          await tx.run(
            'UPDATE guest_accounts SET total_charges = ?, total_paid = ?, balance = ? WHERE id = ?',
            [totC, totP, Math.max(0, totC - totP), payRow.account_id]
          );
        }
      }

      // 4. Registrar en la bitácora de auditoría
      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ANULAR_MOVIMIENTO_CAJA', 'CAJA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          original.id,
          `Anulación autorizada de ${
            original.receipt_number || 'Mov #' + original.id
          } ($${original.amount}). Motivo: "${effectiveReason}". Movimiento compensatorio generado: #${
            compIns.id
          } (${compReceipt})`,
          today
        ]
      );

      return {
        voided_movement_id: original.id,
        compensating_movement_id: compIns.id,
        compensating_receipt: compReceipt
      };
    });

    res.json({
      message: `Movimiento anulado con trazabilidad de auditoría y asiento compensatorio ${result.compensating_receipt}.`,
      ...result
    });
  } catch (error) {
    console.error('Error al anular movimiento de caja:', error);
    res.status(500).json({ error: 'Error interno al procesar la anulación del movimiento.' });
  }
};

// 7. Obtener Comprobante de Caja / Recibo Oficial de un Movimiento
exports.getMovementReceipt = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const movementId = Number(req.params.movementId);

    const hotel = await db.get(
      'SELECT id, name, legal_name, tax_id, tax_regime, address, city, phone, email, currency FROM hotels WHERE id = ?',
      [hotelId]
    );

    const mov = await db.get(
      `SELECT
        cm.*,
        cr.name as register_name,
        cr.shift,
        cr.operation_point,
        u.full_name as cashier_name,
        vu.full_name as voided_by_name
       FROM cash_movements cm
       LEFT JOIN cash_registers cr ON cm.register_id = cr.id
       LEFT JOIN users u ON cm.user_id = u.id
       LEFT JOIN users vu ON cm.voided_by = vu.id
       WHERE cm.id = ? AND cm.hotel_id = ?`,
      [movementId, hotelId]
    );

    if (!mov) {
      return res.status(404).json({ error: 'Comprobante de caja no encontrado.' });
    }

    const receiptNumber =
      mov.receipt_number ||
      buildReceiptNumber(hotelId, mov.type === 'INGRESO' || mov.type === 'Ingreso', mov.id);

    res.json({
      hotel,
      receipt: {
        id: mov.id,
        receipt_number: receiptNumber,
        type: mov.type,
        movement_subtype: mov.movement_subtype || 'OPERATIVO',
        amount: Number(mov.amount || 0),
        category: mov.category,
        payment_method: mov.payment_method,
        description: mov.description,
        reference: mov.reference || '',
        date: mov.date,
        created_at: mov.created_at || mov.date,
        register_name: mov.register_name || 'Caja Principal',
        shift: mov.shift || 'MAÑANA',
        operation_point: mov.operation_point || 'RECEPCION',
        cashier_name: mov.cashier_name || 'Administrador',
        voided: Number(mov.voided || 0),
        void_reason: mov.void_reason || '',
        voided_at: mov.voided_at || null,
        voided_by_name: mov.voided_by_name || null,
        compensating_movement_id: mov.compensating_movement_id || null
      }
    });
  } catch (error) {
    console.error('Error al generar comprobante de caja:', error);
    res.status(500).json({ error: 'Error al consultar el comprobante de caja.' });
  }
};

// 8. Historial y Reportes de Caja (por Usuario, por Turno/Caja, por Fecha y por Método de Pago)
exports.getCashReports = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      startDate,
      endDate,
      userId,
      registerId,
      shift,
      type,
      paymentMethod,
      includeVoided
    } = req.query;

    const params = [hotelId];
    let sqlFilter = '';

    if (startDate) {
      sqlFilter += ' AND cm.date >= ?';
      params.push(formatDate(startDate));
    }
    if (endDate) {
      sqlFilter += ' AND cm.date <= ?';
      params.push(formatDate(endDate));
    }
    if (userId && userId !== 'ALL') {
      sqlFilter += ' AND cm.user_id = ?';
      params.push(Number(userId));
    }
    if (registerId && registerId !== 'ALL') {
      sqlFilter += ' AND cm.register_id = ?';
      params.push(Number(registerId));
    }
    if (shift && shift !== 'ALL') {
      sqlFilter += ' AND cr.shift = ?';
      params.push(String(shift).toUpperCase());
    }
    if (type && type !== 'ALL') {
      sqlFilter += ' AND UPPER(cm.type) = ?';
      params.push(String(type).toUpperCase());
    }
    if (paymentMethod && paymentMethod !== 'ALL') {
      sqlFilter += ' AND UPPER(cm.payment_method) LIKE ?';
      params.push(`%${String(paymentMethod).toUpperCase()}%`);
    }

    const movements = await db.query(
      `SELECT
        cm.*,
        cr.name as register_name,
        cr.shift,
        cr.operation_point,
        u.username as cashier_username,
        u.full_name as cashier_name,
        vu.full_name as voided_by_name
       FROM cash_movements cm
       LEFT JOIN cash_registers cr ON cm.register_id = cr.id
       LEFT JOIN users u ON cm.user_id = u.id
       LEFT JOIN users vu ON cm.voided_by = vu.id
       WHERE cm.hotel_id = ? ${sqlFilter}
       ORDER BY cm.date DESC, cm.id DESC
       LIMIT 400`,
      params
    );

    const byUserMap = new Map();
    const byShiftMap = new Map();
    const byDateMap = new Map();
    const byMethodMap = new Map();

    let totalIncome = 0;
    let totalExpense = 0;
    let totalVoidedCount = 0;

    const formattedMovements = [];

    for (const m of movements) {
      const amt = Number(m.amount || 0);
      const isCompensating = m.movement_subtype === 'ANULACION_COMPENSATORIA';
      const isVoided = Number(m.voided) === 1 && !isCompensating;
      const isInc = m.type === 'INGRESO' || m.type === 'Ingreso';
      const receiptNum =
        m.receipt_number || buildReceiptNumber(hotelId, isInc, m.id);

      if (includeVoided === '0' && (isVoided || isCompensating)) {
        continue;
      }

      formattedMovements.push({
        ...m,
        receipt_number: receiptNum,
        amount: amt,
        voided: isVoided ? 1 : 0,
        is_compensating: isCompensating ? 1 : 0,
        shift: m.shift || 'MAÑANA',
        operation_point: m.operation_point || 'RECEPCION',
        cashier_name: m.cashier_name || m.cashier_username || 'Administrador'
      });

      if (isCompensating) {
        continue;
      }
      if (isVoided) {
        totalVoidedCount += 1;
        continue;
      }

      if (isInc) totalIncome += amt;
      else totalExpense += amt;

      // 1. Agrupación por Usuario
      const uKey = String(m.user_id || 1);
      if (!byUserMap.has(uKey)) {
        byUserMap.set(uKey, {
          user_id: m.user_id || 1,
          cashier_name: m.cashier_name || m.cashier_username || 'Administrador',
          income: 0,
          expense: 0,
          net: 0,
          movements_count: 0
        });
      }
      const uEntry = byUserMap.get(uKey);
      if (isInc) uEntry.income += amt;
      else uEntry.expense += amt;
      uEntry.net = uEntry.income - uEntry.expense;
      uEntry.movements_count += 1;

      // 2. Agrupación por Turno / Caja
      const sKey = `${m.register_id}-${m.shift || 'MAÑANA'}`;
      if (!byShiftMap.has(sKey)) {
        byShiftMap.set(sKey, {
          register_id: m.register_id,
          register_name: m.register_name || 'Caja Principal',
          shift: m.shift || 'MAÑANA',
          operation_point: m.operation_point || 'RECEPCION',
          income: 0,
          expense: 0,
          net: 0,
          movements_count: 0
        });
      }
      const sEntry = byShiftMap.get(sKey);
      if (isInc) sEntry.income += amt;
      else sEntry.expense += amt;
      sEntry.net = sEntry.income - sEntry.expense;
      sEntry.movements_count += 1;

      // 3. Agrupación por Fecha
      const dKey = m.date;
      if (!byDateMap.has(dKey)) {
        byDateMap.set(dKey, {
          date: dKey,
          income: 0,
          expense: 0,
          net: 0,
          movements_count: 0
        });
      }
      const dEntry = byDateMap.get(dKey);
      if (isInc) dEntry.income += amt;
      else dEntry.expense += amt;
      dEntry.net = dEntry.income - dEntry.expense;
      dEntry.movements_count += 1;

      // 4. Agrupación por Método de Pago
      const mBucket = normalizeMethodBucket(m.payment_method);
      if (!byMethodMap.has(mBucket)) {
        byMethodMap.set(mBucket, {
          payment_method: mBucket,
          income: 0,
          expense: 0,
          net: 0,
          movements_count: 0
        });
      }
      const mEntry = byMethodMap.get(mBucket);
      if (isInc) mEntry.income += amt;
      else mEntry.expense += amt;
      mEntry.net = mEntry.income - mEntry.expense;
      mEntry.movements_count += 1;
    }

    res.json({
      totals: {
        total_income: totalIncome,
        total_expense: totalExpense,
        net_balance: totalIncome - totalExpense,
        voided_count: totalVoidedCount,
        movements_count: formattedMovements.length
      },
      movements: formattedMovements,
      report_by_user: Array.from(byUserMap.values()),
      report_by_shift: Array.from(byShiftMap.values()),
      report_by_date: Array.from(byDateMap.values()),
      report_by_method: Array.from(byMethodMap.values())
    });
  } catch (error) {
    console.error('Error al generar reportes de caja:', error);
    res.status(500).json({ error: 'Error al generar los reportes de caja.' });
  }
};
