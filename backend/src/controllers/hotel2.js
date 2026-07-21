const db = require('../config/db');

const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const checkAndUpdatePaymentStatus = async () => {
  try {
    const today = getTodayString();
    
    const expiredGuests = await db.query(`
      SELECT g.id, g.room_id, g.next_payment_date 
      FROM hotel2_guests g
      JOIN hotel2_rooms r ON g.room_id = r.id
      WHERE g.next_payment_date < ? AND r.status = 'Ocupada'
    `, [today]);

    for (const guest of expiredGuests) {
      await db.run('UPDATE hotel2_rooms SET status = "Pendiente de pago" WHERE id = ?', [guest.room_id]);
    }
  } catch (error) {
    console.error('Error al verificar vencimientos de pago del Hotel 2:', error);
  }
};

exports.getDashboard = async (req, res) => {
  try {
    await checkAndUpdatePaymentStatus();

    const today = getTodayString();
    const currentMonth = today.substring(0, 7);

    const roomsCount = await db.get('SELECT COUNT(*) as total FROM hotel2_rooms');
    const occupiedCount = await db.get('SELECT COUNT(*) as occupied FROM hotel2_rooms WHERE status IN ("Ocupada", "Pendiente de pago")');
    const freeCount = (roomsCount.total || 0) - (occupiedCount.occupied || 0);

    const incomeToday = await db.get('SELECT SUM(amount) as sum FROM hotel2_transactions WHERE type = "Ingreso" AND date = ?', [today]);
    const expensesToday = await db.get('SELECT SUM(amount) as sum FROM hotel2_transactions WHERE type = "Gasto" AND date = ?', [today]);

    const incomeMonth = await db.get('SELECT SUM(amount) as sum FROM hotel2_transactions WHERE type = "Ingreso" AND date LIKE ?', [`${currentMonth}%`]);
    const expensesMonth = await db.get('SELECT SUM(amount) as sum FROM hotel2_transactions WHERE type = "Gasto" AND date LIKE ?', [`${currentMonth}%`]);

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
    res.status(500).json({ error: 'Error al obtener métricas del dashboard del Hotel 2.' });
  }
};

exports.getRooms = async (req, res) => {
  try {
    await checkAndUpdatePaymentStatus();
    const rooms = await db.query(`
      SELECT r.*, g.name as guest_name, g.phone as guest_phone, g.check_in_date, g.payment_type, g.next_payment_date, g.document as guest_document
      FROM hotel2_rooms r
      LEFT JOIN hotel2_guests g ON r.id = g.room_id
      ORDER BY r.number ASC
    `);
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar habitaciones del Hotel 2.' });
  }
};

exports.createRoom = async (req, res) => {
  const { number, price, observations } = req.body;
  if (!number || !price) {
    return res.status(400).json({ error: 'Número de habitación y precio son obligatorios.' });
  }

  try {
    const result = await db.run(
      'INSERT INTO hotel2_rooms (number, price, observations) VALUES (?, ?, ?)',
      [number, price, observations || '']
    );
    res.status(201).json({ id: result.id, number, price, status: 'Libre', observations });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'El número de habitación ya existe.' });
    }
    res.status(500).json({ error: 'Error al crear habitación en Hotel 2.' });
  }
};

exports.getRoomDetail = async (req, res) => {
  const { id } = req.params;
  try {
    await checkAndUpdatePaymentStatus();
    const room = await db.get(`
      SELECT r.*, g.name as guest_name, g.phone as guest_phone, g.check_in_date, g.payment_type, g.next_payment_date, g.document as guest_document, g.id as guest_id
      FROM hotel2_rooms r
      LEFT JOIN hotel2_guests g ON r.id = g.room_id
      WHERE r.id = ?
    `, [id]);

    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener detalle de la habitación en Hotel 2.' });
  }
};

exports.assignGuest = async (req, res) => {
  const { roomId } = req.params;
  const { name, document, phone, checkInDate, paymentType } = req.body;

  if (!name || !checkInDate || !paymentType) {
    return res.status(400).json({ error: 'Nombre del huésped, fecha de ingreso y tipo de pago son obligatorios.' });
  }

  try {
    const room = await db.get('SELECT * FROM hotel2_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }
    if (room.status !== 'Libre') {
      return res.status(400).json({ error: 'La habitación no está libre.' });
    }

    const checkIn = new Date(checkInDate);
    let nextPayment = new Date(checkIn);

    if (paymentType === 'Pago diario') {
      nextPayment.setDate(checkIn.getDate() + 1);
    } else if (paymentType === 'Pago cada 3 días') {
      nextPayment.setDate(checkIn.getDate() + 3);
    } else if (paymentType === 'Pago semanal') {
      nextPayment.setDate(checkIn.getDate() + 7);
    } else {
      return res.status(400).json({ error: 'Tipo de pago inválido.' });
    }

    const nextPaymentStr = formatDate(nextPayment);

    await db.run(
      'INSERT INTO hotel2_guests (room_id, name, document, phone, check_in_date, payment_type, next_payment_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [roomId, name, document || '', phone || '', checkInDate, paymentType, nextPaymentStr]
    );

    await db.run('UPDATE hotel2_rooms SET status = "Ocupada" WHERE id = ?', [roomId]);

    await db.run(
      'INSERT INTO hotel2_transactions (type, category, amount, date, description) VALUES ("Ingreso", "Hospedaje", ?, ?, ?)',
      [room.price, checkInDate, `Check-in Huésped: ${name} (Hab. ${room.number})`]
    );

    res.json({ message: 'Huésped asignado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al asignar huésped.' });
  }
};

exports.registerPayment = async (req, res) => {
  const { roomId } = req.params;
  const { amount, date } = req.body;

  if (!amount) {
    return res.status(400).json({ error: 'El valor del pago es obligatorio.' });
  }

  const transactionDate = date || getTodayString();

  try {
    const room = await db.get('SELECT * FROM hotel2_rooms WHERE id = ?', [roomId]);
    const guest = await db.get('SELECT * FROM hotel2_guests WHERE room_id = ?', [roomId]);

    if (!room || !guest) {
      return res.status(404).json({ error: 'Habitación o huésped no encontrado.' });
    }

    const currentNextPayment = new Date(guest.next_payment_date);
    let nextPayment = new Date(currentNextPayment);

    if (guest.payment_type === 'Pago diario') {
      nextPayment.setDate(currentNextPayment.getDate() + 1);
    } else if (guest.payment_type === 'Pago cada 3 días') {
      nextPayment.setDate(currentNextPayment.getDate() + 3);
    } else if (guest.payment_type === 'Pago semanal') {
      nextPayment.setDate(currentNextPayment.getDate() + 7);
    }

    const nextPaymentStr = formatDate(nextPayment);

    await db.run('UPDATE hotel2_guests SET next_payment_date = ? WHERE room_id = ?', [nextPaymentStr, roomId]);
    await db.run('UPDATE hotel2_rooms SET status = "Ocupada" WHERE id = ?', [roomId]);

    await db.run(
      'INSERT INTO hotel2_transactions (type, category, amount, date, description) VALUES ("Ingreso", "Hospedaje", ?, ?, ?)',
      [amount, transactionDate, `Abono/Pago de hospedaje: ${guest.name} (Hab. ${room.number})`]
    );

    res.json({ message: 'Pago registrado con éxito y fecha de cobro extendida.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar pago.' });
  }
};

exports.checkoutGuest = async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await db.get('SELECT * FROM hotel2_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }

    await db.run('DELETE FROM hotel2_guests WHERE room_id = ?', [roomId]);
    await db.run('UPDATE hotel2_rooms SET status = "Libre" WHERE id = ?', [roomId]);

    res.json({ message: 'Habitación liberada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al realizar check-out.' });
  }
};

exports.createTransaction = async (req, res) => {
  const { type, category, amount, date, description } = req.body;

  if (!type || !category || !amount) {
    return res.status(400).json({ error: 'Tipo, categoría y monto son obligatorios.' });
  }

  const transactionDate = date || getTodayString();

  try {
    await db.run(
      'INSERT INTO hotel2_transactions (type, category, amount, date, description) VALUES (?, ?, ?, ?, ?)',
      [type, category, amount, transactionDate, description || '']
    );
    res.status(201).json({ message: 'Transacción registrada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar transacción.' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await db.query(
      'SELECT * FROM hotel2_transactions ORDER BY date DESC, id DESC LIMIT 100'
    );
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
};
