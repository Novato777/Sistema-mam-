const db = require('../config/db');
const { getTodayString, formatDate, addDaysToDateStr, getDaysDifference } = require('../utils/date');

// Helper: Obtener intervalo en días según el tipo de pago
const getPaymentIntervalDays = (paymentType) => {
  if (paymentType === 'Pago cada 3 días') return 3;
  if (paymentType === 'Pago semanal') return 7;
  return 1; // Default 'Pago diario'
};

// Helper: Calcular el saldo pendiente total (deuda acumulada + periodos transcurridos)
const calculateGuestPendingInfo = (guest, roomPrice) => {
  if (!guest) {
    return { pendingBalance: 0, accruedPeriods: 0, accruedAmount: 0, totalPending: 0 };
  }

  const today = getTodayString();
  const pendingBalance = Number(guest.pending_balance || 0);
  const nextPayment = guest.next_payment_date;
  const interval = getPaymentIntervalDays(guest.payment_type);

  if (nextPayment && nextPayment <= today) {
    const diffDays = Math.max(0, getDaysDifference(nextPayment, today));
    const accruedPeriods = Math.floor(diffDays / interval) + 1;
    const accruedAmount = accruedPeriods * Number(roomPrice || 0);
    const totalPending = pendingBalance + accruedAmount;

    return {
      pendingBalance,
      accruedPeriods,
      accruedAmount,
      totalPending
    };
  }

  return {
    pendingBalance,
    accruedPeriods: 0,
    accruedAmount: 0,
    totalPending: pendingBalance
  };
};

// Función para actualizar automáticamente el estado de las habitaciones ocupadas a 'Pendiente de pago' si la fecha de próximo pago ya venció o hay saldo pendiente.
const checkAndUpdatePaymentStatus = async () => {
  try {
    const today = getTodayString();
    
    const guests = await db.query(`
      SELECT g.*, r.price as room_price, r.status as room_status
      FROM hotel1_guests g
      JOIN hotel1_rooms r ON g.room_id = r.id
    `);

    for (const guest of guests) {
      const pendingInfo = calculateGuestPendingInfo(guest, guest.room_price);
      if (pendingInfo.totalPending > 0 || guest.next_payment_date <= today) {
        if (guest.room_status !== 'Pendiente de pago') {
          await db.run("UPDATE hotel1_rooms SET status = 'Pendiente de pago' WHERE id = ?", [guest.room_id]);
        }
      } else {
        if (guest.room_status !== 'Ocupada') {
          await db.run("UPDATE hotel1_rooms SET status = 'Ocupada' WHERE id = ?", [guest.room_id]);
        }
      }
    }
  } catch (error) {
    console.error('Error al verificar vencimientos de pago del Hotel 1:', error);
  }
};

// --- ENDPOINTS ---

// Dashboard del Hotel 1: Métricas principales (totales, libres, ocupados, ingresos/gastos hoy)
exports.getDashboard = async (req, res) => {
  try {
    await checkAndUpdatePaymentStatus();

    const today = getTodayString();
    const currentMonth = today.substring(0, 7); // YYYY-MM

    // 1. Habitaciones
    const roomsCount = await db.get('SELECT COUNT(*) as total FROM hotel1_rooms');
    const occupiedCount = await db.get("SELECT COUNT(*) as occupied FROM hotel1_rooms WHERE status IN ('Ocupada', 'Pendiente de pago')");
    const freeCount = (roomsCount.total || 0) - (occupiedCount.occupied || 0);

    // 2. Dinero Recibido Hoy (Ingresos)
    const incomeToday = await db.get("SELECT SUM(amount) as sum FROM hotel1_transactions WHERE type = 'Ingreso' AND date = ?", [today]);

    // 3. Gastos del Día
    const expensesToday = await db.get("SELECT SUM(amount) as sum FROM hotel1_transactions WHERE type = 'Gasto' AND date = ?", [today]);

    // 4. Reportes del mes (Ingresos y Gastos del mes)
    const incomeMonth = await db.get("SELECT SUM(amount) as sum FROM hotel1_transactions WHERE type = 'Ingreso' AND date LIKE ?", [`${currentMonth}%`]);
    const expensesMonth = await db.get("SELECT SUM(amount) as sum FROM hotel1_transactions WHERE type = 'Gasto' AND date LIKE ?", [`${currentMonth}%`]);

    res.json({
      rooms: {
        total: roomsCount.total || 0,
        occupied: occupiedCount.occupied || 0,
        free: freeCount
      },
      today: {
        income: incomeToday.sum || 0,
        expense: expensesToday.sum || 0,
        balance: (incomeToday.sum || 0) - (expensesToday.sum || 0)
      },
      month: {
        income: incomeMonth.sum || 0,
        expense: expensesMonth.sum || 0,
        balance: (incomeMonth.sum || 0) - (expensesMonth.sum || 0)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener métricas del dashboard.' });
  }
};

// Habitaciones: Listar todas
exports.getRooms = async (req, res) => {
  try {
    await checkAndUpdatePaymentStatus();
    const today = getTodayString();

    const rooms = await db.query(`
      SELECT r.*, g.name as guest_name, g.phone as guest_phone, g.check_in_date, g.payment_type, g.next_payment_date, g.document as guest_document, g.pending_balance, g.id as guest_id
      FROM hotel1_rooms r
      LEFT JOIN hotel1_guests g ON r.id = g.room_id
      ORDER BY r.number ASC
    `);

    const formattedRooms = rooms.map((room) => {
      if (room.guest_name) {
        const guestObj = {
          pending_balance: room.pending_balance,
          next_payment_date: room.next_payment_date,
          payment_type: room.payment_type
        };
        const pendingInfo = calculateGuestPendingInfo(guestObj, room.price);
        const displayNextPaymentDate = (room.next_payment_date && room.next_payment_date <= today)
          ? today
          : room.next_payment_date;

        return {
          ...room,
          next_payment_date: displayNextPaymentDate,
          pending_balance: Number(room.pending_balance || 0),
          total_pending: pendingInfo.totalPending,
          accrued_periods: pendingInfo.accruedPeriods,
          accrued_amount: pendingInfo.accruedAmount
        };
      }
      return {
        ...room,
        pending_balance: 0,
        total_pending: 0,
        accrued_periods: 0,
        accrued_amount: 0
      };
    });

    res.json(formattedRooms);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar habitaciones.' });
  }
};

// Habitaciones: Crear
exports.createRoom = async (req, res) => {
  const { number, price, observations } = req.body;
  if (!number || !price) {
    return res.status(400).json({ error: 'Número de habitación y precio son obligatorios.' });
  }

  try {
    const result = await db.run(
      'INSERT INTO hotel1_rooms (number, price, observations) VALUES (?, ?, ?)',
      [number, price, observations || '']
    );
    res.status(201).json({ id: result.id, number, price, status: 'Libre', observations });
  } catch (error) {
    if (error.message && error.message.toUpperCase().includes('UNIQUE')) {
      return res.status(400).json({ error: 'El número de habitación ya existe.' });
    }
    res.status(500).json({ error: 'Error al crear habitación.' });
  }
};

// Habitaciones: Obtener detalle por ID
exports.getRoomDetail = async (req, res) => {
  const { id } = req.params;
  try {
    await checkAndUpdatePaymentStatus();
    const room = await db.get(`
      SELECT r.*, g.name as guest_name, g.phone as guest_phone, g.check_in_date, g.payment_type, g.next_payment_date, g.document as guest_document, g.pending_balance, g.id as guest_id
      FROM hotel1_rooms r
      LEFT JOIN hotel1_guests g ON r.id = g.room_id
      WHERE r.id = ?
    `, [id]);

    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }

    if (room.guest_name) {
      const today = getTodayString();
      const guestObj = {
        pending_balance: room.pending_balance,
        next_payment_date: room.next_payment_date,
        payment_type: room.payment_type
      };
      const pendingInfo = calculateGuestPendingInfo(guestObj, room.price);
      if (room.next_payment_date && room.next_payment_date <= today) {
        room.next_payment_date = today;
      }
      room.pending_balance = Number(room.pending_balance || 0);
      room.total_pending = pendingInfo.totalPending;
      room.accrued_periods = pendingInfo.accruedPeriods;
      room.accrued_amount = pendingInfo.accruedAmount;
    } else {
      room.pending_balance = 0;
      room.total_pending = 0;
      room.accrued_periods = 0;
      room.accrued_amount = 0;
    }

    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener detalle de la habitación.' });
  }
};

// Habitaciones: Editar Habitación y Huésped
exports.updateRoom = async (req, res) => {
  const { id } = req.params;
  const { number, price, observations, guest_name, guest_document, guest_phone, payment_type, next_payment_date, pending_balance } = req.body;

  if (!number || price === undefined || price === null || price === '') {
    return res.status(400).json({ error: 'Número de habitación y precio son obligatorios.' });
  }

  try {
    const existingRoom = await db.get('SELECT * FROM hotel1_rooms WHERE id = ?', [id]);
    if (!existingRoom) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }

    await db.run(
      'UPDATE hotel1_rooms SET number = ?, price = ?, observations = ? WHERE id = ?',
      [number, price, observations || '', id]
    );

    const existingGuest = await db.get('SELECT * FROM hotel1_guests WHERE room_id = ?', [id]);
    if (existingGuest && guest_name) {
      const today = getTodayString();
      const updatedNextPayment = next_payment_date || existingGuest.next_payment_date;
      const updatedPendingBalance = pending_balance !== undefined && pending_balance !== null && pending_balance !== ''
        ? parseFloat(pending_balance)
        : Number(existingGuest.pending_balance || 0);

      await db.run(
        'UPDATE hotel1_guests SET name = ?, document = ?, phone = ?, payment_type = ?, next_payment_date = ?, pending_balance = ? WHERE room_id = ?',
        [guest_name, guest_document || '', guest_phone || '', payment_type || existingGuest.payment_type, updatedNextPayment, updatedPendingBalance, id]
      );

      if (updatedNextPayment < today || updatedPendingBalance > 0) {
        await db.run("UPDATE hotel1_rooms SET status = 'Pendiente de pago' WHERE id = ?", [id]);
      } else {
        await db.run("UPDATE hotel1_rooms SET status = 'Ocupada' WHERE id = ?", [id]);
      }
    }

    res.json({ message: 'Información de habitación y huésped actualizada con éxito.' });
  } catch (error) {
    if (error.message && error.message.toUpperCase().includes('UNIQUE')) {
      return res.status(400).json({ error: 'El número de habitación ya existe.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar habitación.' });
  }
};

// Habitaciones: Asignar Huésped (Check-in)
exports.assignGuest = async (req, res) => {
  const { roomId } = req.params;
  const { name, document, phone, checkInDate, paymentType, initialPayment } = req.body;

  if (!name || !checkInDate || !paymentType) {
    return res.status(400).json({ error: 'Nombre del huésped, fecha de ingreso y tipo de pago son obligatorios.' });
  }

  try {
    const room = await db.get('SELECT * FROM hotel1_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }
    if (room.status !== 'Libre') {
      return res.status(400).json({ error: 'La habitación no está libre.' });
    }

    const interval = getPaymentIntervalDays(paymentType);
    const nextPaymentStr = addDaysToDateStr(checkInDate, interval);

    // Calcular el monto pagado inicialmente (abono o pago completo)
    const paidAmount = (initialPayment !== undefined && initialPayment !== null && initialPayment !== '')
      ? parseFloat(initialPayment)
      : parseFloat(room.price);

    const pendingBalance = Math.max(0, parseFloat(room.price) - paidAmount);
    const roomStatus = pendingBalance > 0 ? 'Pendiente de pago' : 'Ocupada';

    await db.run(
      'INSERT INTO hotel1_guests (room_id, name, document, phone, check_in_date, payment_type, next_payment_date, pending_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [roomId, name, document || '', phone || '', checkInDate, paymentType, nextPaymentStr, pendingBalance]
    );

    await db.run('UPDATE hotel1_rooms SET status = ? WHERE id = ?', [roomStatus, roomId]);

    if (paidAmount > 0) {
      const desc = paidAmount >= room.price
        ? `Check-in Huésped: ${name} (Hab. ${room.number}) - Pago completo`
        : `Check-in Huésped: ${name} (Hab. ${room.number}) - Abono inicial`;
      
      await db.run(
        "INSERT INTO hotel1_transactions (type, category, amount, date, description) VALUES ('Ingreso', 'Hospedaje', ?, ?, ?)",
        [paidAmount, checkInDate, desc]
      );
    }

    res.json({ message: 'Huésped asignado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al asignar huésped.' });
  }
};

// Habitaciones: Registrar Pago del Huésped
exports.registerPayment = async (req, res) => {
  const { roomId } = req.params;
  const { amount, date } = req.body;

  if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'El valor del pago debe ser mayor a cero.' });
  }

  const transactionDate = date || getTodayString();
  const paymentValue = parseFloat(amount);

  try {
    const room = await db.get('SELECT * FROM hotel1_rooms WHERE id = ?', [roomId]);
    const guest = await db.get('SELECT * FROM hotel1_guests WHERE room_id = ?', [roomId]);

    if (!room || !guest) {
      return res.status(404).json({ error: 'Habitación o huésped no encontrado.' });
    }

    const pendingInfo = calculateGuestPendingInfo(guest, room.price);
    const totalPending = pendingInfo.totalPending;

    const newPendingBalance = Math.max(0, totalPending - paymentValue);
    const today = getTodayString();
    let updatedNextPaymentStr = guest.next_payment_date;

    if (newPendingBalance === 0) {
      // Pago completo de toda la deuda pendiente acumulada: avanzar al siguiente ciclo desde hoy
      const interval = getPaymentIntervalDays(guest.payment_type);
      updatedNextPaymentStr = addDaysToDateStr(today, interval);
    } else {
      // Abono parcial (sigue debiendo): si la fecha de pago está vencida o vence hoy, mantener hoy
      if (guest.next_payment_date <= today) {
        updatedNextPaymentStr = today;
      }
    }

    const roomStatus = newPendingBalance > 0 ? 'Pendiente de pago' : 'Ocupada';

    await db.run(
      'UPDATE hotel1_guests SET pending_balance = ?, next_payment_date = ? WHERE room_id = ?',
      [newPendingBalance, updatedNextPaymentStr, roomId]
    );

    await db.run('UPDATE hotel1_rooms SET status = ? WHERE id = ?', [roomStatus, roomId]);

    const isFullPay = newPendingBalance === 0;
    const desc = isFullPay
      ? `Pago total de hospedaje: ${guest.name} (Hab. ${room.number})`
      : `Abono a hospedaje: ${guest.name} (Hab. ${room.number}) - Pendiente: $${newPendingBalance.toLocaleString('de-DE')}`;

    await db.run(
      "INSERT INTO hotel1_transactions (type, category, amount, date, description) VALUES ('Ingreso', 'Hospedaje', ?, ?, ?)",
      [paymentValue, transactionDate, desc]
    );

    res.json({
      message: 'Pago/Abono registrado con éxito.',
      new_pending_balance: newPendingBalance,
      next_payment_date: updatedNextPaymentStr
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar pago.' });
  }
};

// Habitaciones: Desalojar Huésped (Check-out)
exports.checkoutGuest = async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await db.get('SELECT * FROM hotel1_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }

    // Eliminar huésped
    await db.run('DELETE FROM hotel1_guests WHERE room_id = ?', [roomId]);

    // Liberar la habitación
    await db.run("UPDATE hotel1_rooms SET status = 'Libre' WHERE id = ?", [roomId]);

    res.json({ message: 'Habitación liberada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al realizar check-out.' });
  }
};

// Transacciones: Registrar ingresos y gastos manuales
exports.createTransaction = async (req, res) => {
  const { type, category, amount, date, description } = req.body;

  if (!type || !category || !amount) {
    return res.status(400).json({ error: 'Tipo, categoría y monto son obligatorios.' });
  }

  const transactionDate = date || getTodayString();

  try {
    await db.run(
      'INSERT INTO hotel1_transactions (type, category, amount, date, description) VALUES (?, ?, ?, ?, ?)',
      [type, category, amount, transactionDate, description || '']
    );
    res.status(201).json({ message: 'Transacción registrada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar transacción.' });
  }
};

// Transacciones: Obtener historial
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await db.query(
      'SELECT * FROM hotel1_transactions ORDER BY date DESC, id DESC LIMIT 100'
    );
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
};

// Transacciones: Eliminar
exports.deleteTransaction = async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM hotel1_transactions WHERE id = ?', [id]);
    res.json({ message: 'Transacción eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar transacción.' });
  }
};
